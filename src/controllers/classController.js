import Class from '../models/class.schema.js';
import User from '../models/user.schema.js';

// Lấy tất cả classes
export const getAllClassesController = async (req, res, next) => {
  try {
    const classes = await Class.find();
    return res.status(200).json({
      message: 'Lấy danh sách lớp thành công',
      data: classes
    });
  } catch (error) {
    next(error);
  }
};

// Lấy chi tiết 1 class với danh sách học viên
export const getClassByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const classData = await Class.findById(id);

    if (!classData) {
      return res.status(404).json({ message: 'Lớp không tồn tại' });
    }

    const students = await User.find({ classId: id }).select('-passwordHash');

    return res.status(200).json({
      message: 'Lấy thông tin lớp thành công',
      data: {
        ...classData.toObject(),
        students
      }
    });
  } catch (error) {
    next(error);
  }
};

// Tạo class mới (chỉ giáo viên)
export const createClassController = async (req, res, next) => {
  try {
    const { name, description, level } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Vui lòng nhập tên lớp' });
    }

    const newClass = new Class({
      name,
      description,
      level
    });

    await newClass.save();

    return res.status(201).json({
      message: 'Tạo lớp thành công',
      data: newClass
    });
  } catch (error) {
    next(error);
  }
};

// Cập nhật class
export const updateClassController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, level } = req.body;

    const classData = await Class.findByIdAndUpdate(
      id,
      { name, description, level },
      { new: true }
    );

    if (!classData) {
      return res.status(404).json({ message: 'Lớp không tồn tại' });
    }

    return res.status(200).json({
      message: 'Cập nhật lớp thành công',
      data: classData
    });
  } catch (error) {
    next(error);
  }
};

// Xóa class
export const deleteClassController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const classData = await Class.findByIdAndDelete(id);

    if (!classData) {
      return res.status(404).json({ message: 'Lớp không tồn tại' });
    }

    // Xóa classId khỏi tất cả users thuộc class này
    await User.updateMany({ classId: id }, { classId: null });

    return res.status(200).json({
      message: 'Xóa lớp thành công'
    });
  } catch (error) {
    next(error);
  }
};

// Thêm học viên vào class
export const addStudentToClassController = async (req, res, next) => {
  try {
    const { classId, userId } = req.body;

    if (!classId || !userId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp classId và userId' });
    }

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ message: 'Lớp không tồn tại' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    // Cập nhật classId cho user
    user.classId = classId;
    await user.save();

    return res.status(200).json({
      message: 'Thêm học viên vào lớp thành công',
      user
    });
  } catch (error) {
    next(error);
  }
};

// Xóa học viên khỏi class
export const removeStudentFromClassController = async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp userId' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    user.classId = null;
    await user.save();

    return res.status(200).json({
      message: 'Xóa học viên khỏi lớp thành công',
      user
    });
  } catch (error) {
    next(error);
  }
};
