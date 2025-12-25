import QuizAttempt from '../models/quizAttempt.schema.js';
import QuizSession from '../models/quizSession.schema.js';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';
import mongoose from 'mongoose';

import UserActivity from '../models/userActivity.schema.js';
import Progress from '../models/progress.schema.js';
import Skill from '../models/skill.schema.js';
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
export const startQuizSession = async (req, res, next) => {
  try {
    const { id: progressId } = req.params; // progressId
    // Expect body: { total: number, parts: [{ type, count, order }] }
    const { total, parts } = req.body || {};
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) throw new UnauthorizedError('Unauthorized');

    // Find the quiz associated with this progressId
    const quiz = await Quiz.findOne({ progressId });
    if (!quiz) throw new NotFoundError('Không tìm thấy quiz cho progress này');

    // New flow: require `total` and `parts` in request body (no fallback to old ?count)
    if (!total || !Array.isArray(parts) || parts.length === 0) {
      throw new BadRequestError('Yêu cầu body chứa `total` và `parts` (mảng các phần)');
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

    // Process parts in order (by `order`) and sample randomly within each type
    const partsSorted = [...parts].sort((a, b) => a.order - b.order);
    const selectedIds = [];

    for (const part of partsSorted) {
      // Ensure all ids in selectedIds are ObjectId
      const selectedObjectIds = selectedIds.map(id =>
        (typeof id === 'string' || typeof id === 'number') ? new mongoose.Types.ObjectId(id) : id
      );
      // New behavior: use detailType (not questionType) to select questions.
      // First check if there are any questions of this detailType at all for this quiz
      const totalOfDetail = await Question.countDocuments({ quizId: quiz._id, detailType: part.type });
      if (totalOfDetail === 0) {
        throw new NotFoundError(`Không tìm thấy detailType='${part.type}' trong quiz này`);
      }

      // count available questions of this detailType for this quiz, excluding already selected
      const avail = await Question.countDocuments({ quizId: quiz._id, detailType: part.type, _id: { $nin: selectedObjectIds } });
      if (avail < part.count) {
        throw new BadRequestError(`Không đủ câu cho phần detailType='${part.type}' (cần ${part.count}, có ${avail})`);
      }

      // sample `part.count` randomly from remaining pool of this detailType
      const sample = await Question.aggregate([
        { $match: { quizId: quiz._id, detailType: part.type, _id: { $nin: selectedObjectIds } } },
        { $sample: { size: part.count } },
        { $project: { _id: 1 } }
      ]);
      for (const s of sample) selectedIds.push(s._id);
    }

    const questionIds = selectedIds;

    // create session with expiry (e.g., 2 hours) - expiresAt used by TTL
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const session = await QuizSession.create({ userId, progressId, quizId: quiz._id, questionIds, expiresAt });

    // Minimal response as requested
    return res.status(201).json({ sessionId: session._id, total: questionIds.length });
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

    // Lấy skill hiện tại
    const currentSkill = await Skill.findById(currentProgress.skillId);
    if (!currentSkill) throw new NotFoundError('Skill không tìm thấy');

    // ========== KIỂM TRA SKILL TRƯỚC ĐÃ HOÀN THÀNH CHƯA ==========
    if (currentSkill.order > 1) {
      const currentSkillProgresses = await Progress.find({ skillId: currentSkill._id });
      const currentSkillProgressIds = currentSkillProgresses.map(p => p._id);
      const hasStartedCurrentSkill = await UserActivity.exists({
        userId,
        progressId: { $in: currentSkillProgressIds },
        isCompleted: true
      });
      if (!hasStartedCurrentSkill) {
        const previousSkill = await Skill.findOne({
          chapterId: currentSkill.chapterId,
          order: currentSkill.order - 1
        });
        if (previousSkill) {
          const previousSkillProgresses = await Progress.find({ skillId: previousSkill._id });
          const previousProgressIds = previousSkillProgresses.map(p => p._id);
          const completedPreviousActivities = await UserActivity.find({
            userId,
            progressId: { $in: previousProgressIds },
            isCompleted: true
          });
          if (completedPreviousActivities.length < previousSkillProgresses.length) {
            const e = new BadRequestError(`Bạn cần hoàn thành skill trước: ${previousSkill.skillName}`);
            e.requiredSkillId = previousSkill._id;
            e.requiredSkillName = previousSkill.skillName;
            e.completedSteps = completedPreviousActivities.length;
            e.totalSteps = previousSkillProgresses.length;
            throw e;
          }
        }
      }
    }

    // ========== KIỂM TRA CÁC STEP TRƯỚC TRONG CÙNG SKILL ==========
    const currentStepNumber = currentProgress.stepNumber;
    if (currentStepNumber > 1) {
      const previousSteps = await Progress.find({
        skillId: currentProgress.skillId,
        stepNumber: { $lt: currentStepNumber }
      });
      const previousStepIds = previousSteps.map(p => p._id);
      const completedPreviousSteps = await UserActivity.find({
        userId,
        progressId: { $in: previousStepIds },
        isCompleted: true
      });
      const allSkillProgresses = await Progress.find({ skillId: currentProgress.skillId });
      const allSkillProgressIds = allSkillProgresses.map(p => p._id);
      const userCompletedInSkill = await UserActivity.find({
        userId,
        progressId: { $in: allSkillProgressIds },
        isCompleted: true
      });
      const completedStepNumbers = new Set();
      let maxCompletedInSkill = 0;
      for (const activity of userCompletedInSkill) {
        const step = allSkillProgresses.find(p => p._id.toString() === activity.progressId.toString());
        if (step) {
          completedStepNumbers.add(step.stepNumber);
          if (step.stepNumber > maxCompletedInSkill) maxCompletedInSkill = step.stepNumber;
        }
      }
      for (let s = 1; s <= maxCompletedInSkill; s++) completedStepNumbers.add(s);
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
      // Already completed before — do nothing (keep original completed state)
      await QuizSession.deleteOne({ _id: sessionId });
      return res.status(200).json({
        isCorrect: true,
        message: 'Quiz đã hoàn thành trước đó',
        bonusEarned: existingActivity.bonusEarned || 0,
        correctCount: existingActivity.score || correctCount,
        totalQuestions,
        percentCorrect: existingActivity.score || percentCorrect,
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
