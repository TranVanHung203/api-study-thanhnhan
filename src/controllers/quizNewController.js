import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';

// Lấy danh sách quizzes
export const getQuizzesController = async (req, res) => {
  try {
    const quizzes = await Quiz.find();
    return res.status(200).json({ quizzes });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Tạo quiz
export const createQuizController = async (req, res) => {
  try {
    const { title, description, totalQuestions, bonusPoints } = req.body;

    const quiz = new Quiz({
      title,
      description,
      totalQuestions: totalQuestions || 15,
      bonusPoints: bonusPoints || 100
    });

    await quiz.save();

    return res.status(201).json({
      message: 'Tạo quiz thành công',
      quiz
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy chi tiết quiz (kèm theo câu hỏi)
export const getQuizDetailController = async (req, res) => {
  try {
    const { quizId } = req.params;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz không tìm thấy' });
    }

    const questions = await Question.find({ quizId })
      .select('questionText options hintText order -correctAnswer')
      .sort({ order: 1 });

    return res.status(200).json({
      quiz,
      questions
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Cập nhật quiz
export const updateQuizController = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { title, description, totalQuestions, bonusPoints } = req.body;

    const quiz = await Quiz.findByIdAndUpdate(
      quizId,
      { title, description, totalQuestions, bonusPoints },
      { new: true }
    );

    return res.status(200).json({
      message: 'Cập nhật quiz thành công',
      quiz
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xóa quiz
export const deleteQuizController = async (req, res) => {
  try {
    const { quizId } = req.params;
    await Quiz.findByIdAndDelete(quizId);
    await Question.deleteMany({ quizId });

    return res.status(200).json({
      message: 'Xóa quiz thành công'
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
