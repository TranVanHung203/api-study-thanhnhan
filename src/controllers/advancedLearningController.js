import mongoose from 'mongoose';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';
import Class from '../models/class.schema.js';
import BadRequestError from '../errors/badRequestError.js';
import NotFoundError from '../errors/notFoundError.js';
import { selectClassController } from './classController.js';

const PASS_PERCENT = 80;

const normalizeText = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
};

const toToken = (question, answer) => {
  if (answer === undefined || answer === null) return 'null';

  if (typeof answer === 'number') {
    if (Array.isArray(question?.choices) && question.choices[answer] !== undefined) {
      return `t:${normalizeText(question.choices[answer])}`;
    }
    return `n:${answer}`;
  }

  if (typeof answer === 'string') {
    const trimmed = answer.trim();
    if (/^-?\d+$/.test(trimmed)) {
      const idx = Number.parseInt(trimmed, 10);
      if (Array.isArray(question?.choices) && question.choices[idx] !== undefined) {
        return `t:${normalizeText(question.choices[idx])}`;
      }
      return `n:${idx}`;
    }
    return `t:${normalizeText(trimmed)}`;
  }

  return `j:${normalizeText(JSON.stringify(answer))}`;
};

const compareAnswer = (question, userAnswer) => {
  const storedAnswer = question?.answer;

  if (Array.isArray(storedAnswer)) {
    if (!Array.isArray(userAnswer)) return false;

    const expected = storedAnswer.map((item) => toToken(question, item)).sort();
    const actual = userAnswer.map((item) => toToken(question, item)).sort();
    if (expected.length !== actual.length) return false;
    for (let i = 0; i < expected.length; i += 1) {
      if (expected[i] !== actual[i]) return false;
    }
    return true;
  }

  return toToken(question, userAnswer) === toToken(question, storedAnswer);
};

const invokeSelectClassController = ({ req, classId }) => {
  return new Promise((resolve, reject) => {
    const fakeReq = {
      ...req,
      params: {
        ...(req.params || {}),
        classId
      }
    };

    const fakeRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode || 200, payload });
        return this;
      }
    };

    selectClassController(fakeReq, fakeRes, reject);
  });
};

export const getAdvancedLearningQuestionsController = async (req, res, next) => {
  try {
    const classId = String(req.query.classId || '').trim();
    if (!classId) {
      throw new BadRequestError('Missing classId');
    }
    if (!mongoose.Types.ObjectId.isValid(classId)) {
      throw new BadRequestError('classId không hợp lệ');
    }

    const classDoc = await Class.findById(classId).select('_id name order').lean();
    if (!classDoc) {
      throw new NotFoundError('Lớp không tồn tại');
    }

    const quizzes = await Quiz.find({ classId })
      .select('_id title description classId bonusPoints totalQuestions createdAt')
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    if (quizzes.length === 0) {
      return res.status(200).json({
        classId,
        classInfo: classDoc,
        totalQuizzes: 0,
        totalQuestions: 0,
        quizzes: [],
        questions: []
      });
    }

    const quizIds = quizzes.map((quiz) => quiz._id);
    const questions = await Question.find({ quizId: { $in: quizIds } })
      .select('_id quizId questionText rawQuestion imageQuestion choices questionType detailType hintVoice createdAt')
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    return res.status(200).json({
      totalQuestions: questions.length,
      questions
    });
  } catch (error) {
    next(error);
  }
};

export const submitAdvancedLearningController = async (req, res, next) => {
  try {
    const classId = String(req.body?.classId || '').trim();
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      throw new BadRequestError('Không xác định được user');
    }
    if (!classId) {
      throw new BadRequestError('Missing classId');
    }
    if (!mongoose.Types.ObjectId.isValid(classId)) {
      throw new BadRequestError('classId không hợp lệ');
    }

    const classDoc = await Class.findById(classId).select('_id name order').lean();
    if (!classDoc) {
      throw new NotFoundError('Lớp không tồn tại');
    }

    const quizzes = await Quiz.find({ classId }).select('_id classId').lean();
    if (quizzes.length === 0) {
      throw new BadRequestError('Không tìm thấy quiz nào cho class này');
    }

    const quizIds = quizzes.map((quiz) => quiz._id);
    const questions = await Question.find({ quizId: { $in: quizIds } })
      .select('_id quizId choices answer')
      .lean();

    if (questions.length === 0) {
      throw new BadRequestError('Không tìm thấy câu hỏi nào cho class này');
    }

    const answerByQuestionId = new Map();
    for (const item of answers) {
      const questionId = String(item?.questionId || '').trim();
      if (!questionId) continue;
      answerByQuestionId.set(questionId, item?.userAnswer);
    }

    let correctCount = 0;
    const details = [];

    for (const question of questions) {
      const qid = String(question._id);
      const userAnswer = answerByQuestionId.get(qid);
      const isCorrect = compareAnswer(question, userAnswer);
      if (isCorrect) {
        correctCount += 1;
      }
      details.push({
        questionId: qid,
        isCorrect
      });
    }

    const totalQuestions = questions.length;
    const percentCorrect = (correctCount / totalQuestions) * 100;
    const passed = percentCorrect >= PASS_PERCENT;

    let selectClassResult = null;
    if (passed) {
      const selected = await invokeSelectClassController({ req, classId });
      if (!selected || selected.statusCode >= 400) {
        throw new BadRequestError(selected?.payload?.message || 'Khong the gan classId cho user');
      }
      selectClassResult = selected.payload || null;
    }

    return res.status(200).json({
      classId,
      classInfo: classDoc,
      totalQuestions,
      answeredQuestions: answerByQuestionId.size,
      correctCount,
      percentCorrect: Number(percentCorrect.toFixed(2)),
      passPercent: PASS_PERCENT,
      passed,
      classSelected: !!selectClassResult,
      selectClassResult,
      details
    });
  } catch (error) {
    next(error);
  }
};
