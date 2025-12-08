import Question from '../models/question.schema.js';

// Lấy câu hỏi của một quiz
export const getQuestionsByQuizController = async (req, res) => {
  try {
    const { quizId } = req.params;

    const questions = await Question.find({ quizId })
      .sort({ order: 1 });

    return res.status(200).json({ questions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Tạo câu hỏi
export const createQuestionController = async (req, res) => {
  try {
    const { quizId, questionText, options, correctAnswer, hintText, order } = req.body;

    const question = new Question({
      quizId,
      questionText,
      options,
      correctAnswer,
      hintText,
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
      .select('-correctAnswer');

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
    const { questionText, options, correctAnswer, hintText, order } = req.body;

    const question = await Question.findByIdAndUpdate(
      questionId,
      { questionText, options, correctAnswer, hintText, order },
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

    const isCorrect = question.correctAnswer === userAnswer;

    return res.status(200).json({
      isCorrect,
      correctAnswer: question.correctAnswer
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
