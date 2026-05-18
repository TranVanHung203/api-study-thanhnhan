import User from '../models/user.schema.js';
import UserStreak from '../models/userStreak.schema.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeTimezone = (value, fallback = 'UTC') => {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (!candidate) return fallback;
  try {
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

const parseDateKeyToUtcDate = (dateKey) => {
  if (!DATE_PATTERN.test(dateKey || '')) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const addDaysToDateKey = (dateKey, days) => {
  const date = parseDateKeyToUtcDate(dateKey);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const isValidYearNumber = (value) => Number.isInteger(value) && value >= 1970 && value <= 9999;
const isValidMonthNumber = (value) => Number.isInteger(value) && value >= 1 && value <= 12;

const getWeekStartMonday = (dateKey) => {
  const date = parseDateKeyToUtcDate(dateKey);
  if (!date) return null;
  const day = date.getUTCDay(); // 0 = Sun, 1 = Mon
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDaysToDateKey(dateKey, diffToMonday);
};

const countDaysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const buildCheckedInSet = (dailyCheckins) => {
  if (!Array.isArray(dailyCheckins)) return new Set();
  return new Set(
    dailyCheckins
      .filter((entry) => entry?.checkedIn === true && DATE_PATTERN.test(entry?.date || ''))
      .map((entry) => entry.date)
  );
};

const resolveStreakStatus = (lastActiveDate, today, yesterday) => {
  if (!DATE_PATTERN.test(lastActiveDate || '')) {
    return 'none';
  }

  if (lastActiveDate === today) {
    return 'completed_today';
  }

  if (lastActiveDate === yesterday) {
    return 'pending_today';
  }

  return 'broken';
};

const pushHistoryEntries = (streak, entries) => {
  if (!Array.isArray(entries) || entries.length === 0) return;
  if (!Array.isArray(streak.dailyCheckins)) streak.dailyCheckins = [];
  streak.dailyCheckins.push(...entries);
};

const backfillMissedDays = (streak, targetDateExclusiveEnd) => {
  if (!DATE_PATTERN.test(streak.firstCheckInDate || '')) return;

  const currentHistoryEnd = streak.lastHistoryDate || streak.lastActiveDate || streak.firstCheckInDate;

  if (!DATE_PATTERN.test(currentHistoryEnd || '') || currentHistoryEnd >= targetDateExclusiveEnd) {
    return;
  }

  const entries = [];
  let cursor = addDaysToDateKey(currentHistoryEnd, 1);

  while (cursor && cursor < targetDateExclusiveEnd) {
    entries.push({ date: cursor, checkedIn: false });
    cursor = addDaysToDateKey(cursor, 1);
  }

  pushHistoryEntries(streak, entries);

  const lastFilled = addDaysToDateKey(targetDateExclusiveEnd, -1);
  if (lastFilled && lastFilled > (streak.lastHistoryDate || '')) {
    streak.lastHistoryDate = lastFilled;
  }
};

const addOrTouchTodayCheckin = (streak, today) => {
  if (!Array.isArray(streak.dailyCheckins)) streak.dailyCheckins = [];

  const lastEntry = streak.dailyCheckins[streak.dailyCheckins.length - 1];
  if (lastEntry?.date === today) {
    lastEntry.checkedIn = true;
  } else {
    streak.dailyCheckins.push({ date: today, checkedIn: true });
  }

  if (!streak.firstCheckInDate) {
    streak.firstCheckInDate = today;
  }

  if (!streak.lastHistoryDate || streak.lastHistoryDate < today) {
    streak.lastHistoryDate = today;
  }
};

const hydrateLegacyHistory = (streak) => {
  if (Array.isArray(streak.dailyCheckins) && streak.dailyCheckins.length > 0) {
    if (!streak.firstCheckInDate) {
      streak.firstCheckInDate = streak.dailyCheckins[0]?.date || null;
    }

    if (!streak.lastHistoryDate) {
      streak.lastHistoryDate = streak.dailyCheckins[streak.dailyCheckins.length - 1]?.date || null;
    }

    return;
  }

  const lastActiveDate = DATE_PATTERN.test(streak.lastActiveDate || '') ? streak.lastActiveDate : null;
  const streakStartDate = DATE_PATTERN.test(streak.streakStartDate || '') ? streak.streakStartDate : null;
  const legacyRecentCheckins = Array.isArray(streak.get('recentCheckins'))
    ? streak.get('recentCheckins').filter((date) => DATE_PATTERN.test(date))
    : [];
  const firstCheckInDate = streak.firstCheckInDate || streakStartDate || lastActiveDate;

  if (!firstCheckInDate) return;

  streak.firstCheckInDate = firstCheckInDate;

  if (lastActiveDate) {
    const checkedInDates = new Set(legacyRecentCheckins);
    checkedInDates.add(lastActiveDate);

    const entries = [];
    let cursor = firstCheckInDate;

    while (cursor && cursor <= lastActiveDate) {
      entries.push({ date: cursor, checkedIn: checkedInDates.has(cursor) });
      cursor = addDaysToDateKey(cursor, 1);
    }

    streak.dailyCheckins = entries;
    streak.lastHistoryDate = lastActiveDate;
    return;
  }

  streak.dailyCheckins = [{ date: firstCheckInDate, checkedIn: true }];
  streak.lastHistoryDate = firstCheckInDate;
};

const buildGetResponse = (streak, status) => ({
  currentStreak: streak?.currentStreak || 0,
  longestStreak: streak?.longestStreak || 0,
  lastActiveDate: streak?.lastActiveDate || null,
  streakStartDate: streak?.streakStartDate || null,
  timezone: streak?.timezone || 'UTC',
  hasCompletedToday: status === 'completed_today',
  streakStatus: status
});

export const getMyStreakController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } })
      .select('_id')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const streak = await UserStreak.findOne({ userId: user._id });

    if (!streak) {
      return res.status(200).json({
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
        streakStartDate: null,
        timezone: 'UTC',
        hasCompletedToday: false,
        streakStatus: 'none'
      });
    }

    hydrateLegacyHistory(streak);

    const timezone = normalizeTimezone(streak.timezone, 'UTC');
    if (timezone !== streak.timezone) {
      streak.timezone = timezone;
    }

    const today = formatDateInTimezone(new Date(), timezone);
    const yesterday = addDaysToDateKey(today, -1);

    const status = resolveStreakStatus(streak.lastActiveDate, today, yesterday);

    if (status === 'broken') {
      backfillMissedDays(streak, today);
      if (streak.currentStreak !== 0 || streak.streakStartDate) {
        streak.currentStreak = 0;
        streak.streakStartDate = null;
      }
    }

    if (streak.isModified()) {
      await streak.save();
    }

    const responseStatus = resolveStreakStatus(streak.lastActiveDate, today, yesterday);
    return res.status(200).json(buildGetResponse(streak, responseStatus));
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
      return res.status(404).json({ message: 'User not found' });
    }

    const inputTimezone = req.body?.timezone;
    let streak = await UserStreak.findOne({ userId: user._id });

    const fallbackTimezone = streak?.timezone || 'UTC';
    const timezone = normalizeTimezone(inputTimezone, fallbackTimezone);
    const today = formatDateInTimezone(new Date(), timezone);
    const yesterday = addDaysToDateKey(today, -1);

    if (!streak) {
      streak = await UserStreak.create({
        userId: user._id,
        timezone,
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: today,
        streakStartDate: today,
        firstCheckInDate: today,
        lastHistoryDate: today,
        dailyCheckins: [{ date: today, checkedIn: true }]
      });

      return res.status(200).json({
        ...buildGetResponse(streak, 'completed_today'),
        alreadyCheckedIn: false
      });
    }

    hydrateLegacyHistory(streak);

    if (timezone !== streak.timezone) {
      streak.timezone = timezone;
    }

    if (streak.lastActiveDate === today) {
      addOrTouchTodayCheckin(streak, today);
      await streak.save();
      return res.status(200).json({
        ...buildGetResponse(streak, 'completed_today'),
        alreadyCheckedIn: true
      });
    }

    backfillMissedDays(streak, today);

    if (streak.lastActiveDate === yesterday) {
      streak.currentStreak = (streak.currentStreak || 0) + 1;
    } else {
      streak.currentStreak = 1;
      streak.streakStartDate = today;
    }

    streak.longestStreak = Math.max(streak.longestStreak || 0, streak.currentStreak || 0);
    streak.lastActiveDate = today;

    addOrTouchTodayCheckin(streak, today);

    await streak.save();

    return res.status(200).json({
      ...buildGetResponse(streak, 'completed_today'),
      alreadyCheckedIn: false
    });
  } catch (error) {
    next(error);
  }
};

export const getStreakSummaryController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } })
      .select('_id')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const streak = await UserStreak.findOne({ userId: user._id });
    if (!streak) {
      return res.status(200).json({
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
        streakStartDate: null,
        timezone: 'UTC',
        hasCompletedToday: false,
        streakStatus: 'none'
      });
    }

    hydrateLegacyHistory(streak);

    const requestedTimezone = typeof req.query?.timezone === 'string' ? req.query.timezone : null;
    const timezone = normalizeTimezone(requestedTimezone, normalizeTimezone(streak.timezone, 'UTC'));
    if (timezone !== streak.timezone) {
      streak.timezone = timezone;
    }

    const today = formatDateInTimezone(new Date(), timezone);
    const yesterday = addDaysToDateKey(today, -1);
    const status = resolveStreakStatus(streak.lastActiveDate, today, yesterday);

    if (status === 'broken') {
      backfillMissedDays(streak, today);
      if (streak.currentStreak !== 0 || streak.streakStartDate) {
        streak.currentStreak = 0;
        streak.streakStartDate = null;
      }
    }

    if (streak.isModified()) {
      await streak.save();
    }

    const responseStatus = resolveStreakStatus(streak.lastActiveDate, today, yesterday);
    return res.status(200).json(buildGetResponse(streak, responseStatus));
  } catch (error) {
    next(error);
  }
};

export const getWeeklyStreakController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } })
      .select('_id')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const streak = await UserStreak.findOne({ userId: user._id });
    const fallbackTimezone = streak?.timezone || 'UTC';
    const timezone = normalizeTimezone(req.query?.timezone, fallbackTimezone);

    let weekStart = typeof req.query?.weekStart === 'string' ? req.query.weekStart.trim() : '';
    if (weekStart && !DATE_PATTERN.test(weekStart)) {
      return res.status(400).json({ message: 'weekStart must be YYYY-MM-DD' });
    }

    if (!weekStart) {
      const today = formatDateInTimezone(new Date(), timezone);
      weekStart = getWeekStartMonday(today);
    } else {
      const normalizedWeekStart = getWeekStartMonday(weekStart);
      if (!normalizedWeekStart) {
        return res.status(400).json({ message: 'weekStart must be YYYY-MM-DD' });
      }
      weekStart = normalizedWeekStart;
    }

    const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const checkedInSet = buildCheckedInSet(streak?.dailyCheckins);
    const days = weekdays.map((weekday, index) => {
      const isoDate = addDaysToDateKey(weekStart, index);
      return {
        isoDate,
        weekday,
        checkedIn: checkedInSet.has(isoDate)
      };
    });

    return res.status(200).json({
      timezone,
      weekStart,
      weekEnd: addDaysToDateKey(weekStart, 6),
      days
    });
  } catch (error) {
    next(error);
  }
};

export const getYearStreakController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const year = Number(req.params?.year);
    if (!isValidYearNumber(year)) {
      return res.status(400).json({ message: 'year must be between 1970 and 9999' });
    }

    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } })
      .select('_id')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const streak = await UserStreak.findOne({ userId: user._id });
    const timezone = normalizeTimezone(req.query?.timezone, streak?.timezone || 'UTC');
    const checkedInSet = buildCheckedInSet(streak?.dailyCheckins);

    const months = [];
    let totalCheckedInDays = 0;

    for (let month = 1; month <= 12; month += 1) {
      const daysInMonth = countDaysInMonth(year, month);
      const monthLabel = String(month).padStart(2, '0');
      const days = [];
      let checkedInCount = 0;

      for (let day = 1; day <= daysInMonth; day += 1) {
        const isoDate = `${year}-${monthLabel}-${String(day).padStart(2, '0')}`;
        const checkedIn = checkedInSet.has(isoDate);
        if (checkedIn) checkedInCount += 1;
        days.push({ isoDate, checkedIn });
      }

      totalCheckedInDays += checkedInCount;
      months.push({
        month,
        checkedInCount,
        totalDays: daysInMonth,
        days
      });
    }

    return res.status(200).json({
      year,
      timezone,
      totalCheckedInDays,
      months
    });
  } catch (error) {
    next(error);
  }
};

export const getMonthStreakController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const year = Number(req.params?.year);
    const month = Number(req.params?.month);

    if (!isValidYearNumber(year)) {
      return res.status(400).json({ message: 'year must be between 1970 and 9999' });
    }
    if (!isValidMonthNumber(month)) {
      return res.status(400).json({ message: 'month must be between 1 and 12' });
    }

    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } })
      .select('_id')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const streak = await UserStreak.findOne({ userId: user._id });
    const timezone = normalizeTimezone(req.query?.timezone, streak?.timezone || 'UTC');
    const checkedInSet = buildCheckedInSet(streak?.dailyCheckins);
    const daysInMonth = countDaysInMonth(year, month);
    const monthLabel = String(month).padStart(2, '0');

    const days = [];
    let checkedInCount = 0;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const isoDate = `${year}-${monthLabel}-${String(day).padStart(2, '0')}`;
      const checkedIn = checkedInSet.has(isoDate);
      if (checkedIn) checkedInCount += 1;
      days.push({ isoDate, checkedIn });
    }

    return res.status(200).json({
      year,
      month,
      timezone,
      checkedInCount,
      totalDays: daysInMonth,
      days
    });
  } catch (error) {
    next(error);
  }
};

export const updateStreakTimezoneController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } })
      .select('_id')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const inputTimezone = req.body?.timezone;
    if (typeof inputTimezone !== 'string' || !inputTimezone.trim()) {
      return res.status(400).json({ message: 'timezone is required' });
    }

    const timezone = normalizeTimezone(inputTimezone, '');
    if (!timezone) {
      return res.status(400).json({ message: 'timezone is invalid' });
    }

    let streak = await UserStreak.findOne({ userId: user._id });
    if (!streak) {
      streak = await UserStreak.create({
        userId: user._id,
        timezone
      });
    } else if (streak.timezone !== timezone) {
      streak.timezone = timezone;
      await streak.save();
    }

    return res.status(200).json({
      message: 'Timezone updated',
      timezone: streak.timezone
    });
  } catch (error) {
    next(error);
  }
};

const sanitizeHistoricalCheckins = (checkedInDates) => {
  if (!Array.isArray(checkedInDates)) return null;

  return Array.from(
    new Set(
      checkedInDates
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => DATE_PATTERN.test(value))
    )
  ).sort();
};

export const saveRecent30DaysCheckinsController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } })
      .select('_id')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
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
    const sanitizedDates = sanitizeHistoricalCheckins(checkedInDates);

    if (sanitizedDates === null) {
      return res.status(400).json({
        message: 'checkedInDates must be an array of YYYY-MM-DD'
      });
    }

    if (sanitizedDates.length === 0) {
      streak.currentStreak = 0;
      streak.lastActiveDate = null;
      streak.streakStartDate = null;
      streak.firstCheckInDate = null;
      streak.lastHistoryDate = null;
      streak.dailyCheckins = [];
      await streak.save();

      return res.status(200).json({
        message: 'Saved checkin history',
        timezone: streak.timezone,
        totalDays: 0,
        totalCheckedInDays: 0
      });
    }

    const firstDate = sanitizedDates[0];
    const lastDate = sanitizedDates[sanitizedDates.length - 1];
    const checkedInSet = new Set(sanitizedDates);

    const dailyCheckins = [];
    let cursor = firstDate;

    while (cursor && cursor <= lastDate) {
      dailyCheckins.push({
        date: cursor,
        checkedIn: checkedInSet.has(cursor)
      });
      cursor = addDaysToDateKey(cursor, 1);
    }

    streak.firstCheckInDate = firstDate;
    streak.lastHistoryDate = lastDate;
    streak.dailyCheckins = dailyCheckins;
    streak.lastActiveDate = lastDate;

    let currentStreak = 0;
    for (let i = dailyCheckins.length - 1; i >= 0; i -= 1) {
      if (!dailyCheckins[i].checkedIn) break;
      currentStreak += 1;
    }

    streak.currentStreak = currentStreak;
    streak.longestStreak = Math.max(streak.longestStreak || 0, currentStreak);

    if (currentStreak > 0) {
      streak.streakStartDate = addDaysToDateKey(lastDate, -(currentStreak - 1));
    } else {
      streak.streakStartDate = null;
    }

    await streak.save();

    return res.status(200).json({
      message: 'Saved full checkin history',
      timezone: streak.timezone,
      firstCheckInDate: streak.firstCheckInDate,
      lastHistoryDate: streak.lastHistoryDate,
      totalDays: streak.dailyCheckins.length,
      totalCheckedInDays: sanitizedDates.length
    });
  } catch (error) {
    next(error);
  }
};
