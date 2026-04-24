import QuizAssignment from '../models/quizAssignment.schema.js';
import AssignmentAttempt from '../models/assignmentAttempt.schema.js';
import QuizAssignmentSession from '../models/quizAssignmentSession.schema.js';
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

const getAssignmentAccessForUser = async (assignmentId, userId, now = new Date()) => {
  const currentSchoolClassId = await getCurrentUserSchoolClassId(userId);
  const visibilityFilter = buildVisibilityFilter(currentSchoolClassId);

  const assignment = await QuizAssignment.findOne({
    _id: assignmentId,
    ...visibilityFilter
  }).lean();

  if (!assignment) {
    return {
      ok: false,
      status: 404,
      code: 'assignment_not_found',
      message: 'Khong tim thay assignment hoac ban khong co quyen truy cap',
      assignmentStartAt: null,
      assignmentEndAt: null
    };
  }

  if (assignment.status !== 'open') {
    return {
      ok: false,
      status: 409,
      code: 'assignment_not_open',
      message: 'Assignment chua mo de lam bai',
      assignmentStartAt: assignment.startAt || null,
      assignmentEndAt: assignment.endAt || null
    };
  }

  if (assignment.startAt && new Date(assignment.startAt) > now) {
    return {
      ok: false,
      status: 409,
      code: 'assignment_not_started',
      message: 'Chua den thoi gian lam bai',
      assignmentStartAt: assignment.startAt || null,
      assignmentEndAt: assignment.endAt || null
    };
  }

  if (assignment.endAt && new Date(assignment.endAt) < now) {
    return {
      ok: false,
      status: 409,
      code: 'assignment_ended',
      message: 'Da qua gio nop bai',
      assignmentStartAt: assignment.startAt || null,
      assignmentEndAt: assignment.endAt || null
    };
  }

  return {
    ok: true,
    assignment
  };
};

const sanitizeQuestions = (questionDocs) => {
  return questionDocs.map((q) => {
    const sanitized = { ...q };
    delete sanitized.answer;
    delete sanitized.correctAnswer;
    return sanitized;
  });
};

const getOwnedAssignmentSession = async (sessionId, assignmentId, userId, now = new Date()) => {
  const session = await QuizAssignmentSession.findOne({
    _id: sessionId,
    assignmentId,
    userId
  }).lean();

  if (!session) {
    return {
      session: null,
      reason: 'session_not_found'
    };
  }

  if (session.expiresAt && new Date(session.expiresAt) <= now) {
    await QuizAssignmentSession.deleteOne({ _id: sessionId });
    return {
      session: null,
      reason: 'session_expired'
    };
  }

  return {
    session,
    reason: null
  };
};

const buildCountdownPayload = (session, now = new Date()) => {
  const endsAt = session?.expiresAt ? new Date(session.expiresAt) : null;

  return {
    serverNow: now,
    endsAt
  };
};

const sendAssignmentAccessError = (res, access, now = new Date()) => {
  return res.status(access.status || 400).json({
    code: access.code || 'assignment_access_denied',
    message: access.message || 'Khong the truy cap assignment',
    serverNow: now,
    assignmentWindow: {
      startAt: access.assignmentStartAt || null,
      endAt: access.assignmentEndAt || null
    }
  });
};

const sendSessionError = (res, reason, now = new Date()) => {
  if (reason === 'session_expired') {
    return res.status(409).json({
      code: 'session_expired',
      message: 'Phien lam bai da het gio. Vui long bat dau lai neu assignment van con han',
      serverNow: now
    });
  }

  return res.status(404).json({
    code: 'session_not_found',
    message: 'Khong tim thay session lam bai',
    serverNow: now
  });
};

const normalizeSessionAnswers = (answers, allowedQuestionIds) => {
  if (!Array.isArray(answers)) {
    return { normalized: null, invalidQuestionIds: [] };
  }

  const allowedSet = new Set(allowedQuestionIds.map((id) => String(id)));
  const answerByQuestionId = new Map();
  const invalidQuestionIds = [];

  for (const answer of answers) {
    if (!answer || !answer.questionId) {
      continue;
    }

    const questionId = String(answer.questionId);
    if (!allowedSet.has(questionId)) {
      invalidQuestionIds.push(questionId);
      continue;
    }

    answerByQuestionId.set(questionId, {
      questionId,
      userAnswer: answer.userAnswer,
      updatedAt: new Date()
    });
  }

  const normalized = [];
  for (const allowedQuestionId of allowedQuestionIds) {
    const questionId = String(allowedQuestionId);
    if (answerByQuestionId.has(questionId)) {
      normalized.push(answerByQuestionId.get(questionId));
    }
  }

  return {
    normalized,
    invalidQuestionIds
  };
};

const attachMyAttemptToAssignments = async (assignments, userId) => {
  if (!assignments.length) {
    return [];
  }

  const assignmentIds = assignments.map((a) => a._id);
  const myAttempts = await AssignmentAttempt.find({
    assignmentId: { $in: assignmentIds },
    userId
  })
    .select('assignmentId isCompleted score createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const attemptsByAssignmentId = {};
  myAttempts.forEach((attempt) => {
    const assignmentIdKey = attempt.assignmentId.toString();
    if (!attemptsByAssignmentId[assignmentIdKey]) {
      attemptsByAssignmentId[assignmentIdKey] = [];
    }

    attemptsByAssignmentId[assignmentIdKey].push({
      score: attempt.score,
      isCompleted: attempt.isCompleted,
      createdAt: attempt.createdAt
    });
  });

  return assignments.map((assignmentDoc) => {
    const assignment = typeof assignmentDoc.toObject === 'function'
      ? assignmentDoc.toObject()
      : assignmentDoc;

    return {
      assignmentId: assignment._id,
      name: assignment.name,
      description: assignment.description,
      startAt: assignment.startAt,
      endAt: assignment.endAt,
      status: assignment.status,
      myAttempts: attemptsByAssignmentId[assignment._id.toString()] || []
    };
  });
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
      .select('name description startAt endAt status')
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
      .select('name description startAt endAt status')
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
    const userId = req.user.id;
    const now = new Date();

    const access = await getAssignmentAccessForUser(assignmentId, userId, now);
    if (!access.ok) {
      return sendAssignmentAccessError(res, access, now);
    }
    const assignment = access.assignment;

    const questionDocs = await Question.find({ quizId: assignment.quizId })
      .sort({ createdAt: 1 })
      .lean();

    const questionIds = questionDocs.map((q) => q._id);
    const questions = sanitizeQuestions(questionDocs);

    await QuizAssignmentSession.deleteMany({
      userId,
      assignmentId: assignment._id
    });

    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const expiresAt = assignment.endAt && assignment.endAt < twoHoursFromNow
      ? assignment.endAt
      : twoHoursFromNow;

    const session = await QuizAssignmentSession.create({
      userId,
      assignmentId: assignment._id,
      quizId: assignment.quizId,
      questionIds,
      selectedAnswers: [],
      expiresAt
    });

    const countdownInfo = buildCountdownPayload(session, now);

    return res.status(201).json({
      sessionId: session._id,
      total: questions.length,
      selectedAnswers: [],
      questions,
      ...countdownInfo
    });
  } catch (err) {
    next(err);
  }
};

// Hoc sinh lay lai cau hoi theo session dang lam
export const getAssignmentSessionQuestionsController = async (req, res, next) => {
  try {
    const { assignmentId, sessionId } = req.params;
    const userId = req.user.id;
    const now = new Date();

    const access = await getAssignmentAccessForUser(assignmentId, userId, now);
    if (!access.ok) {
      return sendAssignmentAccessError(res, access, now);
    }

    const sessionResult = await getOwnedAssignmentSession(sessionId, assignmentId, userId, now);
    if (!sessionResult.session) {
      return sendSessionError(res, sessionResult.reason, now);
    }
    const session = sessionResult.session;

    const questionDocs = await Question.find({ _id: { $in: session.questionIds } }).lean();
    const questionMap = new Map(questionDocs.map((q) => [String(q._id), q]));

    const orderedQuestions = session.questionIds
      .map((id) => questionMap.get(String(id)))
      .filter(Boolean);

    const countdownInfo = buildCountdownPayload(session, now);

    return res.status(200).json({
      sessionId: session._id,
      total: session.questionIds.length,
      selectedAnswers: session.selectedAnswers || [],
      questions: sanitizeQuestions(orderedQuestions),
      ...countdownInfo
    });
  } catch (err) {
    next(err);
  }
};

// Luu dap an tam trong qua trinh lam bai
export const saveAssignmentSessionAnswersController = async (req, res, next) => {
  try {
    const { assignmentId, sessionId } = req.params;
    const { answers } = req.body || {};
    const userId = req.user.id;
    const now = new Date();

    if (!Array.isArray(answers)) {
      return res.status(400).json({ message: 'answers phai la mang' });
    }

    const access = await getAssignmentAccessForUser(assignmentId, userId, now);
    if (!access.ok) {
      return sendAssignmentAccessError(res, access, now);
    }

    const sessionResult = await getOwnedAssignmentSession(sessionId, assignmentId, userId, now);
    if (!sessionResult.session) {
      return sendSessionError(res, sessionResult.reason, now);
    }
    const session = sessionResult.session;

    const { normalized, invalidQuestionIds } = normalizeSessionAnswers(answers, session.questionIds);
    if (!normalized) {
      return res.status(400).json({ message: 'answers phai la mang' });
    }

    if (invalidQuestionIds.length) {
      return res.status(400).json({
        message: 'Co questionId khong thuoc session',
        invalidQuestionIds
      });
    }

    await QuizAssignmentSession.updateOne(
      { _id: sessionId, assignmentId, userId },
      { $set: { selectedAnswers: normalized } }
    );

    return res.status(200).json({
      message: 'Luu dap an tam thanh cong',
      sessionId,
      totalSaved: normalized.length,
      selectedAnswers: normalized,
      ...buildCountdownPayload(session, now)
    });
  } catch (err) {
    next(err);
  }
};

// Nop bai assignment
export const submitAssignmentController = async (req, res, next) => {
  try {
    const { assignmentId, sessionId } = req.params;
    const { answers: bodyAnswers } = req.body || {};
    const userId = req.user.id;
    const now = new Date();

    const access = await getAssignmentAccessForUser(assignmentId, userId, now);
    if (!access.ok) {
      return sendAssignmentAccessError(res, access, now);
    }
    const assignment = access.assignment;

    const sessionResult = await getOwnedAssignmentSession(sessionId, assignmentId, userId, now);
    if (!sessionResult.session) {
      return sendSessionError(res, sessionResult.reason, now);
    }
    const session = sessionResult.session;

    const sourceAnswers = Array.isArray(bodyAnswers) && bodyAnswers.length
      ? bodyAnswers
      : (session.selectedAnswers || []);

    const { normalized, invalidQuestionIds } = normalizeSessionAnswers(sourceAnswers, session.questionIds);
    if (!normalized || !normalized.length) {
      return res.status(400).json({
        code: 'answers_required',
        message: 'Khong co dap an de nop bai. Vui long chon dap an truoc khi nop'
      });
    }

    if (invalidQuestionIds.length) {
      return res.status(400).json({
        message: 'Co questionId khong thuoc session',
        invalidQuestionIds
      });
    }

    const answerByQuestionId = new Map(
      normalized.map((item) => [String(item.questionId), item.userAnswer])
    );

    const questions = await Question.find({ _id: { $in: session.questionIds } }).lean();
    const questionById = new Map(questions.map((q) => [String(q._id), q]));

    let score = 0;
    const details = session.questionIds.map((sessionQuestionId) => {
      const questionId = String(sessionQuestionId);
      const q = questionById.get(questionId);
      const userAnswer = answerByQuestionId.has(questionId)
        ? answerByQuestionId.get(questionId)
        : null;

      if (!q) {
        return { questionId: sessionQuestionId, userAnswer, isCorrect: false, correctAnswer: null };
      }

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
      return { questionId: q._id, userAnswer, isCorrect, correctAnswer };
    });

    const attempt = new AssignmentAttempt({
      assignmentId,
      userId,
      score,
      isCompleted: true,
      details
    });
    await attempt.save();

    await QuizAssignmentSession.deleteOne({ _id: sessionId, assignmentId, userId });

    return res.status(201).json({
      message: 'Nop bai thanh cong',
      score,
      total: session.questionIds.length,
      answered: normalized.length,
      details,
      serverNow: now
    });
  } catch (err) {
    next(err);
  }
};

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
