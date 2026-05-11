import User from '../models/user.schema.js';
import UserStreak from '../models/userStreak.schema.js';

const normalizeTimezone = (value, fallback = 'UTC') => {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (!candidate) return fallback;
  try {
    // Validate IANA timezone
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch (error) {
    return fallback;
  }
};

const formatDateInTimezone = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
};

const shiftDateByDays = (date, days) => {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const sanitizeRecentCheckins = (checkedInDates, timezone) => {
  if (!Array.isArray(checkedInDates)) return null;

  const now = new Date();
  const today = formatDateInTimezone(now, timezone);
  const oldestAllowed = formatDateInTimezone(shiftDateByDays(now, -29), timezone);

  return Array.from(new Set(
    checkedInDates
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => DATE_PATTERN.test(value))
      .filter((value) => value >= oldestAllowed && value <= today)
  )).sort();
};

const addCheckinDateAndTrim = (recentCheckins, dateKey) => {
  const source = Array.isArray(recentCheckins) ? recentCheckins : [];
  const next = new Set(source);
  next.add(dateKey);
  return Array.from(next).sort().slice(-30);
};

export const getMyStreakController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } })
      .select('_id')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User không tìm thấy' });
    }

    const streak = await UserStreak.findOne({ userId: user._id }).lean();

    if (!streak) {
      return res.status(200).json({
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
        streakStartDate: null,
        timezone: 'UTC'
      });
    }

    return res.status(200).json({
      currentStreak: streak.currentStreak || 0,
      longestStreak: streak.longestStreak || 0,
      lastActiveDate: streak.lastActiveDate || null,
      streakStartDate: streak.streakStartDate || null,
      timezone: streak.timezone || 'UTC'
    });
  } catch (error) {
    next(error);
  }
};

export const checkInStreakController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } })
      .select('_id')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User không tìm thấy' });
    }

    const inputTimezone = req.body?.timezone;
    let streak = await UserStreak.findOne({ userId: user._id });

    const fallbackTimezone = streak?.timezone || 'UTC';
    const timezone = normalizeTimezone(inputTimezone, fallbackTimezone);

    if (!streak) {
      const today = formatDateInTimezone(new Date(), timezone);
      streak = await UserStreak.create({
        userId: user._id,
        timezone,
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: today,
        streakStartDate: today,
        recentCheckins: [today]
      });

      return res.status(200).json({
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastActiveDate: streak.lastActiveDate,
        streakStartDate: streak.streakStartDate,
        timezone: streak.timezone,
        alreadyCheckedIn: false
      });
    }

    if (timezone !== streak.timezone) {
      streak.timezone = timezone;
    }

    const now = new Date();
    const today = formatDateInTimezone(now, timezone);
    const yesterday = formatDateInTimezone(shiftDateByDays(now, -1), timezone);

    if (streak.lastActiveDate === today) {
      streak.recentCheckins = addCheckinDateAndTrim(streak.recentCheckins, today);
      await streak.save();
      return res.status(200).json({
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastActiveDate: streak.lastActiveDate,
        streakStartDate: streak.streakStartDate,
        timezone: streak.timezone,
        alreadyCheckedIn: true
      });
    }

    if (streak.lastActiveDate === yesterday) {
      streak.currentStreak += 1;
    } else {
      streak.currentStreak = 1;
      streak.streakStartDate = today;
    }

    if (streak.currentStreak > (streak.longestStreak || 0)) {
      streak.longestStreak = streak.currentStreak;
    }

    streak.lastActiveDate = today;
    streak.recentCheckins = addCheckinDateAndTrim(streak.recentCheckins, today);
    await streak.save();

    return res.status(200).json({
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastActiveDate: streak.lastActiveDate,
      streakStartDate: streak.streakStartDate,
      timezone: streak.timezone,
      alreadyCheckedIn: false
    });
  } catch (error) {
    next(error);
  }
};

export const saveRecent30DaysCheckinsController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } })
      .select('_id')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User không tìm thấy' });
    }

    const inputTimezone = req.body?.timezone;
    let streak = await UserStreak.findOne({ userId: user._id });
    const fallbackTimezone = streak?.timezone || 'UTC';
    const timezone = normalizeTimezone(inputTimezone, fallbackTimezone);

    if (!streak) {
      streak = new UserStreak({
        userId: user._id,
        timezone
      });
    } else if (timezone !== streak.timezone) {
      streak.timezone = timezone;
    }

    const checkedInDates = req.body?.checkedInDates;
    const sanitizedDates = sanitizeRecentCheckins(checkedInDates, timezone);

    if (sanitizedDates === null) {
      return res.status(400).json({
        message: 'checkedInDates phải là mảng ngày dạng YYYY-MM-DD trong 30 ngày gần nhất'
      });
    }

    streak.recentCheckins = sanitizedDates;
    await streak.save();

    return res.status(200).json({
      message: 'Lưu lịch sử điểm danh 30 ngày thành công',
      timezone: streak.timezone,
      recentCheckins: streak.recentCheckins,
      totalCheckedInDays: streak.recentCheckins.length
    });
  } catch (error) {
    next(error);
  }
};
