import mongoose from 'mongoose';
import Question from '../models/question.schema.js';
import Quiz from '../models/quiz.schema.js';
import QuizAttempt from '../models/quizAttempt.schema.js';
import AssignmentAttempt from '../models/assignmentAttempt.schema.js';

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
    const quiz = await Quiz.findOne({ _id: existing.quizId, createdBy: req.user.id });
    if (!quiz) {
      return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa câu hỏi này' });
    }

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

    // Kiểm tra quyền
    const quiz = await Quiz.findOne({ _id: existing.quizId, createdBy: req.user.id });
    if (!quiz) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa câu hỏi này' });
    }

    // Kiểm tra câu hỏi có trong lịch sử làm bài không
    const usedInAttempt = await QuizAttempt.exists({ 'details.questionId': questionId });
    const usedInAssignment = await AssignmentAttempt.exists({ 'details.questionId': questionId });
    if (usedInAttempt || usedInAssignment) {
      return res.status(400).json({ message: 'Không thể xóa câu hỏi vì đã có học sinh làm bài liên quan' });
    }

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
