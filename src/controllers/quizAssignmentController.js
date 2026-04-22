import QuizAssignment from '../models/quizAssignment.schema.js';
import AssignmentAttempt from '../models/assignmentAttempt.schema.js';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';
import UserSchoolClass from '../models/userSchoolClass.schema.js';

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

// Lay danh sach assignment cua giao vien hien tai
export const getAssignmentsController = async (req, res, next) => {
  try {
    const filter = { teacherId: req.user.id };

    if (req.query.schoolClassId !== undefined) {
      filter.schoolClassId =
        req.query.schoolClassId === '' || req.query.schoolClassId === 'null'
          ? null
          : req.query.schoolClassId;
    }

    const assignments = await QuizAssignment.find(filter)
      .populate('quizId', 'title')
      .populate('schoolClassId', 'className')
      .sort({ createdAt: -1 });

    return res.status(200).json({ assignments });
  } catch (err) {
    next(err);
  }
};

// Tao assignment moi
export const createAssignmentController = async (req, res, next) => {
  try {
    const { quizId, schoolClassId, startAt, endAt, status } = req.body;

    if (!quizId) {
      return res.status(400).json({ message: 'quizId la bat buoc' });
    }

    const isGlobalAssignment =
      schoolClassId === null || schoolClassId === undefined || schoolClassId === '';

    if (!isGlobalAssignment) {
      const isTeacherInSchoolClass = await UserSchoolClass.exists({
        userId: req.user.id,
        schoolClassId
      });

      if (!isTeacherInSchoolClass) {
        return res.status(400).json({
          message: 'Giao vien chua duoc gan schoolClass nay, khong the tao assignment'
        });
      }
    }

    const quiz = await Quiz.findOne({ _id: quizId, createdBy: req.user.id });
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz khong tim thay hoac ban khong co quyen' });
    }

    const assignment = new QuizAssignment({
      quizId,
      schoolClassId: isGlobalAssignment ? null : schoolClassId,
      teacherId: req.user.id,
      startAt,
      endAt,
      status: status || 'open'
    });

    await assignment.save();
    return res.status(201).json({ message: 'Tao assignment thanh cong', assignment });
  } catch (err) {
    next(err);
  }
};

// Thay doi trang thai assignment (giao vien)
export const updateAssignmentStatusController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { status } = req.body;

    const validStatuses = ['draft', 'open', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Trang thai khong hop le. Chi chap nhan: ${validStatuses.join(', ')}`
      });
    }

    const assignment = await QuizAssignment.findOneAndUpdate(
      { _id: assignmentId, teacherId: req.user.id },
      { status },
      { new: true }
    );

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment khong tim thay hoac ban khong co quyen' });
    }

    return res.status(200).json({ message: 'Cap nhat trang thai thanh cong', assignment });
  } catch (err) {
    next(err);
  }
};

// Cap nhat assignment
export const updateAssignmentController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { schoolClassId, startAt, endAt, status } = req.body;

    const updateData = {};
    if (startAt !== undefined) updateData.startAt = startAt;
    if (endAt !== undefined) updateData.endAt = endAt;
    if (status !== undefined) updateData.status = status;

    const hasSchoolClassIdField = Object.prototype.hasOwnProperty.call(req.body || {}, 'schoolClassId');
    if (hasSchoolClassIdField) {
      const isGlobalAssignment =
        schoolClassId === null || schoolClassId === undefined || schoolClassId === '';

      if (isGlobalAssignment) {
        updateData.schoolClassId = null;
      } else {
        const isTeacherInSchoolClass = await UserSchoolClass.exists({
          userId: req.user.id,
          schoolClassId
        });

        if (!isTeacherInSchoolClass) {
          return res.status(400).json({
            message: 'Giao vien chua duoc gan schoolClass nay, khong the cap nhat assignment'
          });
        }

        updateData.schoolClassId = schoolClassId;
      }
    }

    const assignment = await QuizAssignment.findOneAndUpdate(
      { _id: assignmentId, teacherId: req.user.id },
      updateData,
      { new: true }
    );

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment khong tim thay hoac ban khong co quyen' });
    }

    return res.status(200).json({ message: 'Cap nhat thanh cong', assignment });
  } catch (err) {
    next(err);
  }
};

// Xoa assignment (chi khi chua co hoc sinh lam bai)
export const deleteAssignmentController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await QuizAssignment.findOne({ _id: assignmentId, teacherId: req.user.id });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment khong tim thay hoac ban khong co quyen' });
    }

    const hasAttempts = await AssignmentAttempt.exists({ assignmentId });
    if (hasAttempts) {
      return res.status(400).json({ message: 'Khong the xoa vi da co hoc sinh lam bai' });
    }

    await QuizAssignment.findByIdAndDelete(assignmentId);
    return res.status(200).json({ message: 'Xoa assignment thanh cong' });
  } catch (err) {
    next(err);
  }
};

// Lay ket qua lam bai cua hoc sinh theo assignment (giao vien xem)
export const getAssignmentResultsController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await QuizAssignment.findOne({ _id: assignmentId, teacherId: req.user.id });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment khong tim thay hoac ban khong co quyen' });
    }

    const attempts = await AssignmentAttempt.find({ assignmentId })
      .populate('userId', 'fullName username')
      .sort({ createdAt: -1 });

    return res.status(200).json({ attempts });
  } catch (err) {
    next(err);
  }
};

// ============ PHIA HOC SINH ============

// Lay danh sach assignment duoc giao cho lop hien tai cua hoc sinh
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

// Lay danh sach assignment global (schoolClassId = null) cho hoc sinh
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

// Lay cau hoi cua assignment de lam bai (an dap an)
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
      return res.status(404).json({ message: 'Assignment khong tim thay hoac chua mo' });
    }

    const questions = await Question.find({ quizId: assignment.quizId }).select('-answer');
    return res.status(200).json({ questions });
  } catch (err) {
    next(err);
  }
};

// Nop bai assignment
export const submitAssignmentController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { answers } = req.body; // [{ questionId, userAnswer }]

    if (!Array.isArray(answers) || !answers.length) {
      return res.status(400).json({ message: 'answers phai la mang va khong duoc rong' });
    }

    const currentSchoolClassId = await getCurrentUserSchoolClassId(req.user.id);
    const visibilityFilter = buildVisibilityFilter(currentSchoolClassId);
    const assignment = await QuizAssignment.findOne({
      _id: assignmentId,
      status: 'open',
      ...visibilityFilter
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment khong tim thay hoac chua mo' });
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
      message: 'Nop bai thanh cong',
      score,
      total: answers.length,
      details
    });
  } catch (err) {
    next(err);
  }
};

// Giao vien xem tat ca cac lan lam bai cua mot hoc sinh trong assignment
export const getStudentAttemptsController = async (req, res, next) => {
  try {
    const { assignmentId, studentId } = req.params;

    const assignment = await QuizAssignment.findOne({ _id: assignmentId, teacherId: req.user.id });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment khong tim thay hoac ban khong co quyen' });
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

// Hoc sinh xem lai bai lam cua minh
export const getMyAttemptController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;

    const attempt = await AssignmentAttempt.findOne({
      assignmentId,
      userId: req.user.id
    }).populate('details.questionId', 'questionText choices imageQuestion');

    if (!attempt) {
      return res.status(404).json({ message: 'Ban chua lam bai nay' });
    }

    return res.status(200).json({ attempt });
  } catch (err) {
    next(err);
  }
};
