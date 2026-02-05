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

    const shuffleArray = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    // 1) Fetch config + quiz song song
    const [config, quiz] = await Promise.all([
      QuizConfig.findOne({ progressId }).lean(),
      Quiz.findOne({ progressId }).lean(),
    ]);

    if (!config) throw new BadRequestError('Không tìm thấy cấu hình quiz cho progress này');
    if (!quiz) throw new NotFoundError('Không tìm thấy quiz cho progress này');

    const { total, parts } = config;

    if (!total || !Array.isArray(parts) || parts.length === 0) {
      throw new BadRequestError('Cấu hình quiz không hợp lệ: thiếu `total` hoặc `parts`');
    }

    // 2) Validate parts + sum check
    let sum = 0;
    const typeCounts = new Map(); // detailType -> totalCountNeeded

    for (const p of parts) {
      if (!p || typeof p.type !== 'string' || !Number.isInteger(p.count) || p.count <= 0) {
        throw new BadRequestError('Mỗi phần phải có `type`(string), `count`(positive int)');
      }
      sum += p.count;
      typeCounts.set(p.type, (typeCounts.get(p.type) || 0) + p.count);
    }

    if (sum !== Number(total)) {
      throw new BadRequestError('Tổng số câu các phần phải bằng `total`');
    }

    const detailTypes = [...typeCounts.keys()];

    // 3) Aggregation tối ưu: mỗi type sample đúng số câu cần (không kéo hết ids về)
    //   - $facet sẽ trả về object { add: [{_id}], sub: [{_id}], ... }
    const facets = {};
    for (const [type, count] of typeCounts.entries()) {
      // facet key phải là string an toàn (tránh '.' '$'); giả định detailType của bạn là kiểu "add/sub/mul" nên ok
      facets[type] = [
        { $match: { detailType: type } },
        { $sample: { size: count } },
        { $project: { _id: 1 } },
      ];
    }

    const aggRes = await Question.aggregate([
      { $match: { quizId: quiz._id, detailType: { $in: detailTypes } } },
      { $facet: facets },
    ]);

    const buckets = aggRes && aggRes[0] ? aggRes[0] : {};

    // 4) Validate đủ câu cho từng type + gom id
    const selectedIds = [];
    for (const [type, count] of typeCounts.entries()) {
      const docs = buckets[type] || [];
      if (docs.length < count) {
        throw new BadRequestError(
          `Không đủ câu cho phần detailType='${type}' (cần ${count}, có ${docs.length})`
        );
      }
      for (const d of docs) selectedIds.push(d._id);
    }

    // 5) Shuffle toàn bộ câu hỏi để ra A1,S2,A2,... (random order overall)
    const mixedQuestionIds = shuffleArray(selectedIds);

    // 6) Create session (TTL 2 giờ)
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const session = await QuizSession.create({
      userId,
      progressId,
      quizId: quiz._id,
      questionIds: mixedQuestionIds,
      expiresAt,
    });

    return res.status(201).json({ sessionId: session._id, total: mixedQuestionIds.length });
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

    // fetch question docs and preserve the sequence as in session.questionIds
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
      // removed: if('order' in obj) delete obj.order;
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

    // ===================== 1) Load Progress + Lesson =====================
    const currentProgress = await Progress.findById(progressId);
    if (!currentProgress) throw new NotFoundError('Progress không tìm thấy');

    const currentLesson = await Lesson.findById(currentProgress.lessonId);
    if (!currentLesson) throw new NotFoundError('Lesson không tìm thấy');

    // ===================== 2) CHECK: Lesson trước trong cùng chapter (theo order) =====================
    // Lấy lesson trước gần nhất: order < currentLesson.order, sort giảm dần
    const previousLesson = await Lesson.findOne({
      chapterId: currentLesson.chapterId,
      order: { $lt: currentLesson.order },
    }).sort({ order: -1 });

    if (previousLesson) {
      const prevLessonProgresses = await Progress.find({ lessonId: previousLesson._id }).select('_id');
      const prevProgressIds = prevLessonProgresses.map((p) => p._id);

      // Nếu lesson trước có step thì phải hoàn thành đủ
      if (prevProgressIds.length > 0) {
        const completedPrevCount = await UserActivity.countDocuments({
          userId,
          progressId: { $in: prevProgressIds },
          isCompleted: true,
        });

        if (completedPrevCount < prevProgressIds.length) {
          const e = new BadRequestError(`Bạn cần hoàn thành Lesson trước: ${previousLesson.lessonName}`);
          e.requiredLessonId = previousLesson._id;
          e.requiredLessonName = previousLesson.lessonName;
          e.completedSteps = completedPrevCount;
          e.totalSteps = prevProgressIds.length;
          throw e;
        }
      }
    }

    // ===================== 3) CHECK: step trước trong cùng lesson (theo stepNumber) =====================
    const currentStepNumber = Number(currentProgress.stepNumber || 1);

    if (currentStepNumber > 1) {
      const previousSteps = await Progress.find({
        lessonId: currentProgress.lessonId,
        stepNumber: { $lt: currentStepNumber },
      }).select('_id stepNumber');

      const prevStepIds = previousSteps.map((p) => p._id);

      if (prevStepIds.length > 0) {
        const completedActivities = await UserActivity.find({
          userId,
          progressId: { $in: prevStepIds },
          isCompleted: true,
        }).select('progressId');

        const idToStep = new Map(previousSteps.map((p) => [String(p._id), p.stepNumber]));
        const completedSteps = new Set();

        for (const a of completedActivities) {
          const stepNum = idToStep.get(String(a.progressId));
          if (typeof stepNum === 'number') completedSteps.add(stepNum);
        }

        for (let s = 1; s < currentStepNumber; s++) {
          if (!completedSteps.has(s)) {
            const e = new BadRequestError(`Bạn cần hoàn thành step ${s} trước khi làm step ${currentStepNumber}`);
            e.requiredStep = s;
            e.currentStep = currentStepNumber;
            throw e;
          }
        }
      }
    }

    // ===================== 4) Load & validate QuizSession =====================
    const session = await QuizSession.findById(sessionId);
    if (!session) throw new NotFoundError('Session không tồn tại');

    if (!idEquals(session.userId, userId) || !idEquals(session.progressId, progressId)) {
      throw new NotFoundError('Session không tồn tại');
    }

    // Nếu không có answers -> chỉ xoá session
    if (!answers || !Array.isArray(answers)) {
      await QuizSession.deleteOne({ _id: sessionId });
      return res.status(200).json({
        message: 'Session cleared',
        totalQuestions: session.questionIds.length,
      });
    }

    // ===================== 5) Chuẩn hoá answers + check thiếu câu =====================
    const answerMap = new Map();
    for (const a of answers) {
      if (!a || !a.questionId) continue;
      answerMap.set(String(a.questionId), a.userAnswer);
    }

    const sessionQuestionIds = session.questionIds.map((q) => String(q));
    const providedQuestionIds = Array.from(answerMap.keys()).filter((qid) =>
      sessionQuestionIds.includes(qid)
    );

    const missingQuestionIds = sessionQuestionIds.filter((qid) => !providedQuestionIds.includes(qid));
    if (missingQuestionIds.length > 0) {
      throw new BadRequestError(
        `Thiếu câu trả lời cho ${missingQuestionIds.length} câu hỏi: ${missingQuestionIds.join(',')}`
      );
    }

    // Lấy toàn bộ question trong session (để build details đúng thứ tự)
    const questionDocs = await Question.find({ _id: { $in: sessionQuestionIds } });
    const questionById = new Map();
    for (const q of questionDocs) questionById.set(String(q._id), q);

    // first attempt? (dựa vào UserActivity đã có hay chưa)
    const hadAnyAttempt = await UserActivity.exists({ userId, progressId });
    const isCheckFlag = hadAnyAttempt ? true : false;

    // ===================== 6) Chấm điểm =====================
    const getText = (ans) => {
      if (ans == null) return '';
      if (typeof ans === 'string') return ans.trim();
      if (typeof ans === 'number') return String(ans).trim();
      if (typeof ans === 'object') {
        if (ans.text != null) return String(ans.text).trim();
        return '';
      }
      return String(ans).trim();
    };

    const evaluateAnswer = (question, userAnswer) => {
      const storedAnswer = question.answer;
      let isCorrect = false;

      if (storedAnswer === undefined || storedAnswer === null) {
        isCorrect = false;
      } else if (typeof storedAnswer === 'number') {
        const idx = storedAnswer;
        const correctChoice = question.choices && question.choices[idx];

        if (typeof userAnswer === 'number') {
          isCorrect = userAnswer === idx;
        } else if (correctChoice) {
          const correctText = getText(correctChoice?.text ?? correctChoice);
          isCorrect = getText(userAnswer) === correctText;
        }
      } else if (typeof storedAnswer === 'object' && storedAnswer.text != null) {
        isCorrect = getText(userAnswer) === getText(storedAnswer.text);
      } else if (typeof storedAnswer === 'string') {
        isCorrect = getText(userAnswer) === getText(storedAnswer);
      }

      return { isCorrect, correctAnswer: storedAnswer };
    };

    let correctCount = 0;
    for (const qid of sessionQuestionIds) {
      const q = questionById.get(qid);
      const userAnswer = answerMap.get(qid);
      if (!q) continue;
      if (evaluateAnswer(q, userAnswer).isCorrect) correctCount += 1;
    }

    const totalQuestions = sessionQuestionIds.length;
    const percentCorrect = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

    // ===================== 7) Lưu QuizAttempt (luôn lưu) =====================
    const details = [];
    for (const qid of sessionQuestionIds) {
      const q = questionById.get(qid);
      const userAnswer = answerMap.get(qid);

      if (!q) {
        details.push({ questionId: qid, userAnswer, isCorrect: false, correctAnswer: null });
        continue;
      }
      const evalRes = evaluateAnswer(q, userAnswer);
      details.push({
        questionId: q._id,
        userAnswer,
        isCorrect: !!evalRes.isCorrect,
        correctAnswer: evalRes.correctAnswer,
      });
    }

    await new QuizAttempt({
      userId,
      progressId,
      sessionId: session._id,
      score: percentCorrect,
      isCompleted: percentCorrect >= 50,
      details,
    }).save();

    // ===================== 8) Bonus & UserActivity (chỉ cộng 1 lần) =====================
    let bonusEarned = 0;
    const quiz = await Quiz.findOne({ progressId: currentProgress._id }).catch(() => null);
    if (quiz?.bonusPoints) bonusEarned = quiz.bonusPoints;

    const existingActivity = await UserActivity.findOne({
      userId,
      progressId,
    });

    // Case A: Chưa có activity => tạo mới
    if (!existingActivity) {
      await new UserActivity({
        userId,
        progressId,
        score: percentCorrect,
        isCompleted: percentCorrect >= 50,
        bonusEarned: percentCorrect >= 50 ? bonusEarned : 0,
      }).save();

      if (percentCorrect >= 50 && bonusEarned > 0) {
        await Reward.findOneAndUpdate(
          { userId },
          { $inc: { totalPoints: bonusEarned } },
          { new: true, upsert: true }
        );
      }

      await QuizSession.deleteOne({ _id: sessionId });

      return res.status(percentCorrect >= 50 ? 201 : 200).json({
        isCorrect: percentCorrect >= 50,
        message:
          percentCorrect >= 50
            ? 'Quiz hoàn thành (>=50% đúng), đã ghi nhận và cộng điểm thưởng nếu có'
            : 'Quiz chưa hoàn thành, đã ghi nhận lần thử',
        bonusEarned: percentCorrect >= 50 ? bonusEarned : 0,
        correctCount,
        totalQuestions,
        percentCorrect,
        isCheck: isCheckFlag,
      });
    }

    // Case B: Đã completed trước đó => không cộng bonus nữa
    if (existingActivity.isCompleted) {
      const prevBonus = existingActivity.bonusEarned || 0;

      await QuizSession.deleteOne({ _id: sessionId });

      return res.status(200).json({
        isCorrect: percentCorrect >= 50,
        message:
          'Quiz đã hoàn thành trước đó. Kết quả lần làm mới được ghi nhận nhưng điểm thưởng không được cộng thêm.',
        bonusEarned: prevBonus,
        correctCount,
        totalQuestions,
        percentCorrect,
        isCheck: true,
      });
    }

    // Case C: Có activity nhưng chưa completed => update, nếu pass thì cộng bonus 1 lần
    existingActivity.score = percentCorrect;

    if (percentCorrect >= 50) {
      existingActivity.isCompleted = true;

      const prevBonus = existingActivity.bonusEarned || 0;
      if (prevBonus <= 0 && bonusEarned > 0) {
        existingActivity.bonusEarned = bonusEarned;

        await Reward.findOneAndUpdate(
          { userId },
          { $inc: { totalPoints: bonusEarned } },
          { new: true, upsert: true }
        );
      }
    }

    await existingActivity.save();
    await QuizSession.deleteOne({ _id: sessionId });

    return res.status(percentCorrect >= 50 ? 201 : 200).json({
      isCorrect: percentCorrect >= 50,
      message:
        percentCorrect >= 50
          ? 'Quiz hoàn thành — đã cập nhật trạng thái hoàn thành'
          : 'Quiz chưa hoàn thành — đã cập nhật lần thử',
      bonusEarned: percentCorrect >= 50 ? (existingActivity.bonusEarned || 0) : 0,
      correctCount,
      totalQuestions,
      percentCorrect,
      isCheck: true,
    });
  } catch (err) {
    next(err);
  }
};


export default { startQuizSession, getSessionQuestions, submitQuizSession };
