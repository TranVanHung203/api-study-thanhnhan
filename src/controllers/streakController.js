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
        streakStartDate: today
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
