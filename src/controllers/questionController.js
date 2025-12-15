import mongoose from 'mongoose';
import Question from '../models/question.schema.js';

// Lấy câu hỏi của một quiz
export const getQuestionsByQuizController = async (req, res) => {
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
    return res.status(500).json({ message: error.message });
  }
};

// Tạo câu hỏi
export const createQuestionController = async (req, res) => {
  try {
    const {
      quizId,
      questionText,
      questionVoice,
      imageQuestion,
      choices,
      answer,
      hintVoice,
      order
    } = req.body;
    // Expected `choices` shape: [ { text?, imageUrl? }, ... ] with length >= 2
    if (!Array.isArray(choices) || choices.length < 2) {
      return res.status(400).json({ message: 'choices must be an array with at least two items' });
    }

    if (typeof answer === 'number') {
      if (answer < 0 || answer >= choices.length) {
        return res.status(400).json({ message: 'answer index out of range' });
      }
    }

    const question = new Question({
      quizId,
      questionText,
      questionVoice,
      imageQuestion,
      choices,
      // answer can be number (index) or object
      answer,
      hintVoice,
      order: order || 0
    });

    await question.save();

    return res.status(201).json({
      message: 'Tạo câu hỏi thành công',
      question
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy câu hỏi (ẩn đáp án đúng)
export const getQuestionForStudentController = async (req, res) => {
  try {
    const { questionId } = req.params;

    const question = await Question.findById(questionId)
      .select('-answer');

    if (!question) {
      return res.status(404).json({ message: 'Câu hỏi không tìm thấy' });
    }

    return res.status(200).json({ question });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Cập nhật câu hỏi
export const updateQuestionController = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { questionText, questionVoice, imageQuestion, choices, answer, hintVoice, order } = req.body;

    const question = await Question.findByIdAndUpdate(
      questionId,
      { questionText, questionVoice, imageQuestion, choices, answer, hintVoice, order },
      { new: true }
    );

    return res.status(200).json({
      message: 'Cập nhật câu hỏi thành công',
      question
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xóa câu hỏi
export const deleteQuestionController = async (req, res) => {
  try {
    const { questionId } = req.params;
    await Question.findByIdAndDelete(questionId);

    return res.status(200).json({
      message: 'Xóa câu hỏi thành công'
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Kiểm tra đáp án
export const checkAnswerController = async (req, res) => {
  try {
    const { questionId, userAnswer } = req.body;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Câu hỏi không tìm thấy' });
    }

    const storedAnswer = question.answer;
    let isCorrect = false;

    if (storedAnswer === undefined || storedAnswer === null) {
      isCorrect = false;
    } else if (typeof storedAnswer === 'number') {
      // stored as index (0-based)
      const idx = storedAnswer;
      const correctChoice = question.choices[idx];
      if (correctChoice) {
        if (typeof userAnswer === 'number') {
          isCorrect = (userAnswer === idx);
        } else if (typeof userAnswer === 'string') {
          isCorrect = (correctChoice.text === userAnswer);
        } else if (userAnswer && userAnswer.imageUrl) {
          isCorrect = (correctChoice.imageUrl === userAnswer.imageUrl);
        }
      }
    } else if (typeof storedAnswer === 'object') {
      // stored as object { text?, imageUrl? }
      if (storedAnswer.text) {
        if (typeof userAnswer === 'string') isCorrect = storedAnswer.text === userAnswer;
        else if (userAnswer && userAnswer.text) isCorrect = storedAnswer.text === userAnswer.text;
      } else if (storedAnswer.imageUrl) {
        if (userAnswer && userAnswer.imageUrl) isCorrect = storedAnswer.imageUrl === userAnswer.imageUrl;
      }
    }

    return res.status(200).json({ isCorrect, correctAnswer: storedAnswer });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
