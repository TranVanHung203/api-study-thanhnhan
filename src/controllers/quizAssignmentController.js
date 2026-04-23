import QuizAssignment from '../models/quizAssignment.schema.js';
import AssignmentAttempt from '../models/assignmentAttempt.schema.js';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';
import UserSchoolClass from '../models/userSchoolClass.schema.js';
import User from '../models/user.schema.js';

const getCurrentUserSchoolClassId = async (userId) => {
  const mapping = await UserSchoolClass.findOne({ userId })
    .select('schoolClassId')
    .sort({ createdAt: -1 })
    .lean();

  return mapping?.schoolClassId || null;
};

const buildVisibilityFilter = (schoolClassId) => {
  if (!schoolClassId) {
    return { schoolClassId: null };
  }

  return {
    $or: [
      { schoolClassId: null },
      { schoolClassId }
    ]
  };
};

const attachMyAttemptToAssignments = async (assignments, userId) => {
  const assignmentIds = assignments.map((a) => a._id);
  const myAttempts = await AssignmentAttempt.find({
    assignmentId: { $in: assignmentIds },
    userId
  }).select('assignmentId isCompleted score').lean();

  const attemptMap = {};
  myAttempts.forEach((a) => {
    attemptMap[a.assignmentId.toString()] = a;
  });

  return assignments.map((a) => ({
    ...a.toObject(),
    myAttempt: attemptMap[a._id.toString()] || null
  }));
};

// Lấy danh sách assignment của giáo viên hiện tại
export const getAssignmentsController = async (req, res, next) => {
  try {
    const pageRaw = parseInt(req.query.page, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
    const limit = Number.isNaN(limitRaw) ? 20 : Math.max(1, Math.min(100, limitRaw));
    const skip = (page - 1) * limit;

    const filter = { teacherId: req.user.id };
    const hasSchoolClassIdQuery = Object.prototype.hasOwnProperty.call(req.query || {}, 'schoolClassId');

    if (hasSchoolClassIdQuery) {
      const schoolClassIdQuery =
        typeof req.query.schoolClassId === 'string'
          ? req.query.schoolClassId.trim()
          : req.query.schoolClassId;

      const isNullSchoolClass =
        schoolClassIdQuery === null || schoolClassIdQuery === undefined || schoolClassIdQuery === '' || schoolClassIdQuery === 'null';

      if (!isNullSchoolClass) {
        filter.schoolClassId = schoolClassIdQuery;
      }
    }

    const [assignments, total] = await Promise.all([
      QuizAssignment.find(filter)
        .populate('quizId', 'title')
        .populate('schoolClassId', 'className')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      QuizAssignment.countDocuments(filter)
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages,
      assignments
    });
  } catch (err) {
    next(err);
  }
};

// Tạo assignment mới
export const createAssignmentController = async (req, res, next) => {
  try {
    const { quizId, schoolClassId, startAt, endAt, status, name, description } = req.body;

    if (!quizId) {
      return res.status(400).json({ message: 'quizId là bắt buộc' });
    }

    if (name !== undefined && name !== null && typeof name !== 'string') {
      return res.status(400).json({ message: 'name phải là chuỗi' });
    }

    if (description !== undefined && description !== null && typeof description !== 'string') {
      return res.status(400).json({ message: 'description phải là chuỗi' });
    }

    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedDescription = typeof description === 'string' ? description.trim() : '';


    // Chỉ cho phép assignment toàn trường (schoolClassId=null) nếu là admin
    const isGlobalAssignment = schoolClassId === null || schoolClassId === undefined || schoolClassId === '';
    if (isGlobalAssignment) {
      const currentUser = await User.findById(req.user.id).select('roles').lean();
      const userRoles = Array.isArray(currentUser?.roles)
        ? currentUser.roles.map((role) => String(role).toLowerCase())
        : [];
      const isAdmin = userRoles.includes('admin');

      if (!isAdmin) {
        return res.status(403).json({
          message: 'Chỉ admin mới được phép tạo assignment toàn trường (schoolClassId=null)'
        });
      }
    } else {
      const isTeacherInSchoolClass = await UserSchoolClass.exists({
        userId: req.user.id,
        schoolClassId
      });
      if (!isTeacherInSchoolClass) {
        return res.status(400).json({
          message: 'Giáo viên chưa được gán schoolClass này, không thể tạo assignment'
        });
      }
    }

    const quiz = await Quiz.findOne({ _id: quizId, createdBy: req.user.id });
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz không tìm thấy hoặc bạn không có quyền' });
    }


    const assignment = new QuizAssignment({
      quizId,
      schoolClassId: isGlobalAssignment ? null : schoolClassId,
      teacherId: req.user.id,
      name: normalizedName,
      description: normalizedDescription,
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
      return res.status(400).json({
        message: `Trạng thái không hợp lệ. Chỉ chấp nhận: ${validStatuses.join(', ')}`
      });
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
    const { quizId, schoolClassId, startAt, endAt, status, name, description } = req.body;

    const updateData = {};
    const hasQuizIdField = Object.prototype.hasOwnProperty.call(req.body || {}, 'quizId');
    if (hasQuizIdField) {
      const normalizedQuizId = typeof quizId === 'string' ? quizId.trim() : quizId;
      if (!normalizedQuizId) {
        return res.status(400).json({ message: 'quizId là bắt buộc' });
      }

      const quiz = await Quiz.findOne({ _id: normalizedQuizId, createdBy: req.user.id });
      if (!quiz) {
        return res.status(404).json({ message: 'Quiz không tìm thấy hoặc bạn không có quyền' });
      }

      updateData.quizId = normalizedQuizId;
    }

    if (startAt !== undefined) updateData.startAt = startAt;
    if (endAt !== undefined) updateData.endAt = endAt;

    const hasNameField = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
    if (hasNameField) {
      if (name !== null && typeof name !== 'string') {
        return res.status(400).json({ message: 'name phải là chuỗi' });
      }
      updateData.name = typeof name === 'string' ? name.trim() : '';
    }

    const hasDescriptionField = Object.prototype.hasOwnProperty.call(req.body || {}, 'description');
    if (hasDescriptionField) {
      if (description !== null && typeof description !== 'string') {
        return res.status(400).json({ message: 'description phải là chuỗi' });
      }
      updateData.description = typeof description === 'string' ? description.trim() : '';
    }

    if (status !== undefined) {
      const validStatuses = ['draft', 'open', 'closed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          message: `Trạng thái không hợp lệ. Chỉ chấp nhận: ${validStatuses.join(', ')}`
        });
      }
      updateData.status = status;
    }

    const hasSchoolClassIdField = Object.prototype.hasOwnProperty.call(req.body || {}, 'schoolClassId');
    if (hasSchoolClassIdField) {
      const normalizedSchoolClassId =
        typeof schoolClassId === 'string' ? schoolClassId.trim() : schoolClassId;

      const isGlobalAssignment =
        normalizedSchoolClassId === null ||
        normalizedSchoolClassId === undefined ||
        normalizedSchoolClassId === '' ||
        normalizedSchoolClassId === 'null';

      if (isGlobalAssignment) {
        const currentUser = await User.findById(req.user.id).select('roles').lean();
        const userRoles = Array.isArray(currentUser?.roles)
          ? currentUser.roles.map((role) => String(role).toLowerCase())
          : [];
        const isAdmin = userRoles.includes('admin');

        if (!isAdmin) {
          return res.status(403).json({
            message: 'Chỉ admin mới được phép đặt assignment toàn trường (schoolClassId=null)'
          });
        }

        updateData.schoolClassId = null;
      } else {
        const isTeacherInSchoolClass = await UserSchoolClass.exists({
          userId: req.user.id,
          schoolClassId: normalizedSchoolClassId
        });

        if (!isTeacherInSchoolClass) {
          return res.status(400).json({
            message: 'Giáo viên chưa được gán schoolClass này, không thể cập nhật assignment'
          });
        }

        updateData.schoolClassId = normalizedSchoolClassId;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Không có thuộc tính nào để cập nhật' });
    }

    const assignment = await QuizAssignment.findOneAndUpdate(
      { _id: assignmentId, teacherId: req.user.id },
      updateData,
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

// Lấy danh sách assignment được giao cho lớp hiện tại của học sinh
export const getMyAssignmentsController = async (req, res, next) => {
  try {
    const currentSchoolClassId = await getCurrentUserSchoolClassId(req.user.id);
    if (!currentSchoolClassId) {
      return res.status(200).json({ assignments: [] });
    }

    const now = new Date();
    const assignments = await QuizAssignment.find({
      schoolClassId: currentSchoolClassId,
      status: 'open',
      $or: [{ endAt: null }, { endAt: { $gte: now } }]
    })
      .populate('quizId', 'title description')
      .populate('schoolClassId', 'className')
      .populate('teacherId', 'fullName')
      .sort({ createdAt: -1 });

    const result = await attachMyAttemptToAssignments(assignments, req.user.id);

    return res.status(200).json({ assignments: result });
  } catch (err) {
    next(err);
  }
};

// Lấy danh sách assignment global (schoolClassId = null) cho học sinh
export const getMyGlobalAssignmentsController = async (req, res, next) => {
  try {
    const now = new Date();
    const assignments = await QuizAssignment.find({
      schoolClassId: null,
      status: 'open',
      $or: [{ endAt: null }, { endAt: { $gte: now } }]
    })
      .populate('quizId', 'title description')
      .populate('teacherId', 'fullName')
      .sort({ createdAt: -1 });

    const result = await attachMyAttemptToAssignments(assignments, req.user.id);

    return res.status(200).json({ assignments: result });
  } catch (err) {
    next(err);
  }
};

// Lấy câu hỏi của assignment để làm bài (ẩn đáp án)
export const getAssignmentQuestionsController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;

    const currentSchoolClassId = await getCurrentUserSchoolClassId(req.user.id);
    const visibilityFilter = buildVisibilityFilter(currentSchoolClassId);
    const assignment = await QuizAssignment.findOne({
      _id: assignmentId,
      status: 'open',
      ...visibilityFilter
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

    if (!Array.isArray(answers) || !answers.length) {
      return res.status(400).json({ message: 'answers phải là mảng và không được rỗng' });
    }

    const currentSchoolClassId = await getCurrentUserSchoolClassId(req.user.id);
    const visibilityFilter = buildVisibilityFilter(currentSchoolClassId);
    const assignment = await QuizAssignment.findOne({
      _id: assignmentId,
      status: 'open',
      ...visibilityFilter
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment không tìm thấy hoặc chưa mở' });
    }

    const questionIds = answers.map((a) => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds } }).lean();
    const questionMap = {};
    questions.forEach((q) => {
      questionMap[q._id.toString()] = q;
    });

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
