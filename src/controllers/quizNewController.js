import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';
import QuizAssignment from '../models/quizAssignment.schema.js';
import AssignmentAttempt from '../models/assignmentAttempt.schema.js';
import QuizSession from '../models/quizSession.schema.js';

// Lấy danh sách quizzes
export const getQuizzesController = async (req, res, next) => {
  try {
    // Lấy page & limit từ query, mặc định page=1, limit=20
    const pageRaw = parseInt(req.query.page, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
    const limit = Number.isNaN(limitRaw) ? 20 : Math.max(1, Math.min(100, limitRaw));
    const skip = (page - 1) * limit;

    // Đếm tổng số quiz
    const total = await Quiz.countDocuments({ createdBy: req.user.id });
    // Lấy danh sách quiz phân trang
    const quizzes = await Quiz.find({ createdBy: req.user.id })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (quizzes.length > 0) {
      const quizIds = quizzes.map((quiz) => quiz._id);
      const questionCountAgg = await Question.aggregate([
        { $match: { quizId: { $in: quizIds } } },
        { $group: { _id: '$quizId', count: { $sum: 1 } } }
      ]);

      const countMap = new Map(
        questionCountAgg.map((item) => [String(item._id), item.count])
      );

      const bulkOps = [];
      for (const quiz of quizzes) {
        const calculatedTotalQuestions = countMap.get(String(quiz._id)) || 0;
        if (quiz.totalQuestions !== calculatedTotalQuestions) {
          bulkOps.push({
            updateOne: {
              filter: { _id: quiz._id },
              update: { $set: { totalQuestions: calculatedTotalQuestions } }
            }
          });
        }
        quiz.totalQuestions = calculatedTotalQuestions;
      }

      if (bulkOps.length > 0) {
        await Quiz.bulkWrite(bulkOps);
      }
    }

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      quizzes
    });
  } catch (error) {
    next(error);
  }
};

// Tạo quiz
export const createQuizController = async (req, res, next) => {
  try {
    const { title, description, bonusPoints } = req.body;

    const quiz = new Quiz({
      title,
      description,
      totalQuestions: 0,
      bonusPoints: bonusPoints || 100,
      createdBy: req.user.id
    });

    await quiz.save();
    quiz.totalQuestions = await Question.countDocuments({ quizId: quiz._id });
    await quiz.save();

    return res.status(201).json({
      message: 'Tạo quiz thành công',
      quiz
    });
  } catch (error) {
    next(error);
  }
};

// Lấy chi tiết quiz (kèm theo câu hỏi)
export const getQuizDetailController = async (req, res, next) => {
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
    next(error);
  }
};

// Cập nhật quiz
export const updateQuizController = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const { title, description, totalQuestions, bonusPoints } = req.body;

    const quiz = await Quiz.findOneAndUpdate(
      { _id: quizId, createdBy: req.user.id },
      { title, description, totalQuestions, bonusPoints },
      { new: true }
    );

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz không tìm thấy hoặc bạn không có quyền chỉnh sửa' });
    }

    return res.status(200).json({
      message: 'Cập nhật quiz thành công',
      quiz
    });
  } catch (error) {
    next(error);
  }
};

// Xóa quiz
export const deleteQuizController = async (req, res, next) => {
  try {
    const { quizId } = req.params;

    const quiz = await Quiz.findOneAndDelete({ _id: quizId, createdBy: req.user.id });
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz không tìm thấy hoặc bạn không có quyền xóa' });
    }

    // Xóa câu hỏi
    await Question.deleteMany({ quizId });

    // Xóa các assignment của quiz này và lịch sử làm bài liên quan
    const assignments = await QuizAssignment.find({ quizId }).select('_id').lean();
    const assignmentIds = assignments.map(a => a._id);
    await AssignmentAttempt.deleteMany({ assignmentId: { $in: assignmentIds } });
    await QuizAssignment.deleteMany({ quizId });

    // Xóa session
    await QuizSession.deleteMany({ quizId });

    return res.status(200).json({
      message: 'Xóa quiz thành công'
    });
  } catch (error) {
    next(error);
  }
};




