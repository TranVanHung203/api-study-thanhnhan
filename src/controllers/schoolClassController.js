import mongoose from 'mongoose';
import SchoolClass from '../models/schoolClass.schema.js';
import School from '../models/school.schema.js';
import User from '../models/user.schema.js';
import UserSchoolClass from '../models/userSchoolClass.schema.js';
import TeacherSchoolClass from '../models/teacherSchoolClass.schema.js';

const hasRole = (user, roleName) => {
  if (!Array.isArray(user?.roles)) return false;
  const normalizedRoleName = String(roleName || '').toLowerCase();
  return user.roles.some((role) => String(role).toLowerCase() === normalizedRoleName);
};

export const getAllSchoolClassesController = async (req, res, next) => {
  try {
    const schoolClasses = await SchoolClass.find()
      .populate('schoolId', 'name code')
      .sort({ className: 1 });

    return res.status(200).json({
      message: 'Lay danh sach lop thuc thanh cong',
      data: schoolClasses
    });
  } catch (error) {
    next(error);
  }
};

export const getSchoolClassesByUserIdController = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: 'Thong tin dang nhap khong hop le' });
    }

    const mappings = await UserSchoolClass.find({ userId })
      .populate({
        path: 'schoolClassId',
        select: 'className schoolId',
        populate: { path: 'schoolId', select: 'name code' }
      })
      .lean();

    const data = mappings
      .filter((item) => item.schoolClassId)
      .map((item) => ({
        schoolClassId: item.schoolClassId._id,
        className: item.schoolClassId.className,
        school: item.schoolClassId.schoolId || null
      }));

    return res.status(200).json({
      message: 'Lay danh sach lop theo tai khoan dang nhap thanh cong',
      data
    });
  } catch (error) {
    next(error);
  }
};

export const getSchoolClassesByTeacherIdController = async (req, res, next) => {
  try {
    const teacherId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
      return res.status(401).json({ message: 'Thong tin dang nhap khong hop le' });
    }

    const mappings = await TeacherSchoolClass.find({ teacherId })
      .populate({
        path: 'schoolClassId',
        select: 'className schoolId',
        populate: { path: 'schoolId', select: 'name code' }
      })
      .lean();

    const data = mappings
      .filter((item) => item.schoolClassId)
      .map((item) => ({
        schoolClassId: item.schoolClassId._id,
        className: item.schoolClassId.className,
        school: item.schoolClassId.schoolId || null
      }));

    return res.status(200).json({
      message: 'Lay danh sach lop quan ly theo giao vien thanh cong',
      data
    });
  } catch (error) {
    next(error);
  }
};

export const getSchoolClassByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id khong hop le' });
    }

    const schoolClass = await SchoolClass.findById(id).populate('schoolId', 'name code');

    if (!schoolClass) {
      return res.status(404).json({ message: 'Lop thuc khong ton tai' });
    }

    const mappings = await UserSchoolClass.find({ schoolClassId: id }).select('userId').lean();
    const userIds = mappings.map((item) => item.userId).filter(Boolean);

    const students = userIds.length
      ? await User.find({
        _id: { $in: userIds },
        roles: { $in: ['student', 'researchobject'] },
        isStatus: { $ne: 'deleted' }
      })
        .select('_id fullName email roles classId schoolId')
        .sort({ fullName: 1 })
        .lean()
      : [];

    const teacherMappings = await TeacherSchoolClass.find({ schoolClassId: id }).select('teacherId').lean();
    const teacherIds = teacherMappings.map((item) => item.teacherId).filter(Boolean);
    const teachers = teacherIds.length
      ? await User.find({ _id: { $in: teacherIds }, isStatus: { $ne: 'deleted' } })
        .select('_id fullName email roles schoolId')
        .sort({ fullName: 1 })
        .lean()
      : [];

    return res.status(200).json({
      message: 'Lay chi tiet lop thuc thanh cong',
      data: {
        ...schoolClass.toObject(),
        students,
        teachers
      }
    });
  } catch (error) {
    next(error);
  }
};

export const createSchoolClassController = async (req, res, next) => {
  try {
    const { className, schoolId } = req.body || {};

    if (!className) {
      return res.status(400).json({
        message: 'className la bat buoc'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(schoolId)) {
      return res.status(400).json({
        message: 'schoolId khong hop le'
      });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School khong ton tai' });
    }

    const schoolClass = await SchoolClass.create({
      className: String(className).trim(),
      schoolId: school._id
    });

    const schoolClassWithSchool = await SchoolClass.findById(schoolClass._id).populate('schoolId', 'name code');

    return res.status(201).json({
      message: 'Tao lop thuc thanh cong',
      data: schoolClassWithSchool
    });
  } catch (error) {
    next(error);
  }
};

export const updateSchoolClassController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { className, schoolId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id khong hop le' });
    }

    const schoolClass = await SchoolClass.findById(id);
    if (!schoolClass) {
      return res.status(404).json({ message: 'Lop thuc khong ton tai' });
    }

    if (className !== undefined) {
      schoolClass.className = String(className).trim();
    }

    if (schoolId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(schoolId)) {
        return res.status(400).json({ message: 'schoolId khong hop le' });
      }
      const school = await School.findById(schoolId);
      if (!school) {
        return res.status(404).json({ message: 'School khong ton tai' });
      }
      schoolClass.schoolId = school._id;
    }

    await schoolClass.save();

    const schoolClassWithSchool = await SchoolClass.findById(schoolClass._id).populate('schoolId', 'name code');

    return res.status(200).json({
      message: 'Cap nhat lop thuc thanh cong',
      data: schoolClassWithSchool
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSchoolClassController = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id khong hop le' });
    }

    const schoolClass = await SchoolClass.findByIdAndDelete(id);
    if (!schoolClass) {
      return res.status(404).json({ message: 'Lop thuc khong ton tai' });
    }

    await Promise.all([
      UserSchoolClass.deleteMany({ schoolClassId: id }),
      TeacherSchoolClass.deleteMany({ schoolClassId: id })
    ]);

    return res.status(200).json({
      message: 'Xoa lop thuc thanh cong'
    });
  } catch (error) {
    next(error);
  }
};

export const addStudentToSchoolClassController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id khong hop le' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId khong hop le' });
    }

    const [schoolClass, user] = await Promise.all([
      SchoolClass.findById(id),
      User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } })
    ]);

    if (!schoolClass) {
      return res.status(404).json({ message: 'Lop thuc khong ton tai' });
    }
    if (!user) {
      return res.status(404).json({ message: 'User khong ton tai' });
    }

    if (user.schoolId && String(user.schoolId) !== String(schoolClass.schoolId)) {
      return res.status(400).json({ message: 'User khong thuoc truong cua lop nay' });
    }

    const exists = await UserSchoolClass.findOne({ userId: user._id, schoolClassId: schoolClass._id });
    if (!exists) {
      await UserSchoolClass.create({ userId: user._id, schoolClassId: schoolClass._id });
    }

    if (!user.schoolId) {
      user.schoolId = schoolClass.schoolId;
      await user.save();
    }

    return res.status(200).json({
      message: exists ? 'User da co trong lop thuc nay' : 'Them hoc sinh vao lop thuc thanh cong',
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        schoolClassId: schoolClass._id
      }
    });
  } catch (error) {
    next(error);
  }
};

export const assignSchoolClassToUserController = async (req, res, next) => {
  try {
    const { userId, schoolClassId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId khong hop le' });
    }

    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } });
    if (!user) {
      return res.status(404).json({ message: 'User khong ton tai' });
    }

    if (schoolClassId === null || schoolClassId === undefined || schoolClassId === '') {
      const deleted = await UserSchoolClass.deleteMany({ userId: user._id });

      return res.status(200).json({
        message: 'Go bo tat ca schoolClassId cua user thanh cong',
        deletedCount: deleted.deletedCount || 0,
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email
        }
      });
    }

    if (!mongoose.Types.ObjectId.isValid(schoolClassId)) {
      return res.status(400).json({ message: 'schoolClassId khong hop le' });
    }

    const schoolClass = await SchoolClass.findById(schoolClassId);
    if (!schoolClass) {
      return res.status(404).json({ message: 'Lop thuc khong ton tai' });
    }

    if (user.schoolId && String(user.schoolId) !== String(schoolClass.schoolId)) {
      return res.status(400).json({ message: 'Khong the gan user vao lop khac truong' });
    }

    if (!user.schoolId) {
      user.schoolId = schoolClass.schoolId;
      await user.save();
    }

    const exists = await UserSchoolClass.findOne({ userId: user._id, schoolClassId: schoolClass._id });
    if (!exists) {
      await UserSchoolClass.create({ userId: user._id, schoolClassId: schoolClass._id });
    }

    return res.status(200).json({
      message: exists ? 'Quan he user-lop da ton tai' : 'Gan schoolClassId cho user thanh cong',
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        schoolClassId: schoolClass._id
      }
    });
  } catch (error) {
    next(error);
  }
};

export const addTeacherToSchoolClassController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { teacherId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id khong hop le' });
    }
    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
      return res.status(400).json({ message: 'teacherId khong hop le' });
    }

    const [schoolClass, teacher] = await Promise.all([
      SchoolClass.findById(id),
      User.findOne({ _id: teacherId, isStatus: { $ne: 'deleted' } })
        .select('_id fullName email roles schoolId')
    ]);

    if (!schoolClass) {
      return res.status(404).json({ message: 'Lop thuc khong ton tai' });
    }
    if (!teacher) {
      return res.status(404).json({ message: 'Giao vien khong ton tai' });
    }
    if (!hasRole(teacher, 'teacher')) {
      return res.status(400).json({ message: 'User duoc chon khong co role teacher' });
    }

    if (teacher.schoolId && String(teacher.schoolId) !== String(schoolClass.schoolId)) {
      return res.status(400).json({ message: 'Giao vien khong thuoc truong cua lop nay' });
    }

    if (!teacher.schoolId) {
      teacher.schoolId = schoolClass.schoolId;
      await teacher.save();
    }

    const exists = await TeacherSchoolClass.findOne({ teacherId: teacher._id, schoolClassId: schoolClass._id });
    if (!exists) {
      await TeacherSchoolClass.create({ teacherId: teacher._id, schoolClassId: schoolClass._id });
    }

    return res.status(200).json({
      message: exists ? 'Giao vien da duoc gan lop nay' : 'Gan giao vien quan ly lop thanh cong',
      teacher: {
        _id: teacher._id,
        fullName: teacher.fullName,
        email: teacher.email,
        schoolClassId: schoolClass._id
      }
    });
  } catch (error) {
    next(error);
  }
};

export const removeTeacherFromSchoolClassController = async (req, res, next) => {
  try {
    const { id, teacherId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id khong hop le' });
    }
    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
      return res.status(400).json({ message: 'teacherId khong hop le' });
    }

    const deleted = await TeacherSchoolClass.findOneAndDelete({
      teacherId,
      schoolClassId: id
    });

    if (!deleted) {
      return res.status(400).json({ message: 'Giao vien khong duoc gan lop nay' });
    }

    return res.status(200).json({
      message: 'Go giao vien khoi lop thanh cong'
    });
  } catch (error) {
    next(error);
  }
};

export const removeStudentFromSchoolClassController = async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id khong hop le' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId khong hop le' });
    }

    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } });
    if (!user) {
      return res.status(404).json({ message: 'User khong ton tai' });
    }

    const deleted = await UserSchoolClass.findOneAndDelete({
      userId: user._id,
      schoolClassId: id
    });

    if (!deleted) {
      return res.status(400).json({ message: 'Hoc sinh khong thuoc lop thuc nay' });
    }

    return res.status(200).json({
      message: 'Xoa hoc sinh khoi lop thuc thanh cong',
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        schoolClassId: null
      }
    });
  } catch (error) {
    next(error);
  }
};
