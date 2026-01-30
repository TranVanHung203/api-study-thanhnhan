import QuizAttempt from '../models/quizAttempt.schema.js';
import QuizSession from '../models/quizSession.schema.js';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';
import QuizConfig from '../models/quizConfig.schema.js';
import mongoose from 'mongoose';

import UserActivity from '../models/userActivity.schema.js';
import Progress from '../models/progress.schema.js';
import Lesson from '../models/lesson.schema.js';
import Reward from '../models/reward.schema.js';
import BadRequestError from '../errors/badRequestError.js';
import NotFoundError from '../errors/notFoundError.js';
import UnauthorizedError from '../errors/unauthorizedError.js';
import ForbiddenError from '../errors/forbiddenError.js';

// Helper to compare ids (ObjectId or string)
const idEquals = (a, b) => {
  if (!a || !b) return false;
  if (typeof a.equals === 'function') return a.equals(b);
  return String(a) === String(b);
};

// Start a quiz session: select `count` random questions from a quiz under the given progress
// Optimized: parallel fetch, single aggregate query, in-memory sampling
export const startQuizSession = async (req, res, next) => {
  try {
    const { id: progressId } = req.params;
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) throw new UnauthorizedError('Unauthorized');

    // Parallel fetch: QuizConfig and Quiz at the same time
    const [config, quiz] = await Promise.all([
      QuizConfig.findOne({ progressId }),
      Quiz.findOne({ progressId })
    ]);

    if (!config) throw new BadRequestError('Không tìm thấy cấu hình quiz cho progress này');
    if (!quiz) throw new NotFoundError('Không tìm thấy quiz cho progress này');

    const { total, parts } = config;

    if (!total || !Array.isArray(parts) || parts.length === 0) {
      throw new BadRequestError('Cấu hình quiz không hợp lệ: thiếu `total` hoặc `parts`');
    }

    // Validate parts: each must have type (string), count (positive int), order (int)
    let sum = 0;
    for (const p of parts) {
      if (!p || typeof p.type !== 'string' || !Number.isInteger(p.count) || p.count <= 0 || !Number.isInteger(p.order)) {
        throw new BadRequestError('Mỗi phần phải có `type`(string), `count`(positive int), `order`(int)');
      }
      sum += p.count;
    }
    if (sum !== Number(total)) {
      throw new BadRequestError('Tổng số câu các phần phải bằng `total`');
    }

    // Sort parts by order
    const partsSorted = [...parts].sort((a, b) => a.order - b.order);
    
    // Get unique detailTypes needed
    const detailTypes = [...new Set(partsSorted.map(p => p.type))];
    
    // Single aggregate query: fetch all question IDs grouped by detailType
    // This replaces multiple countDocuments + aggregate calls per part
    const questionsByType = await Question.aggregate([
      { $match: { quizId: quiz._id, detailType: { $in: detailTypes } } },
      { $group: { _id: '$detailType', ids: { $push: '$_id' } } }
    ]);

    // Build a map of detailType -> array of question IDs
    const typeIdsMap = new Map();
    for (const item of questionsByType) {
      typeIdsMap.set(item._id, item.ids);
    }

    // Validate availability and perform in-memory random sampling
    const selectedIds = [];
    const usedIdSet = new Set();

    for (const part of partsSorted) {
      const allIds = typeIdsMap.get(part.type);
      
      if (!allIds || allIds.length === 0) {
        throw new NotFoundError(`Không tìm thấy detailType='${part.type}' trong quiz này`);
      }

      // Filter out already used ids (for cases where same detailType appears in multiple parts)
      const availableIds = allIds.filter(id => !usedIdSet.has(String(id)));
      
      if (availableIds.length < part.count) {
        throw new BadRequestError(`Không đủ câu cho phần detailType='${part.type}' (cần ${part.count}, có ${availableIds.length})`);
      }

      // Fisher-Yates shuffle and take first `part.count` elements (in-memory random sampling)
      const shuffled = [...availableIds];
      const n = shuffled.length;
      const sampleSize = Math.min(part.count, n);
      for (let i = 0; i < sampleSize; i++) {
        const j = i + Math.floor(Math.random() * (n - i));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const sampled = shuffled.slice(0, sampleSize);

      for (const id of sampled) {
        selectedIds.push(id);
        usedIdSet.add(String(id));
      }
    }

    // Create session with expiry (2 hours) - expiresAt used by TTL
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const session = await QuizSession.create({ userId, progressId, quizId: quiz._id, questionIds: selectedIds, expiresAt });

    return res.status(201).json({ sessionId: session._id, total: selectedIds.length });
  } catch (err) {
    next(err);
  }
};

// Get paginated questions from an existing session
export const getSessionQuestions = async (req, res, next) => {
  try {
    const { id: progressId } = req.params;
    const { page = 1, sessionId } = req.query;
    const perPage = 10;
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) throw new UnauthorizedError('Unauthorized');

    if (!sessionId) throw new BadRequestError('sessionId is required');

    const session = await QuizSession.findById(sessionId);
    if (!session) throw new NotFoundError('Session không tồn tại');

    // verify ownership and progress to be safe
    if (!idEquals(session.userId, userId) || !idEquals(session.progressId, progressId)) {
      throw new NotFoundError('Session không tồn tại');
    }

    const total = session.questionIds.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const p = Math.max(1, parseInt(page, 10));
    const start = (p - 1) * perPage;
    const end = start + perPage;
    const slice = session.questionIds.slice(start, end);

    // fetch question docs and preserve the order as in session.questionIds
    const questionDocs = await Question.find({ _id: { $in: slice } });
    // Build a map from id -> doc for quick lookup
    const questionMap = new Map();
    for (const q of questionDocs) questionMap.set(String(q._id), q);

    const questionsNoAnswer = slice.map(id => {
      const q = questionMap.get(String(id));
      if (!q) return null;
      const obj = q.toObject();
      if ('answer' in obj) delete obj.answer;
      if ('correctAnswer' in obj) delete obj.correctAnswer;
      if('order' in obj) delete obj.order;
      return obj;
    }).filter(Boolean);

    return res.status(200).json({ page: p, perPage, total, totalPages, questions: questionsNoAnswer });
  } catch (err) {
    next(err);
  }
};

// Submit session (clear session data)
export const submitQuizSession = async (req, res, next) => {
  try {
    const { id: progressId } = req.params;
    const { sessionId, answers } = req.body; // answers: [{ questionId, userAnswer }]
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) throw new UnauthorizedError('Unauthorized');
    if (!sessionId) throw new BadRequestError('sessionId is required');

    // Lấy progress hiện tại
    const currentProgress = await Progress.findById(progressId);
    if (!currentProgress) throw new NotFoundError('Progress không tìm thấy');

    // Previously we returned early if the quiz was already completed.
    // Change: allow multiple attempts and always record each attempt in history.
    // Bonus awarding is still guarded later so points are added only once.

    // Lấy Lesson hiện tại
    const currentLesson = await Lesson.findById(currentProgress.LessonId);
    if (!currentLesson) throw new NotFoundError('Lesson không tìm thấy');

    // ========== KIỂM TRA Lesson TRƯỚC ĐÃ HOÀN THÀNH CHƯA ==========
    if (currentLesson.order > 1) {
      const currentLessonProgresses = await Progress.find({ LessonId: currentLesson._id });
      const currentLessonProgressIds = currentLessonProgresses.map(p => p._id);
      const hasStartedCurrentLesson = await UserActivity.exists({
        userId,
        progressId: { $in: currentLessonProgressIds },
        isCompleted: true
      });
      if (!hasStartedCurrentLesson) {
        const previousLesson = await Lesson.findOne({
          chapterId: currentLesson.chapterId,
          order: currentLesson.order - 1
        });
        if (previousLesson) {
          const previousLessonProgresses = await Progress.find({ LessonId: previousLesson._id });
          const previousProgressIds = previousLessonProgresses.map(p => p._id);
          const completedPreviousActivities = await UserActivity.find({
            userId,
            progressId: { $in: previousProgressIds },
            isCompleted: true
          });
          if (completedPreviousActivities.length < previousLessonProgresses.length) {
            const e = new BadRequestError(`Bạn cần hoàn thành Lesson trước: ${previousLesson.LessonName}`);
            e.requiredLessonId = previousLesson._id;
            e.requiredLessonName = previousLesson.LessonName;
            e.completedSteps = completedPreviousActivities.length;
            e.totalSteps = previousLessonProgresses.length;
            throw e;
          }
        }
      }
    }

    // ========== KIỂM TRA CÁC STEP TRƯỚC TRONG CÙNG Lesson ==========
    const currentStepNumber = currentProgress.stepNumber;
    if (currentStepNumber > 1) {
      const previousSteps = await Progress.find({
        LessonId: currentProgress.LessonId,
        stepNumber: { $lt: currentStepNumber }
      });
      const previousStepIds = previousSteps.map(p => p._id);
      const completedPreviousSteps = await UserActivity.find({
        userId,
        progressId: { $in: previousStepIds },
        isCompleted: true
      });
      const allLessonProgresses = await Progress.find({ LessonId: currentProgress.LessonId });
      const allLessonProgressIds = allLessonProgresses.map(p => p._id);
      const userCompletedInLesson = await UserActivity.find({
        userId,
        progressId: { $in: allLessonProgressIds },
        isCompleted: true
      });
      const completedStepNumbers = new Set();
      let maxCompletedInLesson = 0;
      for (const activity of userCompletedInLesson) {
        const step = allLessonProgresses.find(p => p._id.toString() === activity.progressId.toString());
        if (step) {
          completedStepNumbers.add(step.stepNumber);
          if (step.stepNumber > maxCompletedInLesson) maxCompletedInLesson = step.stepNumber;
        }
      }
      for (let s = 1; s <= maxCompletedInLesson; s++) completedStepNumbers.add(s);
      for (let i = 1; i < currentStepNumber; i++) {
        if (!completedStepNumbers.has(i)) {
          const e = new BadRequestError(`Bạn cần hoàn thành step ${i} trước khi làm step ${currentStepNumber}`);
          e.requiredStep = i;
          e.currentStep = currentStepNumber;
          throw e;
        }
      }
    }

    // ========== XỬ LÝ QUIZ SESSION ========== (giữ logic cũ)
    const session = await QuizSession.findById(sessionId);
    if (!session) throw new NotFoundError('Session không tồn tại');
    if (!idEquals(session.userId, userId) || !idEquals(session.progressId, progressId)) {
      throw new NotFoundError('Session không tồn tại');
    }

    // Nếu không có answers thì chỉ xóa session
    if (!answers || !Array.isArray(answers)) {
      await QuizSession.deleteOne({ _id: sessionId });
      return res.status(200).json({ message: 'Session cleared', totalQuestions: session.questionIds.length });
    }

    // Chấm điểm như cũ
    const answerMap = new Map();
    for (const a of answers) {
      if (!a || !a.questionId) continue;
      answerMap.set(String(a.questionId), a.userAnswer);
    }
    const sessionQuestionIds = session.questionIds.map(q => String(q));
    const providedQuestionIds = Array.from(answerMap.keys()).filter(qid => sessionQuestionIds.includes(qid));

    // If some session questions are missing from provided answers, report as bad request
    const missingQuestionIds = sessionQuestionIds.filter(qid => !providedQuestionIds.includes(qid));
    if (missingQuestionIds.length > 0) {
      throw new BadRequestError(`Thiếu câu trả lời cho ${missingQuestionIds.length} câu hỏi: ${missingQuestionIds.join(',')}`);
    }
    const questionDocs = await Question.find({ _id: { $in: providedQuestionIds } });
    const questionById = new Map();
    for (const q of questionDocs) questionById.set(String(q._id), q);
    // Determine whether the user has any previous quiz activity for this progress
    const hadAnyAttempt = await UserActivity.exists({ userId, progressId, contentType: 'quiz' });
    const isCheckFlag = hadAnyAttempt ? true : false; // first attempt => false, subsequent => true
    const evaluateAnswer = (question, userAnswer) => {
      const storedAnswer = question.answer;
      let isCorrect = false;
      // Helper: lấy text từ đáp án (string hoặc object)
      const getText = (ans) => {
        if (ans == null) return '';
        if (typeof ans === 'string') return ans.trim();
        if (typeof ans === 'object' && ans.text) return String(ans.text).trim();
        return '';
      };
      if (storedAnswer === undefined || storedAnswer === null) {
        isCorrect = false;
      } else if (typeof storedAnswer === 'number') {
        const idx = storedAnswer;
        const correctChoice = question.choices && question.choices[idx];
        if (correctChoice) {
          if (typeof userAnswer === 'number') {
            isCorrect = (userAnswer === idx);
          } else {
            // So sánh text của đáp án
            isCorrect = getText(userAnswer) === getText(correctChoice.text);
          }
        }
      } else if (typeof storedAnswer === 'object' && storedAnswer.text) {
        // Đáp án đúng là object có text
        isCorrect = getText(userAnswer) === getText(storedAnswer.text);
      } else if (typeof storedAnswer === 'string') {
        // Đáp án đúng là string
        isCorrect = getText(userAnswer) === getText(storedAnswer);
      }
      return { isCorrect, correctAnswer: storedAnswer };
    };
    
    let correctCount = 0;
    for (const qid of providedQuestionIds) {
      const q = questionById.get(qid);
      const userAnswer = answerMap.get(qid);
      if (!q) {
        // question doc not found; skip
        continue;
      }
      const result = evaluateAnswer(q, userAnswer);
      if (result.isCorrect) correctCount += 1;
    }

    // Tính phần trăm đúng và lưu attempt vào UserActivity dù pass hay fail
    const totalQuestions = session.questionIds.length;
    const percentCorrect = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

    // Build per-question details for attempt
    const details = [];
    for (const qid of sessionQuestionIds) {
      const q = questionById.get(qid);
      const userAnswer = answerMap.get(qid);
      if (!q) {
        details.push({ questionId: qid, userAnswer, isCorrect: false, correctAnswer: null });
        continue;
      }
      const evalRes = evaluateAnswer(q, userAnswer);
      details.push({ questionId: q._id, userAnswer, isCorrect: !!evalRes.isCorrect, correctAnswer: evalRes.correctAnswer });
    }

    // Save QuizAttempt for this submit (always)
    const attempt = new QuizAttempt({
      userId,
      progressId,
      sessionId: session._id,
      score: percentCorrect,
      isCompleted: percentCorrect >= 50,
      details
    });
    await attempt.save();

    // Upsert single UserActivity per progress: create if missing, otherwise update existing
    let bonusEarned = 0;
    const quiz = await Quiz.findOne({ progressId: currentProgress._id }).catch(() => null);
    if (quiz && quiz.bonusPoints) bonusEarned = quiz.bonusPoints;

    const existingActivity = await UserActivity.findOne({ userId, progressId, contentType: 'quiz' });

    if (!existingActivity) {
      // Create new UserActivity (isCompleted true only if pass)
      const ua = new UserActivity({
        userId,
        progressId,
        contentType: 'quiz',
        score: percentCorrect,
        isCompleted: percentCorrect >= 50,
        bonusEarned: percentCorrect >= 50 ? bonusEarned : 0
      });
      await ua.save();

      // Award reward only if this record is completed now
      if (percentCorrect >= 50 && bonusEarned > 0) {
        await Reward.findOneAndUpdate({ userId }, { $inc: { totalPoints: bonusEarned } }, { new: true, upsert: true });
      }

      await QuizSession.deleteOne({ _id: sessionId });
      return res.status(percentCorrect >= 50 ? 201 : 200).json({
        isCorrect: percentCorrect >= 50,
        message: percentCorrect >= 50 ? 'Quiz hoàn thành (>50% đúng), đã ghi nhận và cộng điểm thưởng nếu có' : 'Quiz chưa hoàn thành, đã ghi nhận lần thử',
        bonusEarned: percentCorrect >= 50 ? bonusEarned : 0,
        correctCount,
        totalQuestions,
        percentCorrect,
        isCheck: isCheckFlag
      });
    }

    // existingActivity found
    if (existingActivity.isCompleted) {
      // Already completed before — do not re-award bonus, but return the
      // freshly computed result for transparency (so client always sees
      // what just happened), and preserve previous bonusEarned value.
      const prevBonus = existingActivity.bonusEarned || 0;
      await QuizSession.deleteOne({ _id: sessionId });
      return res.status(200).json({
        isCorrect: percentCorrect >= 50,
        message: 'Quiz đã hoàn thành trước đó (đã có điểm hoàn thành). Kết quả lần làm mới được ghi nhận nhưng điểm thưởng không được cộng thêm).',
        bonusEarned: prevBonus,
        correctCount,
        totalQuestions,
        percentCorrect,
        isCheck: true
      });
    }

    // existingActivity exists but not completed yet — update it with latest attempt
    existingActivity.score = percentCorrect;
    // If this attempt completes the quiz, mark completed and award bonus
    if (percentCorrect >= 50) {
      existingActivity.isCompleted = true;
      // If previously had no bonus, set and award
      const prevBonus = existingActivity.bonusEarned || 0;
      if (prevBonus <= 0 && bonusEarned > 0) {
        existingActivity.bonusEarned = bonusEarned;
        await Reward.findOneAndUpdate({ userId }, { $inc: { totalPoints: bonusEarned } }, { new: true, upsert: true });
      }
    }

    await existingActivity.save();
    await QuizSession.deleteOne({ _id: sessionId });

    return res.status(percentCorrect >= 50 ? 201 : 200).json({
      isCorrect: percentCorrect >= 50,
      message: percentCorrect >= 50 ? 'Quiz hoàn thành — đã cập nhật trạng thái hoàn thành' : 'Quiz chưa hoàn thành — đã cập nhật lần thử',
      bonusEarned: percentCorrect >= 50 ? (existingActivity.bonusEarned || 0) : 0,
      correctCount,
      totalQuestions,
      percentCorrect,
      isCheck: true
    });
  } catch (err) {
    next(err);
  }
};

export default { startQuizSession, getSessionQuestions, submitQuizSession };
