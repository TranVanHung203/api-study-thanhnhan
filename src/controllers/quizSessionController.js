import QuizSession from '../models/quizSession.schema.js';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';
import mongoose from 'mongoose';

import UserActivity from '../models/userActivity.schema.js';
import Progress from '../models/progress.schema.js';
import Skill from '../models/skill.schema.js';
import Reward from '../models/reward.schema.js';

// Helper to compare ids (ObjectId or string)
const idEquals = (a, b) => {
  if (!a || !b) return false;
  if (typeof a.equals === 'function') return a.equals(b);
  return String(a) === String(b);
};

// Start a quiz session: select `count` random questions from a quiz under the given progress
export const startQuizSession = async (req, res) => {
  try {
    const { id: progressId } = req.params; // progressId
    // Expect body: { total: number, parts: [{ type, count, order }] }
    const { total, parts } = req.body || {};
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Find the quiz associated with this progressId
    const quiz = await Quiz.findOne({ progressId });
    if (!quiz) return res.status(404).json({ message: 'Không tìm thấy quiz cho progress này' });

    // New flow: require `total` and `parts` in request body (no fallback to old ?count)
    if (!total || !Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ message: 'Yêu cầu body chứa `total` và `parts` (mảng các phần)' });
    }

    // Validate parts: each must have type (string), count (positive int), order (int)
    let sum = 0;
    for (const p of parts) {
      if (!p || typeof p.type !== 'string' || !Number.isInteger(p.count) || p.count <= 0 || !Number.isInteger(p.order)) {
        return res.status(400).json({ message: 'Mỗi phần phải có `type`(string), `count`(positive int), `order`(int)' });
      }
      sum += p.count;
    }
    if (sum !== Number(total)) {
      return res.status(400).json({ message: 'Tổng số câu các phần phải bằng `total`' });
    }

    // Process parts in order (by `order`) and sample randomly within each type
    const partsSorted = [...parts].sort((a, b) => a.order - b.order);
    const selectedIds = [];

    for (const part of partsSorted) {
      // Ensure all ids in selectedIds are ObjectId
      const selectedObjectIds = selectedIds.map(id =>
        (typeof id === 'string' || typeof id === 'number') ? new mongoose.Types.ObjectId(id) : id
      );
      // count available questions of this type for this quiz, excluding already selected
      const avail = await Question.countDocuments({ quizId: quiz._id, questionType: part.type, _id: { $nin: selectedObjectIds } });
      if (avail < part.count) {
        return res.status(400).json({ message: `Không đủ câu cho phần type='${part.type}' (cần ${part.count}, có ${avail})` });
      }

      // sample `part.count` randomly from remaining pool of this type
      const sample = await Question.aggregate([
        { $match: { quizId: quiz._id, questionType: part.type, _id: { $nin: selectedObjectIds } } },
        { $sample: { size: part.count } },
        { $project: { _id: 1 } }
      ]);
      for (const s of sample) selectedIds.push(s._id);
    }

    const questionIds = selectedIds;

    // create session with expiry (e.g., 2 hours) - expiresAt used by TTL
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    // remove any existing session for this user+progress
    await QuizSession.deleteMany({ userId, progressId });

    const session = await QuizSession.create({ userId, progressId, quizId: quiz._id, questionIds, expiresAt });

    // Minimal response as requested
    return res.status(201).json({ sessionId: session._id, total: questionIds.length });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// Get paginated questions from an existing session
export const getSessionQuestions = async (req, res) => {
  try {
    const { id: progressId } = req.params;
    const { page = 1, sessionId } = req.query;
    const perPage = 10;
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });

    const session = await QuizSession.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Session không tồn tại' });

    // verify ownership and progress to be safe
    if (!idEquals(session.userId, userId) || !idEquals(session.progressId, progressId)) {
      return res.status(404).json({ message: 'Session không tồn tại' });
    }

    const total = session.questionIds.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const p = Math.max(1, parseInt(page, 10));
    const start = (p - 1) * perPage;
    const end = start + perPage;
    const slice = session.questionIds.slice(start, end);

    // fetch question docs
    const questions = await Question.find({ _id: { $in: slice } }).sort({ order: 1 });
    const questionsNoAnswer = questions.map(q => {
      const obj = q.toObject();
      if ('answer' in obj) delete obj.answer;
      if ('correctAnswer' in obj) delete obj.correctAnswer;
      return obj;
    });

    return res.status(200).json({ page: p, perPage, total, totalPages, questions: questionsNoAnswer});
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// Submit session (clear session data)
export const submitQuizSession = async (req, res) => {
  try {
    const { id: progressId } = req.params;
    const { sessionId, answers } = req.body; // answers: [{ questionId, userAnswer }]
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });

    // Lấy progress hiện tại
    const currentProgress = await Progress.findById(progressId);
    if (!currentProgress) return res.status(404).json({ message: 'Progress không tìm thấy' });

    // Kiểm tra đã hoàn thành quiz này chưa
    const existingActivity = await UserActivity.findOne({ userId, progressId, isCompleted: true });
    if (existingActivity) {
      return res.status(201).json({
        message: 'Quiz đã hoàn thành trước đây',
        userActivity: existingActivity,
        isCheck: true
      });
    }

    // Lấy skill hiện tại
    const currentSkill = await Skill.findById(currentProgress.skillId);
    if (!currentSkill) return res.status(404).json({ message: 'Skill không tìm thấy' });

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
            return res.status(400).json({
              message: `Bạn cần hoàn thành skill trước: ${previousSkill.skillName}`,
              requiredSkillId: previousSkill._id,
              requiredSkillName: previousSkill.skillName,
              completedSteps: completedPreviousActivities.length,
              totalSteps: previousSkillProgresses.length
            });
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
          return res.status(400).json({
            message: `Bạn cần hoàn thành step ${i} trước khi làm step ${currentStepNumber}`,
            requiredStep: i,
            currentStep: currentStepNumber
          });
        }
      }
    }

    // ========== XỬ LÝ QUIZ SESSION ========== (giữ logic cũ)
    const session = await QuizSession.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Session không tồn tại' });
    if (!idEquals(session.userId, userId) || !idEquals(session.progressId, progressId)) {
      return res.status(404).json({ message: 'Session không tồn tại' });
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
    const questionDocs = await Question.find({ _id: { $in: providedQuestionIds } });
    const questionById = new Map();
    for (const q of questionDocs) questionById.set(String(q._id), q);
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
        details.push({ questionId: qid, isCorrect: false, reason: 'Question not found' });
        continue;
      }
      const result = evaluateAnswer(q, userAnswer);
      if (result.isCorrect) correctCount += 1;
    }

    // Nếu đúng > 50% thì coi là hoàn thành, cộng điểm
    const totalQuestions = session.questionIds.length;
    const percentCorrect = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    if (percentCorrect >= 50) {
      // Kiểm tra đã từng cộng điểm thưởng cho progress này chưa
      let bonusEarned = 0;
      let shouldAddBonus = true;
      const existedBonus = await UserActivity.findOne({ userId, progressId, isCompleted: true, bonusEarned: { $gt: 0 } });
      if (existedBonus) {
        shouldAddBonus = false;
      }
      try {
        if (shouldAddBonus) {
          const quiz = await Quiz.findOne({ progressId: currentProgress._id });
          if (quiz && quiz.bonusPoints) bonusEarned = quiz.bonusPoints;
        }
      } catch (err) {}

      const userActivity = new UserActivity({
        userId,
        progressId,
        contentType: 'quiz',
        score: percentCorrect,
        isCompleted: true,
        bonusEarned
      });
      await userActivity.save();
      if (shouldAddBonus && bonusEarned > 0) {
        await Reward.findOneAndUpdate(
          { userId },
          { $inc: { totalPoints: bonusEarned } },
          { new: true, upsert: true }
        );
      }
      await QuizSession.deleteOne({ _id: sessionId });
      return res.status(201).json({
        isCorrect: true,
        message: shouldAddBonus ? 'Quiz hoàn thành (>50% đúng), đã cộng điểm thưởng' : 'Quiz hoàn thành (>50% đúng), không cộng thêm điểm',
        bonusEarned,
        correctCount,
        totalQuestions,
        percentCorrect,
        isCheck: false
      });
    } else {
      // Không đủ 50% đúng
      await QuizSession.deleteOne({ _id: sessionId });
      return res.status(200).json({
        isCorrect: false,
        message: 'Bạn cần đúng trên 50% số câu hỏi',
        correctCount,
        totalQuestions,
        percentCorrect,
        isCheck: false
      });
    }
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export default { startQuizSession, getSessionQuestions, submitQuizSession };
