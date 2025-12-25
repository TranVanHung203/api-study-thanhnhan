import mongoose from 'mongoose';
import Question from '../models/question.schema.js';

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
      questionVoice,
      imageQuestion,
      choices,
      answer,
      questionType,
      hintVoice,
      order
    } = req.body;
    // Expected `choices` shape: [ { text }, ... ] with length >= 2. If value is an image URL, store URL string in `text`.
    if (!Array.isArray(choices) || choices.length < 2) {
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
      questionVoice,
      imageQuestion,
      choices,
      // answer can be number (index) or object
      answer,
      questionType,
      hintVoice,
      order: order || 0
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
    const { questionText, rawQuestion, questionVoice, imageQuestion, choices, answer, hintVoice, order } = req.body;

    const question = await Question.findByIdAndUpdate(
      questionId,
      { questionText, rawQuestion, questionVoice, imageQuestion, choices, answer, hintVoice, order },
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
    // Normalize stored answer to string for direct comparison
    let storedText = null;
    const stored = question.answer;
    if (stored === undefined || stored === null) storedText = null;
    else if (typeof stored === 'number') {
      const idx = stored;
      const correctChoice = question.choices && question.choices[idx];
      storedText = correctChoice ? (correctChoice.text || String(correctChoice)) : null;
    } else if (typeof stored === 'object') {
      if (stored.text) storedText = stored.text;
      else storedText = String(stored);
    } else {
      storedText = String(stored);
    }

    // Normalize userAnswer to string
    let userText = null;
    if (userAnswer === undefined || userAnswer === null) userText = null;
    else if (typeof userAnswer === 'number') {
      // If user passed index, map to choice text
      const idx = userAnswer;
      const choice = question.choices && question.choices[idx];
      userText = choice ? (choice.text || String(choice)) : String(userAnswer);
    } else if (typeof userAnswer === 'object') {
      if (userAnswer.text) userText = userAnswer.text;
      else userText = String(userAnswer);
    } else {
      userText = String(userAnswer);
    }

    const isCorrect = (storedText !== null && userText !== null && storedText === userText);

    return res.status(200).json({ isCorrect});
  } catch (error) {
    next(error);
  }
};
