import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import User from '../models/user.schema.js';
import SchoolClass from '../models/schoolClass.schema.js';
import UserSchoolClass from '../models/userSchoolClass.schema.js';
import TeacherSchoolClass from '../models/teacherSchoolClass.schema.js';
import UserActivity from '../models/userActivity.schema.js';
import Reward from '../models/reward.schema.js';
import Rating from '../models/rating.schema.js';
import QuizAttempt from '../models/quizAttempt.schema.js';
import LessonCompletion from '../models/lessonCompletion.schema.js';
import VideoWatch from '../models/videoWatch.schema.js';
import QuizSession from '../models/quizSession.schema.js';

const hasRole = (user, roleName) => {
  if (!Array.isArray(user?.roles)) return false;
  const normalizedRoleName = String(roleName || '').toLowerCase();
  return user.roles.some((role) => String(role).toLowerCase() === normalizedRoleName);
};

const normalizeSearchText = (value) => String(value || '')
  .trim()
  .replace(/[Đ]/g, 'D')
  .replace(/[đ]/g, 'd')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const normalizeOptionalText = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeDateOfBirth = (value) => {
  if (value === undefined) return { hasValue: false, value: undefined, error: null };
  if (value === null || value === '') return { hasValue: true, value: null, error: null };

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return { hasValue: true, value: null, error: 'dateOfBirth khong hop le' };
  }

  return { hasValue: true, value: parsedDate, error: null };
};

const parsePagination = (query) => {
  const pageRaw = parseInt(query?.page, 10);
  const limitRaw = parseInt(query?.limit, 10);
  const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
  const limit = Number.isNaN(limitRaw) ? 20 : Math.max(1, Math.min(100, limitRaw));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const getTeacherContext = async (teacherId) => {
  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    return { error: { status: 401, message: 'Thong tin dang nhap khong hop le' } };
  }

  const teacher = await User.findOne({ _id: teacherId, isStatus: { $ne: 'deleted' } })
    .select('_id roles schoolId')
    .lean();
  if (!teacher) {
    return { error: { status: 404, message: 'Giao vien khong ton tai' } };
  }
  if (!hasRole(teacher, 'teacher')) {
    return { error: { status: 403, message: 'Chi tai khoan giao vien moi duoc phep thao tac' } };
  }
  if (!teacher.schoolId) {
    return { error: { status: 400, message: 'Giao vien chua duoc gan schoolId' } };
  }

  const managedMappings = await TeacherSchoolClass.find({ teacherId: teacher._id }).select('schoolClassId').lean();
  const managedClassIds = managedMappings
    .map((item) => String(item.schoolClassId))
    .filter(Boolean);

  return {
    teacher,
    managedClassIds,
    managedClassIdSet: new Set(managedClassIds)
  };
};

const validateManagedSchoolClass = async (teacherContext, schoolClassId) => {
  if (!mongoose.Types.ObjectId.isValid(schoolClassId)) {
    return { error: { status: 400, message: 'schoolClassId khong hop le' } };
  }

  const classIdStr = String(schoolClassId);
  if (!teacherContext.managedClassIdSet.has(classIdStr)) {
    return { error: { status: 403, message: 'Giáo viên không được quản lý lớp học này' } };
  }

  const schoolClass = await SchoolClass.findById(classIdStr).select('_id className schoolId').lean();
  if (!schoolClass) {
    return { error: { status: 404, message: 'Lớp học không tồn tại' } };
  }

  if (String(schoolClass.schoolId) !== String(teacherContext.teacher.schoolId)) {
    return { error: { status: 403, message: 'Lớp học không thuộc trường của giáo viên' } };
  }

  return { schoolClass };
};

export const getStudentsController = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const query = {
      roles: { $in: ['researchobject'] },
      isGuest: { $ne: true },
      isStatus: { $ne: 'deleted' }
    };
    const [studentsRaw, total] = await Promise.all([
      User.find(query)
        .select('_id fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);
    const students = studentsRaw.map((student) => ({
      userId: String(student._id),
      fullName: student.fullName,
      email: student.email
    }));

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      students
    });
  } catch (error) {
    next(error);
  }
};

export const createStudentByTeacherController = async (req, res, next) => {
  try {
    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    if (!teacherContext.managedClassIds.length) {
      return res.status(400).json({ message: 'Giao vien chua duoc gan lop quan ly' });
    }

    const {
      username,
      password,
      fullName,
      gender,
      schoolClassId,
      dateOfBirth,
      address
    } = req.body || {};

    const normalizedUsername = String(username || '').trim();
    const normalizedPassword = String(password || '');
    const normalizedFullName = String(fullName || '').trim();
    const normalizedAddress = normalizeOptionalText(address);
    const dobResult = normalizeDateOfBirth(dateOfBirth);

    if (!normalizedUsername || !normalizedPassword || !normalizedFullName || !schoolClassId) {
      return res.status(400).json({
        message: 'username, password, fullName, schoolClassId la bat buoc'
      });
    }

    if (normalizedPassword.length < 6) {
      return res.status(400).json({ message: 'password toi thieu 6 ky tu' });
    }

    if (gender !== undefined && gender !== null && ![0, 1].includes(Number(gender))) {
      return res.status(400).json({ message: 'gender chi nhan 0 hoac 1' });
    }

    if (dobResult.error) {
      return res.status(400).json({ message: dobResult.error });
    }

    const schoolClassResult = await validateManagedSchoolClass(teacherContext, schoolClassId);
    if (schoolClassResult.error) {
      return res.status(schoolClassResult.error.status).json({ message: schoolClassResult.error.message });
    }

    const existingUsername = await User.findOne({ username: normalizedUsername }).select('_id').lean();

    if (existingUsername) {
      return res.status(409).json({ message: 'username da ton tai' });
    }
    const passwordHash = await bcrypt.hash(normalizedPassword, 10);
    const user = await User.create({
      username: normalizedUsername,
      passwordHash,
      fullName: normalizedFullName,
      gender: gender === undefined || gender === null ? undefined : Number(gender),
      dateOfBirth: dobResult.hasValue ? dobResult.value : null,
      address: normalizedAddress,
      roles: ['student'],
      provider: 'local',
      isGuest: false,
      classId: null,
      schoolId: teacherContext.teacher.schoolId,
      createdByTeacherId: teacherContext.teacher._id
    });

    await UserSchoolClass.create({ userId: user._id, schoolClassId: schoolClassResult.schoolClass._id });

    return res.status(201).json({
      message: 'Giáo viên tạo tài khoản học sinh thành công',
      student: {
        userId: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        gender: user.gender ?? null,
        schoolId: user.schoolId,
        schoolClass: {
          schoolClassId: schoolClassResult.schoolClass._id,
          className: schoolClassResult.schoolClass.className
        },
        dateOfBirth: user.dateOfBirth || null,
        address: user.address || null
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Dữ liệu bị trùng (username)' });
    }
    next(error);
  }
};

export const getTeacherManagedStudentsController = async (req, res, next) => {
  try {
    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const schoolClassIdQuery = typeof req.query.schoolClassId === 'string'
      ? req.query.schoolClassId.trim()
      : '';
    const searchQuery = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    if (!teacherContext.managedClassIds.length) {
      return res.status(200).json({
        page,
        limit,
        total: 0,
        totalPages: 0,
        students: []
      });
    }

    let scopedClassIds = teacherContext.managedClassIds;
    if (schoolClassIdQuery) {
      if (!mongoose.Types.ObjectId.isValid(schoolClassIdQuery)) {
        return res.status(400).json({ message: 'schoolClassId khong hop le' });
      }

      if (!teacherContext.managedClassIdSet.has(schoolClassIdQuery)) {
        return res.status(403).json({ message: 'Giáo viên không được xem lớp học này' });
      }
      scopedClassIds = [schoolClassIdQuery];
    }

    const mappings = await UserSchoolClass.find({
      schoolClassId: { $in: scopedClassIds }
    })
      .select('userId schoolClassId')
      .lean();

    if (!mappings.length) {
      return res.status(200).json({
        page,
        limit,
        total: 0,
        totalPages: 0,
        students: []
      });
    }

    const userIdToClassIdsMap = new Map();
    for (const mapping of mappings) {
      const userIdStr = String(mapping.userId);
      const schoolClassIdStr = String(mapping.schoolClassId);
      if (!userIdToClassIdsMap.has(userIdStr)) {
        userIdToClassIdsMap.set(userIdStr, []);
      }
      userIdToClassIdsMap.get(userIdStr).push(schoolClassIdStr);
    }

    const allCandidateUserIds = Array.from(userIdToClassIdsMap.keys());
    const userFilter = {
      _id: { $in: allCandidateUserIds },
      createdByTeacherId: teacherContext.teacher._id,
      schoolId: teacherContext.teacher.schoolId,
      roles: { $in: ['student'] },
      isGuest: { $ne: true },
      isStatus: { $ne: 'deleted' }
    };

    let total;
    let users;

    if (searchQuery) {
      const normalizedSearch = normalizeSearchText(searchQuery);
      const allUsers = await User.find(userFilter)
        .select('_id username fullName email gender schoolId dateOfBirth address createdAt')
        .sort({ createdAt: -1 })
        .lean();

      const filteredUsers = allUsers.filter((user) => {
        const normalizedFullName = normalizeSearchText(user.fullName);
        const normalizedUsername = normalizeSearchText(user.username);
        const normalizedEmail = normalizeSearchText(user.email);

        return (
          normalizedFullName.includes(normalizedSearch) ||
          normalizedUsername.includes(normalizedSearch) ||
          normalizedEmail.includes(normalizedSearch)
        );
      });

      total = filteredUsers.length;
      users = filteredUsers.slice(skip, skip + limit);
    } else {
      [total, users] = await Promise.all([
        User.countDocuments(userFilter),
        User.find(userFilter)
          .select('_id username fullName email gender schoolId dateOfBirth address createdAt')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
      ]);
    }

    if (!users.length) {
      return res.status(200).json({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        students: []
      });
    }

    const pageUserIds = users.map((user) => user._id);
    const pageUserIdStrSet = new Set(pageUserIds.map((id) => String(id)));
    const classIdsForPage = new Set();

    for (const [userIdStr, schoolClassIds] of userIdToClassIdsMap.entries()) {
      if (!pageUserIdStrSet.has(userIdStr)) continue;
      schoolClassIds.forEach((schoolClassId) => classIdsForPage.add(schoolClassId));
    }

    const schoolClasses = await SchoolClass.find({ _id: { $in: Array.from(classIdsForPage) } })
      .select('_id className schoolId')
      .lean();
    const classMap = new Map(schoolClasses.map((item) => [String(item._id), item]));

    const students = users.map((user) => {
      const userIdStr = String(user._id);
      const schoolClassIds = userIdToClassIdsMap.get(userIdStr) || [];
      const classList = schoolClassIds
        .map((classId) => classMap.get(classId))
        .filter(Boolean)
        .map((schoolClass) => ({
          schoolClassId: schoolClass._id,
          className: schoolClass.className
        }));

      return {
        userId: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        gender: user.gender ?? null,
        schoolId: user.schoolId,
        schoolClasses: classList,
        dateOfBirth: user.dateOfBirth || null,
        address: user.address || null
      };
    });

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      students
    });
  } catch (error) {
    next(error);
  }
};

export const updateTeacherManagedStudentController = async (req, res, next) => {
  try {
    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    if (!teacherContext.managedClassIds.length) {
      return res.status(400).json({ message: 'Giáo viên chưa được gán lớp quản lý' });
    }

    const { studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'studentId không hợp lệ' });
    }

    const student = await User.findOne({
      _id: studentId,
      createdByTeacherId: teacherContext.teacher._id,
      schoolId: teacherContext.teacher.schoolId,
      roles: { $in: ['student'] },
      isStatus: { $ne: 'deleted' }
    });

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy học sinh thuộc quản lý của giáo viên' });
    }

    const hasManagedClassMapping = await UserSchoolClass.findOne({
      userId: student._id,
      schoolClassId: { $in: teacherContext.managedClassIds }
    })
      .select('_id')
      .lean();

    if (!hasManagedClassMapping) {
      return res.status(403).json({ message: 'Học sinh hiện không nằm trong lớp giáo viên đang quản lý' });
    }

    const {
      username,
      fullName,
      gender,
      password,
      schoolClassId,
      dateOfBirth,
      address
    } = req.body || {};

    if (username !== undefined) {
      const normalizedUsername = String(username || '').trim();
      if (!normalizedUsername) {
        return res.status(400).json({ message: 'username không được để trống' });
      }
      if (normalizedUsername !== student.username) {
        const existed = await User.findOne({
          _id: { $ne: student._id },
          username: normalizedUsername
        })
          .select('_id')
          .lean();
        if (existed) {
          return res.status(409).json({ message: 'username đã tồn tại' });
        }
      }
      student.username = normalizedUsername;
    }

    if (fullName !== undefined) {
      const normalizedFullName = String(fullName || '').trim();
      if (!normalizedFullName) {
        return res.status(400).json({ message: 'fullName không được để trống' });
      }
      student.fullName = normalizedFullName;
    }

    if (gender !== undefined) {
      if (gender === null || gender === '') {
        student.gender = undefined;
      } else if (![0, 1].includes(Number(gender))) {
        return res.status(400).json({ message: 'gender chỉ nhận 0 hoặc 1' });
      } else {
        student.gender = Number(gender);
      }
    }

    if (password !== undefined) {
      const normalizedPassword = String(password || '');
      if (normalizedPassword.length < 6) {
        return res.status(400).json({ message: 'password tối thiểu 6 ký tự' });
      }
      student.passwordHash = await bcrypt.hash(normalizedPassword, 10);
    }

    if (schoolClassId !== undefined) {
      const schoolClassResult = await validateManagedSchoolClass(teacherContext, schoolClassId);
      if (schoolClassResult.error) {
        return res.status(schoolClassResult.error.status).json({ message: schoolClassResult.error.message });
      }

      await UserSchoolClass.deleteMany({ userId: student._id });
      await UserSchoolClass.create({
        userId: student._id,
        schoolClassId: schoolClassResult.schoolClass._id
      });
    }

    const dobResult = normalizeDateOfBirth(dateOfBirth);
    if (dobResult.error) {
      return res.status(400).json({ message: dobResult.error });
    }

    if (dobResult.hasValue) {
      student.dateOfBirth = dobResult.value;
    }
    if (address !== undefined) {
      student.address = normalizeOptionalText(address);
    }

    await student.save();

    const studentClasses = await UserSchoolClass.find({ userId: student._id })
      .populate('schoolClassId', 'className')
      .lean();

    const classList = studentClasses
      .filter((item) => item.schoolClassId)
      .map((item) => ({
        schoolClassId: item.schoolClassId._id,
        className: item.schoolClassId.className
      }));

    return res.status(200).json({
      message: 'Cập nhật học sinh thành công',
      student: {
        userId: student._id,
        username: student.username,
        fullName: student.fullName,
        email: student.email,
        gender: student.gender ?? null,
        schoolId: student.schoolId,
        schoolClasses: classList,
        dateOfBirth: student.dateOfBirth || null,
        address: student.address || null
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Dữ liệu bị trùng (username)' });
    }
    next(error);
  }
};

export const resetTeacherStudentPasswordController = async (req, res, next) => {
  try {
    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    if (!teacherContext.managedClassIds.length) {
      return res.status(400).json({ message: 'Giáo viên chưa được gán lớp quản lý' });
    }

    const { studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'studentId không hợp lệ' });
    }

    const student = await User.findOne({
      _id: studentId,
      createdByTeacherId: teacherContext.teacher._id,
      schoolId: teacherContext.teacher.schoolId,
      roles: { $in: ['student'] },
      isStatus: { $ne: 'deleted' }
    });

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy học sinh thuộc quản lý của giáo viên' });
    }

    const hasManagedClassMapping = await UserSchoolClass.findOne({
      userId: student._id,
      schoolClassId: { $in: teacherContext.managedClassIds }
    })
      .select('_id')
      .lean();

    if (!hasManagedClassMapping) {
      return res.status(403).json({ message: 'Học sinh hiện không nằm trong lớp giáo viên đang quản lý' });
    }

    const defaultPassword = '123456';
    student.passwordHash = await bcrypt.hash(defaultPassword, 10);
    await student.save();

    return res.status(200).json({
      message: 'Reset mật khẩu học sinh thành công',
      studentId: student._id,
      defaultPassword
    });
  } catch (error) {
    next(error);
  }
};

export const removeStudentFromManagedClassController = async (req, res, next) => {
  try {
    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    if (!teacherContext.managedClassIds.length) {
      return res.status(400).json({ message: 'Giáo viên chưa được gán lớp quản lý' });
    }

    const { studentId, schoolClassId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'studentId không hợp lệ' });
    }

    const classValidation = await validateManagedSchoolClass(teacherContext, schoolClassId);
    if (classValidation.error) {
      return res.status(classValidation.error.status).json({ message: classValidation.error.message });
    }

    const student = await User.findOne({
      _id: studentId,
      createdByTeacherId: teacherContext.teacher._id,
      schoolId: teacherContext.teacher.schoolId,
      roles: { $in: ['student'] },
      isGuest: { $ne: true },
      isStatus: { $ne: 'deleted' }
    }).select('_id fullName email');

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy học sinh thuộc quản lý của giáo viên' });
    }

    const classMapping = await UserSchoolClass.findOne({
      userId: student._id,
      schoolClassId: classValidation.schoolClass._id
    })
      .select('_id')
      .lean();

    if (!classMapping) {
      return res.status(400).json({ message: 'Học sinh không thuộc lớp học này' });
    }

    await Promise.all([
      UserSchoolClass.deleteMany({ userId: student._id }),
      User.updateOne(
        { _id: student._id },
        {
          $set: {
            passwordHash: null,
            fullName: null,
            gender: null,
            classId: null,
            schoolId: null,
            createdByTeacherId: null,
            dateOfBirth: null,
            address: null,
            provider: null,
            avatar: null,
            characterId: null,
            preferredTopicId: null,
            roles: [],
            isGuest: null,
            isShowCaseView: null,
            isStatus: 'deleted',
            deletedAt: new Date()
          },
          $unset: {
            username: '',
            email: '',
            googleId: '',
            facebookId: '',
            zaloId: ''
          }
        }
      )
    ]);

    return res.status(200).json({
      message: 'Xóa học sinh thành công',
      student: {
        userId: student._id,
        fullName: student.fullName,
        email: student.email
      }
    });
  } catch (error) {
    next(error);
  }
};

export const exportStudentsByClassController = async (req, res, next) => {
  try {
    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    const schoolClassId = typeof req.query.schoolClassId === 'string'
      ? req.query.schoolClassId.trim()
      : '';

    if (!schoolClassId) {
      return res.status(400).json({ message: 'schoolClassId la bat buoc' });
    }

    const classValidation = await validateManagedSchoolClass(teacherContext, schoolClassId);
    if (classValidation.error) {
      return res.status(classValidation.error.status).json({ message: classValidation.error.message });
    }

    const mappings = await UserSchoolClass.find({ schoolClassId: classValidation.schoolClass._id })
      .select('userId')
      .lean();

    const userIds = mappings.map((item) => item.userId).filter(Boolean);
    const users = userIds.length
      ? await User.find({
        _id: { $in: userIds },
        createdByTeacherId: teacherContext.teacher._id,
        schoolId: teacherContext.teacher.schoolId,
        roles: { $in: ['student'] },
        isGuest: { $ne: true },
        isStatus: { $ne: 'deleted' }
      })
        .select('username fullName gender dateOfBirth address')
        .sort({ fullName: 1 })
        .lean()
      : [];

    const rows = users.map((user) => ({
      username: user.username || '',
      fullName: user.fullName || '',
      gender: user.gender ?? '',
      dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().slice(0, 10) : '',
      address: user.address || '',
      password: ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['username', 'fullName', 'gender', 'dateOfBirth', 'address', 'password']
    });

    try {
      if (ws['A1']) ws['A1'].v = 'username';
      if (ws['B1']) ws['B1'].v = 'fullName';
      if (ws['C1']) ws['C1'].v = 'gender';
      if (ws['D1']) ws['D1'].v = 'dateOfBirth';
      if (ws['E1']) ws['E1'].v = 'address';
      if (ws['F1']) ws['F1'].v = 'password';
    } catch (err) {
      // ignore if header cells not present
    }

    ws['!cols'] = [
      { wch: 16 },
      { wch: 24 },
      { wch: 10 },
      { wch: 14 },
      { wch: 30 },
      { wch: 14 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Học sinh');

    const safeClassName = String(classValidation.schoolClass.className || 'class')
      .replace(/[\\/<>:"|?*]+/g, '-')
      .trim();
    const fileName = `Student_List_${safeClassName || 'class'}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const buffer = XLSX.write(wb, { type: 'buffer' });
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const downloadStudentTemplateController = async (req, res, next) => {
  try {
    // Kiểm tra quyền giáo viên
    const teacherId = req.user?.id;
    const teacherContext = await getTeacherContext(teacherId);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    // Tạo workbook với dữ liệu mẫu
    const templateData = [
      {
        username: 'student_01',
        fullName: 'Nguyễn Văn A',
        gender: '1',
        dateOfBirth: '2010-01-15',
        address: '123 Đường ABC, Hà Nội',
        password: '123456'
      },
      {
        username: 'student_02',
        fullName: 'Trần Thị B',
        gender: '0',
        dateOfBirth: '2010-06-20',
        address: '456 Đường XYZ, Hà Nội',
        password: '123456'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    // Ghi lại header và thêm chú thích cho trường bắt buộc
    // json_to_sheet sẽ tạo header ở row 1, ta sửa lại các header để hiển thị (required)
    try {
      if (ws['A1']) ws['A1'].v = 'username (Bắt buộc nhập)';
      if (ws['B1']) ws['B1'].v = 'fullName (Bắt buộc nhập)';
      if (ws['C1']) ws['C1'].v = 'gender';
      if (ws['D1']) ws['D1'].v = 'dateOfBirth';
      if (ws['E1']) ws['E1'].v = 'address';
      if (ws['F1']) ws['F1'].v = 'password (Bắt buộc nhập)';
    } catch (err) {
      // ignore if header cells not present
    }

    // Đặt độ rộng cột
    ws['!cols'] = [
      { wch: 15 },
      { wch: 20 },
      { wch: 8 },
      { wch: 15 },
      { wch: 30 },
      { wch: 12 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Học sinh');

    // Thêm sheet hướng dẫn
    const instructionData = [
      ['Hướng dẫn nhập liệu:'],
      [''],
      ['Cột', 'Yêu cầu', 'Ghi chú'],
      ['username (required)', 'Bắt buộc, duy nhất', 'Không chứa ký tự đặc biệt'],
      ['fullName (required)', 'Bắt buộc', 'Tên đầy đủ của học sinh'],
      ['gender', 'Tùy chọn', '0 = Nữ, 1 = Nam'],
      ['dateOfBirth', 'Tùy chọn', 'Định dạng YYYY-MM-DD'],
      ['address', 'Tùy chọn', 'Địa chỉ của học sinh'],
      ['password (required)', 'Bắt buộc', 'Tối thiểu 6 ký tự']
    ];

    const wsInstruction = XLSX.utils.aoa_to_sheet(instructionData);
    wsInstruction['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsInstruction, 'Hướng dẫn');

    // Gửi file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Student_Template.xlsx"');

    const buffer = XLSX.write(wb, { type: 'buffer' });
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const uploadBulkStudentsController = async (req, res, next) => {
  try {
    // Kiểm tra file
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn file để upload' });
    }

    // Kiểm tra quyền giáo viên
    const teacherId = req.user?.id;
    const teacherContext = await getTeacherContext(teacherId);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    const { schoolClassId } = req.params;

    // Kiểm tra lớp học nếu có chỉ định
    let targetSchoolClassId = null;
    if (schoolClassId) {
      const classValidation = await validateManagedSchoolClass(teacherContext, schoolClassId);
      if (classValidation.error) {
        return res.status(classValidation.error.status).json({ message: classValidation.error.message });
      }
      targetSchoolClassId = classValidation.schoolClass._id;
    }

    // Đọc file Excel. Multer đang dùng disk storage nên ưu tiên đọc từ path,
    // nếu môi trường khác dùng memory storage thì fallback sang buffer.
    let workbook;
    try {
      if (req.file?.path) {
        workbook = XLSX.readFile(req.file.path);
      } else if (req.file?.buffer) {
        workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      } else {
        return res.status(400).json({ message: 'File không hợp lệ hoặc không phải file Excel' });
      }
    } catch (err) {
      return res.status(400).json({ message: 'File không hợp lệ hoặc không phải file Excel' });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      return res.status(400).json({ message: 'File Excel không có dữ liệu' });
    }

    const normalizeHeaderKey = (key) => {
      const raw = String(key || '').trim().toLowerCase();
      if (!raw) return '';
      if (raw.startsWith('username')) return 'username';
      if (raw.startsWith('fullname')) return 'fullName';
      if (raw.startsWith('gender')) return 'gender';
      if (raw.startsWith('dateofbirth')) return 'dateOfBirth';
      if (raw.startsWith('address')) return 'address';
      if (raw.startsWith('password')) return 'password';
      return '';
    };

    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const rows = rawRows
      .map((raw) => {
        const normalized = {};
        for (const [key, value] of Object.entries(raw)) {
          const mappedKey = normalizeHeaderKey(key);
          if (mappedKey) {
            normalized[mappedKey] = value;
          }
        }
        return normalized;
      })
      .filter((row) => Object.keys(row).length > 0);
    if (!rows || rows.length === 0) {
      return res.status(400).json({ message: 'File không chứa dữ liệu học sinh' });
    }

    // Xử lý từng dòng dữ liệu theo lô để giảm round-trip MongoDB
    const results = {
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      details: []
    };

    const normalizedRows = [];
    const seenUsernames = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2;

      try {
        const username = String(row.username || '').trim();
        const fullName = String(row.fullName || '').trim();
        const password = String(row.password || '').trim();

        if (!username) {
          results.errors.push({ row: rowIndex, message: 'username không được để trống' });
          continue;
        }
        if (seenUsernames.has(username)) {
          results.errors.push({ row: rowIndex, message: `username '${username}' bị trùng trong file` });
          continue;
        }
        if (!fullName) {
          results.errors.push({ row: rowIndex, message: 'fullName không được để trống' });
          continue;
        }
        if (!password || password.length < 6) {
          results.errors.push({ row: rowIndex, message: 'password phải tối thiểu 6 ký tự' });
          continue;
        }

        const gender = row.gender !== undefined && row.gender !== null && row.gender !== ''
          ? Number(row.gender)
          : undefined;
        const dateOfBirth = row.dateOfBirth || undefined;
        const address = normalizeOptionalText(row.address);

        if (gender !== undefined && ![0, 1].includes(gender)) {
          results.errors.push({ row: rowIndex, message: 'gender chỉ nhận 0 (Nữ) hoặc 1 (Nam)' });
          continue;
        }

        const dobResult = normalizeDateOfBirth(dateOfBirth);
        if (dobResult.error) {
          results.errors.push({ row: rowIndex, message: dobResult.error });
          continue;
        }

        normalizedRows.push({
          rowIndex,
          username,
          fullName,
          password,
          gender,
          dobValue: dobResult.value,
          hasDobValue: dobResult.hasValue,
          address
        });
        seenUsernames.add(username);
      } catch (rowError) {
        results.errors.push({
          row: rowIndex,
          message: rowError.message || 'Lỗi xử lý dòng dữ liệu'
        });
      }
    }

    if (!normalizedRows.length) {
      return res.status(200).json({
        message: 'Import hoàn tất',
        ...results
      });
    }

    const usernames = normalizedRows.map((item) => item.username);
    const [globalExistingUsers, managedExistingUsers] = await Promise.all([
      User.find({ username: { $in: usernames } })
        .select('_id username schoolId createdByTeacherId fullName gender dateOfBirth address roles isGuest')
        .lean(),
      User.find({
        username: { $in: usernames },
        schoolId: teacherContext.teacher.schoolId,
        createdByTeacherId: teacherContext.teacher._id,
        roles: { $in: ['student'] },
        isGuest: { $ne: true }
      })
        .select('_id username schoolId createdByTeacherId fullName gender dateOfBirth address roles isGuest')
        .lean()
    ]);

    const globalUserMap = new Map(globalExistingUsers.map((user) => [user.username, user]));
    const managedUserMap = new Map(managedExistingUsers.map((user) => [user.username, user]));
    const managedUserIds = managedExistingUsers.map((user) => user._id);

    const existingMappings = managedUserIds.length
      ? await UserSchoolClass.find({ userId: { $in: managedUserIds } })
        .select('userId schoolClassId')
        .lean()
      : [];

    const mappingMap = new Map();
    for (const mapping of existingMappings) {
      const userIdStr = String(mapping.userId);
      if (!mappingMap.has(userIdStr)) {
        mappingMap.set(userIdStr, []);
      }
      mappingMap.get(userIdStr).push(String(mapping.schoolClassId));
    }

    const createDocs = [];
    const createMeta = [];
    const updateOps = [];
    const updatedUserIds = [];

    for (const item of normalizedRows) {
      const globalExisting = globalUserMap.get(item.username);
      const student = managedUserMap.get(item.username);

      if (!student && globalExisting) {
        results.errors.push({
          row: item.rowIndex,
          message: `username '${item.username}' đã tồn tại`
        });
        continue;
      }

      if (!student) {
        createDocs.push({
          username: item.username,
          passwordHash: await bcrypt.hash(item.password, 10),
          fullName: item.fullName,
          gender: item.gender,
          dateOfBirth: item.hasDobValue ? item.dobValue : null,
          address: item.address,
          roles: ['student'],
          schoolId: teacherContext.teacher.schoolId,
          createdByTeacherId: teacherId,
          isGuest: false
        });
        createMeta.push(item);
        continue;
      }

      const currentClassIds = mappingMap.get(String(student._id)) || [];
      const classChanged = targetSchoolClassId
        ? !(currentClassIds.length === 1 && currentClassIds[0] === String(targetSchoolClassId))
        : false;

      const updates = {};
      if (item.fullName !== student.fullName) {
        updates.fullName = item.fullName;
      }
      if (item.gender !== student.gender) {
        updates.gender = item.gender;
      }
      if (item.hasDobValue && item.dobValue?.toString() !== student.dateOfBirth?.toString()) {
        updates.dateOfBirth = item.dobValue;
      }
      if (item.address !== student.address) {
        updates.address = item.address;
      }

      const hasFieldChanges = Object.keys(updates).length > 0;
      if (!hasFieldChanges && !classChanged) {
        results.skipped += 1;
        results.details.push({
          row: item.rowIndex,
          username: item.username,
          action: 'skipped',
          studentId: student._id,
          reason: 'Không có thay đổi'
        });
        continue;
      }

      if (hasFieldChanges) {
        updateOps.push({
          updateOne: {
            filter: { _id: student._id },
            update: { $set: updates }
          }
        });
      }

      results.updated += 1;
      updatedUserIds.push(student._id);
      results.details.push({
        row: item.rowIndex,
        username: item.username,
        action: 'updated',
        studentId: student._id,
        updates: [...Object.keys(updates), ...(classChanged ? ['schoolClassId'] : [])]
      });
    }

    if (createDocs.length) {
      const createdUsers = await User.insertMany(createDocs, { ordered: false });
      const createdUserMap = new Map(createdUsers.map((user) => [user.username, user]));

      for (const item of createMeta) {
        const createdUser = createdUserMap.get(item.username);
        if (!createdUser) continue;
        results.created += 1;
        results.details.push({
          row: item.rowIndex,
          username: item.username,
          action: 'created',
          studentId: createdUser._id
        });
        updatedUserIds.push(createdUser._id);
      }
    }

    if (updateOps.length) {
      await User.bulkWrite(updateOps, { ordered: false });
    }

    if (targetSchoolClassId && updatedUserIds.length) {
      const affectedUserIds = Array.from(new Set(updatedUserIds.map((id) => String(id))));
      await UserSchoolClass.deleteMany({ userId: { $in: affectedUserIds } });
      await UserSchoolClass.insertMany(
        affectedUserIds.map((userId) => ({
          userId,
          schoolClassId: targetSchoolClassId
        })),
        { ordered: false }
      );
    }

    // Xóa file upload
    if (req.file?.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Lỗi xóa file:', err);
      });
    }

    return res.status(200).json({
      message: 'Import hoàn tất',
      ...results
    });
  } catch (error) {
    // Xóa file upload nếu có lỗi
    if (req.file?.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Lỗi xóa file:', err);
      });
    }
    next(error);
  }
};

export default {
  getStudentsController,
  createStudentByTeacherController,
  getTeacherManagedStudentsController,
  updateTeacherManagedStudentController,
  resetTeacherStudentPasswordController,
  downloadStudentTemplateController,
  uploadBulkStudentsController
};
