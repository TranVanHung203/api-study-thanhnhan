import QuizSession from '../models/quizSession.schema.js';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';
import mongoose from 'mongoose';

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
    const { count: countInQuery } = req.query; // optional override via query param
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Find the quiz associated with this progressId
    const quiz = await Quiz.findOne({ progressId });
    if (!quiz) return res.status(404).json({ message: 'Không tìm thấy quiz cho progress này' });

    // Determine count: prefer explicit query value, otherwise use quiz.totalQuestions
    const count = Number.isInteger(Number(countInQuery)) && Number(countInQuery) > 0 ? Number(countInQuery) : (quiz.totalQuestions || 15);

    // sample questions
    const pool = await Question.aggregate([
      { $match: { quizId: quiz._id } },
      { $sample: { size: Number(count) } },
      { $project: { _id: 1 } }
    ]);

    const questionIds = pool.map(p => p._id);

    // create session with expiry (e.g., 2 hours) - expiresAt used by TTL
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    // remove any existing session for this user+progress
    await QuizSession.deleteMany({ userId, progressId });

    const session = await QuizSession.create({ userId, progressId, quizId: quiz._id, questionIds, expiresAt });

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

    const session = await QuizSession.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Session không tồn tại' });

    if (!idEquals(session.userId, userId) || !idEquals(session.progressId, progressId)) {
      return res.status(404).json({ message: 'Session không tồn tại' });
    }

    // If no answers provided, just clear the session
    if (!answers || !Array.isArray(answers)) {
      await QuizSession.deleteOne({ _id: sessionId });
      return res.status(200).json({ message: 'Session cleared', totalQuestions: session.questionIds.length });
    }

    // Build map of provided answers for quick lookup
    const answerMap = new Map();
    for (const a of answers) {
      if (!a || !a.questionId) continue;
      answerMap.set(String(a.questionId), a.userAnswer);
    }

    // Only evaluate answers that belong to this session
    const sessionQuestionIds = session.questionIds.map(q => String(q));
    const providedQuestionIds = Array.from(answerMap.keys()).filter(qid => sessionQuestionIds.includes(qid));

    // Load all relevant question documents
    const questionDocs = await Question.find({ _id: { $in: providedQuestionIds } });
    const questionById = new Map();
    for (const q of questionDocs) questionById.set(String(q._id), q);

    // Helper to evaluate a single answer using the same semantics as checkAnswerController
    const evaluateAnswer = (question, userAnswer) => {
      const storedAnswer = question.answer;
      let isCorrect = false;

      if (storedAnswer === undefined || storedAnswer === null) {
        isCorrect = false;
      } else if (typeof storedAnswer === 'number') {
        const idx = storedAnswer;
        const correctChoice = question.choices && question.choices[idx];
        if (correctChoice) {
          if (typeof userAnswer === 'number') {
            isCorrect = (userAnswer === idx);
          } else if (typeof userAnswer === 'string') {
            isCorrect = (correctChoice.text === userAnswer);
          } else if (userAnswer && userAnswer.text) {
            isCorrect = (correctChoice.text === userAnswer.text);
          }
        }
      } else if (typeof storedAnswer === 'object') {
        if (storedAnswer.text) {
          if (typeof userAnswer === 'string') isCorrect = storedAnswer.text === userAnswer;
          else if (userAnswer && userAnswer.text) isCorrect = storedAnswer.text === userAnswer.text;
        }
      }

      return { isCorrect, correctAnswer: storedAnswer };
    };

    const details = [];
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
      details.push({ questionId: qid, isCorrect: result.isCorrect, correctAnswer: result.correctAnswer });
    }

    // Optionally, you could persist attempt results here (not implemented)

    // Clear session after submit
    await QuizSession.deleteOne({ _id: sessionId });

    return res.status(200).json({
      totalQuestions: session.questionIds.length,
      attempted: providedQuestionIds.length,
      correct: correctCount,
      details
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export default { startQuizSession, getSessionQuestions, submitQuizSession };
