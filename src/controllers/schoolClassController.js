import mongoose from 'mongoose';
import SchoolClass from '../models/schoolClass.schema.js';
import User from '../models/user.schema.js';
import UserSchoolClass from '../models/userSchoolClass.schema.js';

export const getAllSchoolClassesController = async (req, res, next) => {
  try {
    const schoolClasses = await SchoolClass.find()
      .sort({ className: 1 });

    return res.status(200).json({
      message: 'Lấy danh sách lớp thực thành công',
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
      return res.status(401).json({ message: 'Thông tin đăng nhập không hợp lệ' });
    }

    const mappings = await UserSchoolClass.find({ userId })
      .populate('schoolClassId', 'className')
      .lean();

    const data = mappings
      .filter((item) => item.schoolClassId)
      .map((item) => ({
        schoolClassId: item.schoolClassId._id,
        className: item.schoolClassId.className
      }));

    return res.status(200).json({
      message: 'Lấy danh sách lớp theo tài khoản đăng nhập thành công',
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
      return res.status(400).json({ message: 'id không hợp lệ' });
    }

    const schoolClass = await SchoolClass.findById(id);

    if (!schoolClass) {
      return res.status(404).json({ message: 'Lớp thực không tồn tại' });
    }

    const mappings = await UserSchoolClass.find({ schoolClassId: id }).select('userId').lean();
    const userIds = mappings.map((item) => item.userId).filter(Boolean);

    const students = userIds.length
      ? await User.find({ _id: { $in: userIds } })
        .select('_id fullName email roles classId')
        .sort({ fullName: 1 })
        .lean()
      : [];

    return res.status(200).json({
      message: 'Lấy chi tiết lớp thực thành công',
      data: {
        ...schoolClass.toObject(),
        students
      }
    });
  } catch (error) {
    next(error);
  }
};

export const createSchoolClassController = async (req, res, next) => {
  try {
    const { className } = req.body || {};

    if (!className) {
      return res.status(400).json({
        message: 'className là bắt buộc'
      });
    }

    const schoolClass = await SchoolClass.create({
      className: String(className).trim()
    });

    return res.status(201).json({
      message: 'Tạo lớp thực thành công',
      data: schoolClass
    });
  } catch (error) {
    next(error);
  }
};

export const updateSchoolClassController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { className } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }

    const schoolClass = await SchoolClass.findById(id);
    if (!schoolClass) {
      return res.status(404).json({ message: 'Lớp thực không tồn tại' });
    }

    if (className !== undefined) schoolClass.className = String(className).trim();

    await schoolClass.save();

    return res.status(200).json({
      message: 'Cập nhật lớp thực thành công',
      data: schoolClass
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSchoolClassController = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }

    const schoolClass = await SchoolClass.findByIdAndDelete(id);
    if (!schoolClass) {
      return res.status(404).json({ message: 'Lớp thực không tồn tại' });
    }

    await UserSchoolClass.deleteMany({ schoolClassId: id });

    return res.status(200).json({
      message: 'Xóa lớp thực thành công'
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
      return res.status(400).json({ message: 'id không hợp lệ' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId không hợp lệ' });
    }

    const [schoolClass, user] = await Promise.all([
      SchoolClass.findById(id),
      User.findById(userId)
    ]);

    if (!schoolClass) {
      return res.status(404).json({ message: 'Lớp thực không tồn tại' });
    }
    if (!user) {
      return res.status(404).json({ message: 'User không tồn tại' });
    }

    const exists = await UserSchoolClass.findOne({ userId: user._id, schoolClassId: schoolClass._id });
    if (!exists) {
      await UserSchoolClass.create({ userId: user._id, schoolClassId: schoolClass._id });
    }

    return res.status(200).json({
      message: exists ? 'User đã có trong lớp thực này' : 'Thêm học sinh vào lớp thực thành công',
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
      return res.status(400).json({ message: 'userId không hợp lệ' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User không tồn tại' });
    }

    if (schoolClassId === null || schoolClassId === undefined || schoolClassId === '') {
      const deleted = await UserSchoolClass.deleteMany({ userId: user._id });

      return res.status(200).json({
        message: 'Gỡ bỏ tất cả schoolClassId của user thành công',
        deletedCount: deleted.deletedCount || 0,
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email
        }
      });
    }

    if (!mongoose.Types.ObjectId.isValid(schoolClassId)) {
      return res.status(400).json({ message: 'schoolClassId không hợp lệ' });
    }

    const schoolClass = await SchoolClass.findById(schoolClassId);
    if (!schoolClass) {
      return res.status(404).json({ message: 'Lớp thực không tồn tại' });
    }

    const exists = await UserSchoolClass.findOne({ userId: user._id, schoolClassId: schoolClass._id });
    if (!exists) {
      await UserSchoolClass.create({ userId: user._id, schoolClassId: schoolClass._id });
    }

    return res.status(200).json({
      message: exists ? 'Quan hệ user-lớp đã tồn tại' : 'Gán schoolClassId cho user thành công',
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

export const removeStudentFromSchoolClassController = async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId không hợp lệ' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User không tồn tại' });
    }

    const deleted = await UserSchoolClass.findOneAndDelete({
      userId: user._id,
      schoolClassId: id
    });

    if (!deleted) {
      return res.status(400).json({ message: 'Học sinh không thuộc lớp thực này' });
    }

    return res.status(200).json({
      message: 'Xóa học sinh khỏi lớp thực thành công',
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
