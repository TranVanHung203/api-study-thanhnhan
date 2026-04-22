import mongoose from 'mongoose';
import SchoolClass from '../models/schoolClass.schema.js';
import User from '../models/user.schema.js';
import UserSchoolClass from '../models/userSchoolClass.schema.js';

export const getAllSchoolClassesController = async (req, res, next) => {
  try {
    const schoolClasses = await SchoolClass.find()
      .sort({ className: 1 });

    return res.status(200).json({
      message: 'Lay danh sach lop thuc thanh cong',
      data: schoolClasses
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

    const schoolClass = await SchoolClass.findById(id);

    if (!schoolClass) {
      return res.status(404).json({ message: 'Lop thuc khong ton tai' });
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
      message: 'Lay chi tiet lop thuc thanh cong',
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
        message: 'className la bat buoc'
      });
    }

    const schoolClass = await SchoolClass.create({
      className: String(className).trim()
    });

    return res.status(201).json({
      message: 'Tao lop thuc thanh cong',
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
      return res.status(400).json({ message: 'id khong hop le' });
    }

    const schoolClass = await SchoolClass.findById(id);
    if (!schoolClass) {
      return res.status(404).json({ message: 'Lop thuc khong ton tai' });
    }

    if (className !== undefined) schoolClass.className = String(className).trim();

    await schoolClass.save();

    return res.status(200).json({
      message: 'Cap nhat lop thuc thanh cong',
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
      return res.status(400).json({ message: 'id khong hop le' });
    }

    const schoolClass = await SchoolClass.findByIdAndDelete(id);
    if (!schoolClass) {
      return res.status(404).json({ message: 'Lop thuc khong ton tai' });
    }

    await UserSchoolClass.deleteMany({ schoolClassId: id });

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
      User.findById(userId)
    ]);

    if (!schoolClass) {
      return res.status(404).json({ message: 'Lop thuc khong ton tai' });
    }
    if (!user) {
      return res.status(404).json({ message: 'User khong ton tai' });
    }

    const exists = await UserSchoolClass.findOne({ userId: user._id, schoolClassId: schoolClass._id });
    if (!exists) {
      await UserSchoolClass.create({ userId: user._id, schoolClassId: schoolClass._id });
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

    const user = await User.findById(userId);
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

export const removeStudentFromSchoolClassController = async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id khong hop le' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId khong hop le' });
    }

    const user = await User.findById(userId);
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
