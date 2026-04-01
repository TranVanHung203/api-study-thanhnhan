import mongoose from 'mongoose';
import Question from '../models/question.schema.js';
import Quiz from '../models/quiz.schema.js';
import QuizAttempt from '../models/quizAttempt.schema.js';
import AssignmentAttempt from '../models/assignmentAttempt.schema.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const ALLOWED_SORT_FIELDS = new Set(['createdAt', 'questionText', 'questionType', 'detailType', 'quizId']);
const ALLOWED_CUSTOM_FILTER_FIELDS = new Set(['questionId', 'quizId', 'questionType', 'detailType', 'hintVoice']);

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseBooleanQuery = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return null;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeString = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const buildCustomFilter = (field, value) => {
  if (!ALLOWED_CUSTOM_FILTER_FIELDS.has(field)) {
    return null;
  }

  if (field === 'quizId' || field === 'questionId') {
    const targetField = field === 'questionId' ? '_id' : 'quizId';
    if (Array.isArray(value)) {
      const ids = value.filter((item) => typeof item === 'string' && isValidObjectId(item));
      if (!ids.length) return null;
      return { [targetField]: { $in: ids } };
    }
    if (typeof value === 'string' && isValidObjectId(value)) {
      return { [targetField]: value };
    }
    return null;
  }

  if (Array.isArray(value)) {
    const values = value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => String(item).trim())
      .filter(Boolean);
    if (!values.length) return null;
    return { [field]: { $in: values } };
  }

  const normalized = normalizeString(value);
  if (!normalized) return null;
  return { [field]: normalized };
};

export const getQuestionFilterOptionsController = async (req, res, next) => {
  try {
    const selectedQuestionType = normalizeString(req.query.questionType);
    const detailTypeMatch = { detailType: { $nin: [null, ''] } };
    if (selectedQuestionType) {
      detailTypeMatch.questionType = selectedQuestionType;
    }

    const [questionTypeAgg, detailTypeAgg, detailTypeByQuestionTypeAgg] = await Promise.all([
      Question.aggregate([
        { $match: { questionType: { $nin: [null, ''] } } },
        { $group: { _id: '$questionType', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Question.aggregate([
        { $match: detailTypeMatch },
        { $group: { _id: '$detailType', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Question.aggregate([
        { $match: { questionType: { $nin: [null, ''] }, detailType: { $nin: [null, ''] } } },
        { $group: { _id: { questionType: '$questionType', detailType: '$detailType' }, count: { $sum: 1 } } },
        { $sort: { '_id.questionType': 1, '_id.detailType': 1 } }
      ])
    ]);

    const detailTypesByQuestionType = {};
    for (const row of detailTypeByQuestionTypeAgg) {
      const questionType = row?._id?.questionType;
      const detailType = row?._id?.detailType;
      if (!questionType || !detailType) continue;

      if (!detailTypesByQuestionType[questionType]) {
        detailTypesByQuestionType[questionType] = [];
      }
      detailTypesByQuestionType[questionType].push({
        value: detailType,
        count: row.count
      });
    }

    return res.status(200).json({
      selectedQuestionType: selectedQuestionType || null,
      questionTypes: questionTypeAgg.map((item) => ({
        value: item._id,
        count: item.count
      })),
      detailTypes: detailTypeAgg.map((item) => ({
        value: item._id,
        count: item.count
      })),
      detailTypesByQuestionType
    });
  } catch (error) {
    next(error);
  }
};

export const getAllQuestionsController = async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, DEFAULT_PAGE);
    const requestedLimit = parsePositiveInteger(req.query.limit, DEFAULT_LIMIT);
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const skip = (page - 1) * limit;

    const questionType = normalizeString(req.query.questionType);
    const detailType = normalizeString(req.query.detailType);
    const questionId = normalizeString(req.query.questionId);
    const quizId = normalizeString(req.query.quizId);
    const search = normalizeString(req.query.search);
    const sortBy = ALLOWED_SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortOrder = normalizeString(req.query.sortOrder).toLowerCase() === 'asc' ? 1 : -1;
    const hasImage = parseBooleanQuery(req.query.hasImage);

    if (questionId && !isValidObjectId(questionId)) {
      return res.status(400).json({ message: 'questionId khong hop le' });
    }
    if (quizId && !isValidObjectId(quizId)) {
      return res.status(400).json({ message: 'quizId khong hop le' });
    }

    const andConditions = [];

    if (questionId) andConditions.push({ _id: questionId });
    if (quizId) andConditions.push({ quizId });
    if (questionType) andConditions.push({ questionType });
    if (detailType) andConditions.push({ detailType });

    if (hasImage === true) {
      andConditions.push({ imageQuestion: { $exists: true, $nin: [null, ''] } });
    } else if (hasImage === false) {
      andConditions.push({
        $or: [
          { imageQuestion: { $exists: false } },
          { imageQuestion: null },
          { imageQuestion: '' }
        ]
      });
    }

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      andConditions.push({
        $or: [
          { questionText: regex },
          { detailType: regex },
          { questionType: regex },
          { choices: { $elemMatch: { $regex: regex } } }
        ]
      });
    }

    const createdFrom = normalizeString(req.query.createdFrom);
    const createdTo = normalizeString(req.query.createdTo);
    if (createdFrom || createdTo) {
      const createdAtFilter = {};
      if (createdFrom) {
        const fromDate = new Date(createdFrom);
        if (!Number.isNaN(fromDate.getTime())) {
          createdAtFilter.$gte = fromDate;
        }
      }
      if (createdTo) {
        const toDate = new Date(createdTo);
        if (!Number.isNaN(toDate.getTime())) {
          createdAtFilter.$lte = toDate;
        }
      }
      if (Object.keys(createdAtFilter).length) {
        andConditions.push({ createdAt: createdAtFilter });
      }
    }

    const rawFilters = req.query.filters;
    if (rawFilters) {
      let parsedFilters = null;
      try {
        parsedFilters = typeof rawFilters === 'string' ? JSON.parse(rawFilters) : rawFilters;
      } catch (error) {
        return res.status(400).json({ message: 'filters phai la JSON hop le' });
      }

      if (parsedFilters && typeof parsedFilters === 'object' && !Array.isArray(parsedFilters)) {
        for (const [field, value] of Object.entries(parsedFilters)) {
          const customFilter = buildCustomFilter(field, value);
          if (customFilter) {
            andConditions.push(customFilter);
          }
        }
      }
    }

    const query = andConditions.length ? { $and: andConditions } : {};
    const sort = { [sortBy]: sortOrder };

    const [questions, total] = await Promise.all([
      Question.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Question.countDocuments(query)
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      sortBy,
      sortOrder: sortOrder === 1 ? 'asc' : 'desc',
      questions
    });
  } catch (error) {
    next(error);
  }
};

// Lấy câu hỏi của một quiz
export const getQuestionsByQuizController = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // If random sampling requested, use aggregation $sample to get `limit` random docs
    const random = req.query.random === 'true' || req.query.random === '1';

    if (random) {
      const questions = await Question.aggregate([
        { $match: { quizId: mongoose.Types.ObjectId(quizId) } },
        { $sample: { size: limit } }
      ]);
      const total = await Question.countDocuments({ quizId });
      const totalPages = Math.ceil(total / limit);
      return res.status(200).json({ page: 1, perPage: limit, total, totalPages, questions });
    }

    const [questions, total] = await Promise.all([
      Question.find({ quizId })
        .sort({ order: 1 })
        .skip(skip)
        .limit(limit),
      Question.countDocuments({ quizId })
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({ page, perPage: limit, total, totalPages, questions });
  } catch (error) {
    next(error);
  }
};

// Tạo câu hỏi
export const createQuestionController = async (req, res, next) => {
  try {
    const {
      quizId,
      questionText,
      rawQuestion,
      imageQuestion,
      choices,
      answer,
      questionType,
      detailType,
      hintVoice
    } = req.body;
    // Kiểm tra quiz tồn tại và do user hiện tại tạo
    const quiz = await Quiz.findOne({ _id: quizId, createdBy: req.user.id });
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz không tìm thấy hoặc bạn không có quyền thêm câu hỏi' });
    }

    // Expected `choices` shape: string[] with length >= 2.
    if (!Array.isArray(choices) || choices.length < 2 || choices.some((c) => typeof c !== 'string')) {
      return res.status(400).json({ message: 'choices must be an array with at least two items' });
    }

    if (questionType === 'single') {
      if (typeof answer === 'number') {
        if (answer < 0 || answer >= choices.length) {
          return res.status(400).json({ message: 'answer index out of range' });
        }
      }
    } else if (questionType === 'multiple') {
      // expected array of indices or array of texts
      if (!Array.isArray(answer)) {
        return res.status(400).json({ message: 'answer must be an array for multiple choice questions' });
      }
    }

    const question = new Question({
      quizId,
      questionText,
      rawQuestion,
      imageQuestion,
      choices,
      answer,
      questionType,
      detailType,
      hintVoice
    });

    await question.save();

    return res.status(201).json({
      message: 'Tạo câu hỏi thành công',
      question
    });
  } catch (error) {
    next(error);
  }
};

// Lấy câu hỏi (ẩn đáp án đúng)
export const getQuestionForStudentController = async (req, res, next) => {
  try {
    const { questionId } = req.params;

    const question = await Question.findById(questionId)
      .select('-answer');

    if (!question) {
      return res.status(404).json({ message: 'Câu hỏi không tìm thấy' });
    }

    return res.status(200).json({ question });
  } catch (error) {
    next(error);
  }
};

// Cập nhật câu hỏi
export const updateQuestionController = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const { questionText, rawQuestion, imageQuestion, choices, answer, questionType, detailType, hintVoice } = req.body;


    // Kiểm tra question tồn tại và quiz do user hiện tại tạo
    const existing = await Question.findById(questionId).lean();
    if (!existing) {
      return res.status(404).json({ message: 'Câu hỏi không tìm thấy' });
    }
    // const quiz = await Quiz.findOne({ _id: existing.quizId, createdBy: req.user.id });
    // if (!quiz) {
    //   return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa câu hỏi này' });
    // }

    const question = await Question.findByIdAndUpdate(
      questionId,
      { questionText, rawQuestion, imageQuestion, choices, answer, questionType, detailType, hintVoice },
      { new: true }
    );

    return res.status(200).json({
      message: 'Cập nhật câu hỏi thành công',
      question
    });
  } catch (error) {
    next(error);
  }
};

// Xóa câu hỏi
export const deleteQuestionController = async (req, res, next) => {
  try {
    const { questionId } = req.params;

    const existing = await Question.findById(questionId).lean();
    if (!existing) {
      return res.status(404).json({ message: 'Câu hỏi không tìm thấy' });
    }

    // // Kiểm tra quyền
    // const quiz = await Quiz.findOne({ _id: existing.quizId, createdBy: req.user.id });
    // if (!quiz) {
    //   return res.status(403).json({ message: 'Bạn không có quyền xóa câu hỏi này' });
    // }

    // // Kiểm tra câu hỏi có trong lịch sử làm bài không
    // const usedInAttempt = await QuizAttempt.exists({ 'details.questionId': questionId });
    // const usedInAssignment = await AssignmentAttempt.exists({ 'details.questionId': questionId });
    // if (usedInAttempt || usedInAssignment) {
    //   return res.status(400).json({ message: 'Không thể xóa câu hỏi vì đã có học sinh làm bài liên quan' });
    // }

    await Question.findByIdAndDelete(questionId);

    return res.status(200).json({
      message: 'Xóa câu hỏi thành công'
    });
  } catch (error) {
    next(error);
  }
};

// Kiểm tra đáp án
export const checkAnswerController = async (req, res, next) => {
  try {
    const { questionId, userAnswer } = req.body;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Câu hỏi không tìm thấy' });
    }
    const toText = (value) => {
      if (value === undefined || value === null) return null;
      if (typeof value === 'number') return String(value);
      if (typeof value === 'string') return value;
      return String(value);
    };

    const stored = question.answer;
    let storedText = null;
    if (typeof stored === 'number') {
      const correctChoice = question.choices && question.choices[stored];
      storedText = correctChoice ?? null;
    } else {
      storedText = toText(stored);
    }

    let userText = null;
    if (typeof userAnswer === 'number') {
      const choice = question.choices && question.choices[userAnswer];
      userText = choice ?? toText(userAnswer);
    } else {
      userText = toText(userAnswer);
    }

    const isCorrect = storedText !== null && userText !== null && storedText === userText;

    return res.status(200).json({ isCorrect});
  } catch (error) {
    next(error);
  }
};
