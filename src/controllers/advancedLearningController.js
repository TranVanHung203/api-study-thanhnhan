import mongoose from 'mongoose';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';
import OverstudyConfig from '../models/overstudyConfig.schema.js';
import Class from '../models/class.schema.js';
import User from '../models/user.schema.js';
import Chapter from '../models/chapter.schema.js';
import Lesson from '../models/lesson.schema.js';
import LessonCompletion from '../models/lessonCompletion.schema.js';
import ChapterCompletion from '../models/chapterCompletion.schema.js';
import Progress from '../models/progress.schema.js';
import BadRequestError from '../errors/badRequestError.js';
import NotFoundError from '../errors/notFoundError.js';
import { selectClassController } from './classController.js';

const PASS_PERCENT = 80;

const normalizeOptionalId = (value) => {
  if (value === undefined || value === null) return '';
  const normalized = String(value).trim();
  if (!normalized) return '';
  if (normalized.toLowerCase() === 'null') return '';
  return normalized;
};

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

const QUESTION_PUBLIC_PROJECTION = {
  _id: 1,
  quizId: 1,
  questionText: 1,
  rawQuestion: 1,
  imageQuestion: 1,
  choices: 1,
  questionType: 1,
  detailType: 1,
  hintVoice: 1,
  createdAt: 1
};

const shuffleArray = (arr) => {
  const clone = [...arr];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
};

const sampleQuestions = async ({ quizIds, limit, extraMatch = {}, excludedIds = [] }) => {
  const size = Number(limit);
  if (!Number.isFinite(size) || size <= 0) return [];

  const match = {
    quizId: { $in: quizIds },
    ...extraMatch
  };

  if (excludedIds.length > 0) {
    match._id = { $nin: excludedIds };
  }

  return Question.aggregate([
    { $match: match },
    { $sample: { size: Math.trunc(size) } },
    { $project: QUESTION_PUBLIC_PROJECTION }
  ]);
};

const markPreviousChapterAndLessonCompleted = async ({ userId, classId, chapterId }) => {
  const currentChapter = await Chapter.findById(chapterId).select('_id classId order').lean();
  if (!currentChapter) {
    throw new NotFoundError('Chapter khong ton tai');
  }

  if (String(currentChapter.classId) !== String(classId)) {
    throw new BadRequestError('chapterId khong thuoc classId da truyen');
  }

  if (!Number.isFinite(Number(currentChapter.order))) {
    throw new BadRequestError('Chapter hien tai khong co order hop le');
  }

  const previousChapters = await Chapter.find({
    classId,
    order: { $lt: Number(currentChapter.order) }
  })
    .select('_id')
    .lean();

  const markedChapters = previousChapters.length;
  if (previousChapters.length === 0) {
    return { markedChapters, markedLessons: 0 };
  }

  const now = new Date();
  const previousChapterIds = previousChapters.map((chapter) => chapter._id);
  const chapterOps = previousChapterIds.map((id) => ({
    updateOne: {
      filter: {
        userId,
        chapterId: id
      },
      update: {
        $set: {
          isCompleted: true,
          completedAt: now
        },
        $setOnInsert: {
          userId,
          chapterId: id,
          createdAt: now
        }
      },
      upsert: true
    }
  }));
  await ChapterCompletion.bulkWrite(chapterOps, { ordered: false });

  const previousLessons = await Lesson.find({ chapterId: { $in: previousChapterIds } })
    .select('_id')
    .lean();

  const markedLessons = previousLessons.length;
  if (previousLessons.length === 0) {
    return { markedChapters, markedLessons };
  }

  const bulkOps = previousLessons.map((lesson) => ({
    updateOne: {
      filter: {
        userId,
        lessonId: lesson._id
      },
      update: {
        $set: {
          isCompleted: true,
          completedAt: now
        },
        $setOnInsert: {
          userId,
          lessonId: lesson._id,
          createdAt: now
        }
      },
      upsert: true
    }
  }));

  await LessonCompletion.bulkWrite(bulkOps, { ordered: false });
  return { markedChapters, markedLessons };
};

export const getAdvancedLearningQuestionsController = async (req, res, next) => {
  try {
    const rawClassId = normalizeOptionalId(req.query?.classId);
    const rawChapterId = normalizeOptionalId(req.query?.chapterId);
    const isChapterFlow = Boolean(rawChapterId);
    const userId = req.user?.id || req.user?._id;

    // Must provide exactly one of classId or chapterId
    if ((rawClassId && rawChapterId) || (!rawClassId && !rawChapterId)) {
      throw new BadRequestError('Vui long truyen 1 trong 2: classId hoac chapterId (khong duoc truyen ca hai)');
    }

    let classId = null;
    let overstudyConfig = null;
    let classDoc = null;

    if (rawClassId) {
      if (!mongoose.Types.ObjectId.isValid(rawClassId)) {
        throw new BadRequestError('classId khong hop le');
      }
      classId = rawClassId;
      classDoc = await Class.findById(classId).select('_id className order').lean();
      if (!classDoc) {
        throw new NotFoundError('Lop khong ton tai');
      }
      overstudyConfig = await OverstudyConfig.findOne({ classId, chapterId: null }).lean();
      if (!overstudyConfig) {
        throw new NotFoundError('Khong tim thay overstudyConfig cho class nay');
      }
    } else {
      // chapterId path
      if (!mongoose.Types.ObjectId.isValid(rawChapterId)) {
        throw new BadRequestError('chapterId khong hop le');
      }

      const chapter = await Chapter.findById(rawChapterId).select('classId').lean();
      if (!chapter || !chapter.classId) {
        throw new NotFoundError('Chapter hoac class khong ton tai cho chapterId nay');
      }

      classId = String(chapter.classId);
      classDoc = await Class.findById(classId).select('_id className order').lean();
      if (!classDoc) {
        throw new NotFoundError('Lop khong ton tai');
      }

      overstudyConfig = await OverstudyConfig.findOne({ chapterId: rawChapterId }).lean();
      if (!overstudyConfig) {
        throw new NotFoundError('Khong tim thay overstudyConfig cho chapter nay');
      }
    }

    if (userId) {
      const userDoc = await User.findById(userId).select('_id classId').lean();
      if (!userDoc) {
        throw new NotFoundError('Khong tim thay nguoi dung');
      }

      if (!isChapterFlow && userDoc.classId && mongoose.Types.ObjectId.isValid(String(userDoc.classId))) {
        const currentClassDoc = await Class.findById(userDoc.classId).select('_id order').lean();
        if (currentClassDoc && Number(classDoc.order) <= Number(currentClassDoc.order)) {
          return res.status(200).json({
            classId,
            alreadyUnlocked: true,
            message: 'Ban da mo khoa lop hoc nay roi',
            totalQuestions: 0,
            questions: []
          });
        }
      }
    }

    const quizFilter = isChapterFlow
      ? { chapterId: rawChapterId }
      : { classId };

    const quizzes = await Quiz.find(quizFilter)
      .select('_id title description classId bonusPoints totalQuestions createdAt')
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    if (quizzes.length === 0) {
      return res.status(200).json({
        classId,
        classInfo: classDoc,
        configId: overstudyConfig._id,
        requestedTotal: Number(overstudyConfig.total) || 0,
        totalQuizzes: 0,
        totalQuestions: 0,
        quizzes: [],
        questions: []
      });
    }

    const requestedTotal = Number(overstudyConfig.total);
    if (!Number.isInteger(requestedTotal) || requestedTotal <= 0) {
      throw new BadRequestError('overstudyConfig khong hop le: total phai la so nguyen duong');
    }

    const quizIds = quizzes.map((quiz) => quiz._id);
    const parts = Array.isArray(overstudyConfig.parts)
      ? overstudyConfig.parts.filter((part) =>
        part &&
        typeof part.type === 'string' &&
        part.type.trim() &&
        Number.isInteger(Number(part.count)) &&
        Number(part.count) > 0)
      : [];

    const selectedQuestions = [];
    const selectedIdSet = new Set();

    const appendUnique = (docs) => {
      for (const doc of docs) {
        const id = String(doc._id);
        if (selectedIdSet.has(id)) continue;
        selectedIdSet.add(id);
        selectedQuestions.push(doc);
      }
    };

    for (const part of parts) {
      const partType = String(part.type).trim();
      const partCount = Number(part.count);

      const docs = await sampleQuestions({
        quizIds,
        limit: partCount,
        excludedIds: Array.from(selectedIdSet),
        extraMatch: {
          detailType: partType
        }
      });

      appendUnique(docs);
    }

    if (selectedQuestions.length < requestedTotal) {
      const remaining = requestedTotal - selectedQuestions.length;
      const topup = await sampleQuestions({
        quizIds,
        limit: remaining,
        excludedIds: Array.from(selectedIdSet)
      });
      appendUnique(topup);
    }

    const questions = selectedQuestions.length > requestedTotal
      ? shuffleArray(selectedQuestions).slice(0, requestedTotal)
      : shuffleArray(selectedQuestions);

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
    const rawClassId = normalizeOptionalId(req.body?.classId);
    const rawChapterId = normalizeOptionalId(req.body?.chapterId);
    const isChapterFlow = Boolean(rawChapterId);
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      throw new BadRequestError('Khong the xac dinh duoc user');
    }

    if ((rawClassId && rawChapterId) || (!rawClassId && !rawChapterId)) {
      throw new BadRequestError('Vui long truyen 1 trong 2: classId hoac chapterId (khong duoc truyen ca hai)');
    }

    let classId = rawClassId;
    let targetChapterId = rawChapterId || null;

    if (rawClassId) {
      if (!mongoose.Types.ObjectId.isValid(rawClassId)) {
        throw new BadRequestError('classId khong hop le');
      }
    } else {
      if (!mongoose.Types.ObjectId.isValid(rawChapterId)) {
        throw new BadRequestError('chapterId khong hop le');
      }

      const chapter = await Chapter.findById(rawChapterId).select('_id classId order').lean();
      if (!chapter) {
        throw new NotFoundError('Chapter khong ton tai');
      }

      classId = String(chapter.classId);
      targetChapterId = String(chapter._id);
    }

    if (!mongoose.Types.ObjectId.isValid(classId)) {
      throw new BadRequestError('classId khong hop le');
    }

    const classDoc = await Class.findById(classId).select('_id className order').lean();
    if (!classDoc) {
      throw new NotFoundError('Lop khong ton tai');
    }

    const userDoc = await User.findById(userId).select('_id classId').lean();
    if (!userDoc) {
      throw new NotFoundError('Khong tim thay nguoi dung');
    }

    if (!isChapterFlow && userDoc.classId && mongoose.Types.ObjectId.isValid(String(userDoc.classId))) {
      const currentClassDoc = await Class.findById(userDoc.classId).select('_id order').lean();
      if (currentClassDoc && Number(classDoc.order) <= Number(currentClassDoc.order)) {
        return res.status(200).json({
          classId,
          alreadyUnlocked: true,
          passed: false,
          classSelected: false,
          score: null,
          message: 'Ban da mo khoa lop hoc nay roi'
        });
      }
    }

    const quizFilter = isChapterFlow
      ? { chapterId: targetChapterId }
      : { classId };

    const quizzes = await Quiz.find(quizFilter).select('_id classId chapterId').lean();
    if (quizzes.length === 0) {
      throw new BadRequestError(
        isChapterFlow
          ? 'Khong tim thay quiz nao cho chapter nay'
          : 'Khong tim thay quiz nao cho class nay'
      );
    }

    const quizIds = quizzes.map((quiz) => quiz._id);
    const questions = await Question.find({ quizId: { $in: quizIds } })
      .select('_id quizId choices answer')
      .lean();

    if (questions.length === 0) {
      throw new BadRequestError('Khong tim thay cau hoi nao cho class nay');
    }

    const answerByQuestionId = new Map();
    for (const item of answers) {
      const questionId = String(item?.questionId || '').trim();
      if (!questionId) continue;
      answerByQuestionId.set(questionId, item?.userAnswer);
    }

    let correctCount = 0;
    for (const question of questions) {
      const qid = String(question._id);
      const userAnswer = answerByQuestionId.get(qid);
      const isCorrect = compareAnswer(question, userAnswer);
      if (isCorrect) {
        correctCount += 1;
      }
    }

    const totalQuestions = questions.length;
    const percentCorrect = (correctCount / totalQuestions) * 100;
    const passed = percentCorrect >= PASS_PERCENT;

    let classSelected = false;
    if (passed) {
      if (isChapterFlow && targetChapterId) {
        const markedResult = await markPreviousChapterAndLessonCompleted({
          userId,
          classId,
          chapterId: targetChapterId
        });

        return res.status(200).json({
          classId,
          chapterId: targetChapterId,
          alreadyUnlocked: false,
          passed,
          classSelected: false,
          markedChapters: markedResult.markedChapters,
          markedLessons: markedResult.markedLessons,
          score: {
            correct: correctCount,
            total: totalQuestions,
            percent: Number(percentCorrect.toFixed(2)),
            requiredPercent: PASS_PERCENT
          },
          message: passed ? 'Hoc vuot thanh cong' : 'Chua dat 80% de hoc vuot'
        });
      }

      const selected = await invokeSelectClassController({ req, classId });
      if (!selected || selected.statusCode >= 400) {
        throw new BadRequestError(selected?.payload?.message || 'Khong the gan classId cho user');
      }
      classSelected = true;
    }

    return res.status(200).json({
      classId,
      chapterId: targetChapterId,
      alreadyUnlocked: false,
      passed,
      classSelected,
      score: {
        correct: correctCount,
        total: totalQuestions,
        percent: Number(percentCorrect.toFixed(2)),
        requiredPercent: PASS_PERCENT
      },
      message: passed ? 'Hoc vuot thanh cong' : 'Chua dat 80% de hoc vuot'
    });
  } catch (error) {
    next(error);
  }
};
