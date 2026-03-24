import QuizAssignment from '../models/quizAssignment.schema.js';
import AssignmentAttempt from '../models/assignmentAttempt.schema.js';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';
import User from '../models/user.schema.js';

// Lấy danh sách assignment của giáo viên hiện tại
export const getAssignmentsController = async (req, res, next) => {
  try {
    const assignments = await QuizAssignment.find({ teacherId: req.user.id })
      .populate('quizId', 'title')
      .populate('classId', 'className')
      .sort({ createdAt: -1 });
    return res.status(200).json({ assignments });
  } catch (err) {
    next(err);
  }
};

// Tạo assignment mới
export const createAssignmentController = async (req, res, next) => {
  try {
    const { quizId, startAt, endAt, status } = req.body;

    // Lấy classId từ thông tin giáo viên đang đăng nhập
    const teacher = await User.findById(req.user.id).select('classId').lean();
    if (!teacher?.classId) {
      return res.status(400).json({ message: 'Giáo viên chưa được gán lớp, không thể tạo assignment' });
    }

    // Kiểm tra quiz thuộc về giáo viên này
    const quiz = await Quiz.findOne({ _id: quizId, createdBy: req.user.id });
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz không tìm thấy hoặc bạn không có quyền' });
    }

    const assignment = new QuizAssignment({
      quizId,
      classId: teacher.classId,
      teacherId: req.user.id,
      startAt,
      endAt,
      status: status || 'open'
    });

    await assignment.save();
    return res.status(201).json({ message: 'Tạo assignment thành công', assignment });
  } catch (err) {
    next(err);
  }
};

// Thay đổi trạng thái assignment (giáo viên)
export const updateAssignmentStatusController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { status } = req.body;

    const validStatuses = ['draft', 'open', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Trạng thái không hợp lệ. Chỉ chấp nhận: ${validStatuses.join(', ')}` });
    }

    const assignment = await QuizAssignment.findOneAndUpdate(
      { _id: assignmentId, teacherId: req.user.id },
      { status },
      { new: true }
    );

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment không tìm thấy hoặc bạn không có quyền' });
    }

    return res.status(200).json({ message: 'Cập nhật trạng thái thành công', assignment });
  } catch (err) {
    next(err);
  }
};

// Cập nhật assignment
export const updateAssignmentController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { startAt, endAt, status } = req.body;

    const assignment = await QuizAssignment.findOneAndUpdate(
      { _id: assignmentId, teacherId: req.user.id },
      { startAt, endAt, status },
      { new: true }
    );

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment không tìm thấy hoặc bạn không có quyền' });
    }

    return res.status(200).json({ message: 'Cập nhật thành công', assignment });
  } catch (err) {
    next(err);
  }
};

// Xóa assignment (chỉ khi chưa có học sinh làm bài)
export const deleteAssignmentController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await QuizAssignment.findOne({ _id: assignmentId, teacherId: req.user.id });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment không tìm thấy hoặc bạn không có quyền' });
    }

    const hasAttempts = await AssignmentAttempt.exists({ assignmentId });
    if (hasAttempts) {
      return res.status(400).json({ message: 'Không thể xóa vì đã có học sinh làm bài' });
    }

    await QuizAssignment.findByIdAndDelete(assignmentId);
    return res.status(200).json({ message: 'Xóa assignment thành công' });
  } catch (err) {
    next(err);
  }
};

// Lấy kết quả làm bài của học sinh theo assignment (giáo viên xem)
export const getAssignmentResultsController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await QuizAssignment.findOne({ _id: assignmentId, teacherId: req.user.id });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment không tìm thấy hoặc bạn không có quyền' });
    }

    const attempts = await AssignmentAttempt.find({ assignmentId })
      .populate('userId', 'fullName username')
      .sort({ createdAt: -1 });

    return res.status(200).json({ attempts });
  } catch (err) {
    next(err);
  }
};

// ============ PHÍA HỌC SINH ============

// Lấy danh sách assignment được giao cho lớp của học sinh
export const getMyAssignmentsController = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('classId').lean();
    if (!user || !user.classId) {
      return res.status(200).json({ assignments: [] });
    }

    const now = new Date();
    const assignments = await QuizAssignment.find({
      classId: user.classId,
      status: 'open',
      $or: [{ endAt: null }, { endAt: { $gte: now } }]
    })
      .populate('quizId', 'title description')
      .populate('teacherId', 'fullName')
      .sort({ createdAt: -1 });

    // Đính kèm trạng thái đã làm chưa
    const assignmentIds = assignments.map(a => a._id);
    const myAttempts = await AssignmentAttempt.find({
      assignmentId: { $in: assignmentIds },
      userId: req.user.id
    }).select('assignmentId isCompleted score').lean();

    const attemptMap = {};
    myAttempts.forEach(a => { attemptMap[a.assignmentId.toString()] = a; });

    const result = assignments.map(a => ({
      ...a.toObject(),
      myAttempt: attemptMap[a._id.toString()] || null
    }));

    return res.status(200).json({ assignments: result });
  } catch (err) {
    next(err);
  }
};

// Lấy câu hỏi của assignment để làm bài (ẩn đáp án)
export const getAssignmentQuestionsController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;

    const user = await User.findById(req.user.id).select('classId').lean();
    const assignment = await QuizAssignment.findOne({
      _id: assignmentId,
      classId: user?.classId,
      status: 'open'
    });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment không tìm thấy hoặc chưa mở' });
    }

    const questions = await Question.find({ quizId: assignment.quizId }).select('-answer');
    return res.status(200).json({ questions });
  } catch (err) {
    next(err);
  }
};

// Nộp bài assignment
export const submitAssignmentController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { answers } = req.body; // [{ questionId, userAnswer }]

    const user = await User.findById(req.user.id).select('classId').lean();
    const assignment = await QuizAssignment.findOne({
      _id: assignmentId,
      classId: user?.classId,
      status: 'open'
    });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment không tìm thấy hoặc chưa mở' });
    }

    // Tính điểm
    const questionIds = answers.map(a => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds } }).lean();
    const questionMap = {};
    questions.forEach(q => { questionMap[q._id.toString()] = q; });

    let score = 0;
    const details = answers.map(({ questionId, userAnswer }) => {
      const q = questionMap[questionId];
      if (!q) return { questionId, userAnswer, isCorrect: false, correctAnswer: null };

      const correctAnswer = q.answer;
      let isCorrect = false;

      if (typeof correctAnswer === 'number') {
        const correctText = q.choices?.[correctAnswer];
        const userText = typeof userAnswer === 'number' ? q.choices?.[userAnswer] : userAnswer;
        isCorrect = correctText != null && correctText === userText;
      } else {
        isCorrect = String(correctAnswer) === String(userAnswer);
      }

      if (isCorrect) score++;
      return { questionId, userAnswer, isCorrect, correctAnswer };
    });

    const attempt = new AssignmentAttempt({
      assignmentId,
      userId: req.user.id,
      score,
      isCompleted: true,
      details
    });
    await attempt.save();

    return res.status(201).json({
      message: 'Nộp bài thành công',
      score,
      total: answers.length,
      details
    });
  } catch (err) {
    next(err);
  }
};

// Giáo viên xem tất cả các lần làm bài của một học sinh trong assignment
export const getStudentAttemptsController = async (req, res, next) => {
  try {
    const { assignmentId, studentId } = req.params;

    const assignment = await QuizAssignment.findOne({ _id: assignmentId, teacherId: req.user.id });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment không tìm thấy hoặc bạn không có quyền' });
    }

    const attempts = await AssignmentAttempt.find({ assignmentId, userId: studentId })
      .populate('userId', 'fullName username')
      .populate('details.questionId', 'questionText choices imageQuestion')
      .sort({ createdAt: -1 });

    return res.status(200).json({ attempts });
  } catch (err) {
    next(err);
  }
};

// Học sinh xem lại bài làm của mình
export const getMyAttemptController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;

    const attempt = await AssignmentAttempt.findOne({
      assignmentId,
      userId: req.user.id
    }).populate('details.questionId', 'questionText choices imageQuestion');

    if (!attempt) {
      return res.status(404).json({ message: 'Bạn chưa làm bài này' });
    }

    return res.status(200).json({ attempt });
  } catch (err) {
    next(err);
  }
};
