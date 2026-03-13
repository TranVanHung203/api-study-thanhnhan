import QuizAttempt from '../models/quizAttempt.schema.js';
import Progress from '../models/progress.schema.js';
import mongoose from 'mongoose';

const parseDateOnly = (value) => {
  const raw = String(value).trim();
  let day;
  let month;
  let year;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    year = y;
    month = m;
    day = d;
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split('/').map(Number);
    year = y;
    month = m;
    day = d;
  } else {
    return null;
  }

  const date = new Date(year, month - 1, day);
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return isValid ? date : null;
};

const parseDateParam = (value, endOfDay = false) => {
  if (!value) return null;

  const dateOnly = parseDateOnly(value);
  if (dateOnly) {
    if (endOfDay) {
      dateOnly.setHours(23, 59, 59, 999);
    } else {
      dateOnly.setHours(0, 0, 0, 0);
    }
    return dateOnly;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
};

const normalizeText = (text) => {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[\u0111\u0110]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
};

export const getQuizAttemptsController = async (req, res, next) => {
  try {
    const pageRaw = parseInt(req.query.page, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
    const limit = Number.isNaN(limitRaw) ? 20 : Math.max(1, Math.min(100, limitRaw));
    const skip = (page - 1) * limit;
    const hasUserIdParam = typeof req.params.userId === 'string' && req.params.userId.trim() !== '';
    const sortDirection = hasUserIdParam ? -1 : 1;

    const { date, fromDate, toDate } = req.query;
    const userId = req.params.userId || req.query.userId || req.user?.id || req.user?._id;
    const lessonId = req.params.lessonId || req.query.lessonId;
    const matchStage = {};

    if (!userId) {
      return res.status(401).json({ message: 'Khong xac dinh duoc user dang dang nhap.' });
    }

    if (!lessonId) {
      return res.status(400).json({ message: 'lessonId la bat buoc.' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId khong hop le.' });
    }

    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ message: 'lessonId khong hop le.' });
    }

    matchStage.userId = new mongoose.Types.ObjectId(userId);

    const progressList = await Progress.find({ lessonId: new mongoose.Types.ObjectId(lessonId) })
      .select('_id progressName')
      .lean();

    const practiceProgress = progressList.find((item) => normalizeText(item.progressName) === 'luyen tap');

    if (!practiceProgress) {
      return res.status(404).json({ message: 'Khong tim thay progress "Luyen tap" trong lesson nay.' });
    }

    matchStage.progressId = practiceProgress._id;

    // Priority: exact day filter via `date`; fallback to range via fromDate/toDate.
    if (date) {
      const startDate = parseDateParam(date, false);
      const endDate = parseDateParam(date, true);

      if (!startDate || !endDate) {
        return res.status(400).json({ message: 'date khong hop le. Dung yyyy-mm-dd, dd/MM/yyyy hoac ISO date.' });
      }

      matchStage.createdAt = { $gte: startDate, $lte: endDate };
    } else {
      const startDate = fromDate ? parseDateParam(fromDate, false) : null;
      const endDate = toDate ? parseDateParam(toDate, true) : null;

      if (fromDate && !startDate) {
        return res.status(400).json({ message: 'fromDate khong hop le. Dung yyyy-mm-dd, dd/MM/yyyy hoac ISO date.' });
      }

      if (toDate && !endDate) {
        return res.status(400).json({ message: 'toDate khong hop le. Dung yyyy-mm-dd, dd/MM/yyyy hoac ISO date.' });
      }

      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = startDate;
        if (endDate) matchStage.createdAt.$lte = endDate;
      }
    }

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' }
    ];

    pipeline.push(
      { $sort: { createdAt: sortDirection, _id: sortDirection } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          attempts: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: 'questions',
                localField: 'details.questionId',
                foreignField: '_id',
                as: 'questions'
              }
            },
            {
              $project: {
                _id: 1,
                score: 1,
                isCompleted: 1,
                createdAt: 1,
                fullName: '$user.fullName',
                details: {
                  $map: {
                    input: { $ifNull: ['$details', []] },
                    as: 'detail',
                    in: {
                      $let: {
                        vars: {
                          questionDoc: {
                            $first: {
                              $filter: {
                                input: '$questions',
                                as: 'q',
                                cond: { $eq: ['$$q._id', '$$detail.questionId'] }
                              }
                            }
                          }
                        },
                        in: {
                          questionText: '$$questionDoc.questionText',
                          imageQuestion: '$$questionDoc.imageQuestion',
                          choice: '$$questionDoc.choices',
                          questionType: '$$questionDoc.questionType',
                          rawQuestion: '$$questionDoc.rawQuestion',
                          userAnswer: '$$detail.userAnswer',
                          isCorrect: '$$detail.isCorrect',
                          isCorrectAnswer: '$$detail.correctAnswer'
                        }
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    );

    const [result] = await QuizAttempt.aggregate(pipeline);
    const total = result?.metadata?.[0]?.total || 0;
    const attempts = result?.attempts || [];

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      attempts
    });
  } catch (error) {
    next(error);
  }
};

export default { getQuizAttemptsController };
