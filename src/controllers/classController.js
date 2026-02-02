import Class from '../models/class.schema.js';
import User from '../models/user.schema.js';
import Chapter from '../models/chapter.schema.js';
import Lesson from '../models/lesson.schema.js';
import LessonCompletion from '../models/lessonCompletion.schema.js';

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

// =====================================================
// Lấy tất cả chapters với lessons và trạng thái học của user
// =====================================================
export const getClassChaptersMapController = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const userId = req.user.id;

    // 1. Kiểm tra class có tồn tại không
    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ message: 'Lớp không tồn tại' });
    }

    // 2. Lấy tất cả chapters của class, sắp xếp theo order
    const chapters = await Chapter.find({ classId }).sort({ order: 1 });
    
    if (chapters.length === 0) {
      return res.status(200).json({
        message: 'Lớp chưa có chapter nào',
        chapters: []
      });
    }

    // 3. Lấy tất cả lessons của các chapters này
    const chapterIds = chapters.map(c => c._id);
    const allLessons = await Lesson.find({ chapterId: { $in: chapterIds } }).sort({ order: 1 });
    
    // 4. Lấy tất cả lesson completions của user
    const allLessonIds = allLessons.map(l => l._id);
    const lessonCompletions = await LessonCompletion.find({
      userId,
      lessonId: { $in: allLessonIds }
    });

    // Tạo Map để check nhanh completed lessons
    const completedLessonMap = new Map();
    lessonCompletions.forEach(lc => {
      completedLessonMap.set(lc.lessonId.toString(), lc.isCompleted);
    });

    // 5. Build response: mỗi chapter bọc lessons của nó
    const chaptersWithLessons = chapters.map(chapter => {
      // Lấy lessons của chapter này
      const chapterLessons = allLessons.filter(
        lesson => lesson.chapterId.toString() === chapter._id.toString()
      );

      // Tìm lesson đầu tiên chưa hoàn thành trong chapter này
      let currentLessonOrder = null;
      for (const lesson of chapterLessons) {
        const isCompleted = completedLessonMap.get(lesson._id.toString()) || false;
        if (!isCompleted) {
          currentLessonOrder = lesson.order;
          break;
        }
      }

      // Build lessons với status
      const lessonsWithStatus = chapterLessons.map(lesson => {
        const isCompleted = completedLessonMap.get(lesson._id.toString()) || false;
        const isCurrent = currentLessonOrder === lesson.order;

        return {
          _id: lesson._id,
          lessonName: lesson.lessonName || null,
          description: lesson.description,
          order: lesson.order,
          isCompleted,
          isCurrent
        };
      });

      return {
        _id: chapter._id,
        chapterName: chapter.chapterName,
        description: chapter.description,
        order: chapter.order,
        lessons: lessonsWithStatus
      };
    });

    return res.status(200).json({
      chapters: chaptersWithLessons
    });
  } catch (error) {
    next(error);
  }
};
