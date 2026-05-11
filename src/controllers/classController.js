import Class from '../models/class.schema.js';
import User from '../models/user.schema.js';
import Chapter from '../models/chapter.schema.js';
import Lesson from '../models/lesson.schema.js';
import LessonCompletion from '../models/lessonCompletion.schema.js';
import ChapterCompletion from '../models/chapterCompletion.schema.js';
import ClassCompletion from '../models/classCompletion.schema.js';
import UserActivity from '../models/userActivity.schema.js';
import Progress from '../models/progress.schema.js';
import QuizAttempt from '../models/quizAttempt.schema.js';
import mongoose from 'mongoose';

// Lấy tất cả classes
export const getAllClassesController = async (req, res, next) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);

    // Get classes ordered
    const classes = await Class.find().sort({ order: 1, createdAt: 1, _id: 1 }).select('-description -createdAt -__v').lean();

    if (!userId) {
      // If no user (shouldn't happen due to auth), return classes without user-specific fields
      return res.status(200).json({ message: 'Lấy danh sách lớp thành công', data: classes });
    }

    // Collect ids
    const classIds = classes.map(c => c._id);

    // Load chapters, lessons, progresses and completions in bulk
    const chapters = await Chapter.find({ classId: { $in: classIds } }).sort({ order: 1 }).lean();
    const chapterIds = chapters.map(ch => ch._id);
    const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).sort({ order: 1 }).lean();
    const lessonIds = lessons.map(l => l._id);
    const progresses = await Progress.find({ lessonId: { $in: lessonIds } }).select('_id lessonId').lean();

    // User completion/activity data
    const userActivities = await UserActivity.find({ userId, progressId: { $in: progresses.map(p => p._id) } }).select('progressId isCompleted').lean();
    const lessonCompletions = await LessonCompletion.find({ userId, lessonId: { $in: lessonIds } }).lean();
    const chapterCompletions = await ChapterCompletion.find({ userId, chapterId: { $in: chapterIds } }).lean();
    const classCompletions = await ClassCompletion.find({ userId, classId: { $in: classIds } }).lean();

    const completedProgressSet = new Set(userActivities.filter(a => a.isCompleted).map(a => String(a.progressId)));
    const lessonCompletionMap = new Map(lessonCompletions.map(lc => [String(lc.lessonId), lc.isCompleted]));
    const chapterCompletionMap = new Map(chapterCompletions.map(cc => [String(cc.chapterId), cc.isCompleted]));
    const classCompletionMap = new Map(classCompletions.map(cc => [String(cc.classId), cc.isCompleted]));

    // helpers
    const progressesByLesson = new Map();
    progresses.forEach(p => {
      const key = String(p.lessonId);
      if (!progressesByLesson.has(key)) progressesByLesson.set(key, []);
      progressesByLesson.get(key).push(String(p._id));
    });

    const lessonsByChapter = new Map();
    lessons.forEach(l => {
      const key = String(l.chapterId);
      if (!lessonsByChapter.has(key)) lessonsByChapter.set(key, []);
      lessonsByChapter.get(key).push(l);
    });

    const chaptersByClass = new Map();
    chapters.forEach(ch => {
      const key = String(ch.classId);
      if (!chaptersByClass.has(key)) chaptersByClass.set(key, []);
      chaptersByClass.get(key).push(ch);
    });

    // compute per-lesson percent
    const lessonPercentMap = new Map();
    lessons.forEach(lesson => {
      const pids = progressesByLesson.get(String(lesson._id)) || [];
      if (pids.length === 0) {
        const lc = lessonCompletionMap.get(String(lesson._id));
        lessonPercentMap.set(String(lesson._id), lc ? 100 : 0);
      } else {
        const done = pids.filter(pid => completedProgressSet.has(pid)).length;
        lessonPercentMap.set(String(lesson._id), Math.round((done / pids.length) * 10000) / 100);
      }
    });

    // compute per-chapter percent (average of its lessons)
    const chapterPercentMap = new Map();
    chapters.forEach(ch => {
      const ls = lessonsByChapter.get(String(ch._id)) || [];
      if (ls.length === 0) {
        const cc = chapterCompletionMap.get(String(ch._id));
        chapterPercentMap.set(String(ch._id), cc ? 100 : 0);
      } else {
        const avg = ls.reduce((s, l) => s + (lessonPercentMap.get(String(l._id)) || 0), 0) / ls.length;
        chapterPercentMap.set(String(ch._id), Math.round(avg * 100) / 100);
      }
    });

    // compute per-class percent (average of its chapters)
    const classPercentMap = new Map();
    classes.forEach(cls => {
      const chs = chaptersByClass.get(String(cls._id)) || [];
      if (chs.length === 0) {
        const cc = classCompletionMap.get(String(cls._id));
        classPercentMap.set(String(cls._id), cc ? 100 : 0);
      } else {
        const avg = chs.reduce((s, ch) => s + (chapterPercentMap.get(String(ch._id)) || 0), 0) / chs.length;
        classPercentMap.set(String(cls._id), Math.round(avg * 100) / 100);
      }
    });

    // determine current class: first class (by order) with percent < 100 and without classCompletion
    let currentClassId = null;
    for (const cls of classes) {
      const clsId = String(cls._id);
      const isComplete = !!classCompletionMap.get(clsId) || (classPercentMap.get(clsId) || 0) >= 100;
      if (!isComplete) { currentClassId = clsId; break; }
    }

    const out = classes.map(cls => {
      const cid = String(cls._id);
      const completedPercent = classCompletionMap.get(cid) ? 100 : (classPercentMap.get(cid) || 0);
      const isComplete = !!classCompletionMap.get(cid) || completedPercent >= 100;
      return {
        ...cls,
        isComplete,
        isCurrent: currentClassId === cid,
        completedPercent
      };
    });

    return res.status(200).json({ message: 'Lấy danh sách lớp thành công', data: out });
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

    const students = await User.find({ classId: id, isStatus: { $ne: 'deleted' } }).select('-passwordHash');

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
    const { name, description, level, order } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Vui lòng nhập tên lớp' });
    }

    const newClass = new Class({
      name,
      order: order !== undefined ? order : 0,
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
    const { name, description, level, order } = req.body;

    const classData = await Class.findByIdAndUpdate(
      id,
      {
        name,
        description,
        level,
        ...(order !== undefined ? { order } : {})
      },
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

    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } });
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

// Chọn class cho user (gán classId cho user) và đánh completed cho các class trước đó
export const selectClassController = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const userId = req.user && (req.user.id || req.user._id);

    if (!userId) return res.status(401).json({ message: 'Không xác định được user' });

    if (!mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ message: 'classId không hợp lệ' });
    }

    const cls = await Class.findById(classId);
    if (!cls) return res.status(404).json({ message: 'Lớp không tồn tại' });

    // Update user's classId
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Người dùng không tồn tại' });

    user.classId = cls._id;
    await user.save();

    // Find all classes with order less than selected class order
    const previousClasses = await Class.find({ order: { $lt: cls.order } }).sort({ order: 1 });

    let marked = 0;
    for (const prev of previousClasses) {
      let cc = await ClassCompletion.findOne({ userId, classId: prev._id });
      if (!cc) {
        cc = new ClassCompletion({ userId, classId: prev._id, isCompleted: true, completedAt: new Date() });
      } else {
        if (!cc.isCompleted) {
          cc.isCompleted = true;
          cc.completedAt = new Date();
        }
      }
      await cc.save();
      marked += 1;
    }

    return res.status(200).json({ message: 'Chọn lớp thành công', markedPreviousClasses: marked });
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

    const user = await User.findOne({ _id: userId, isStatus: { $ne: 'deleted' } });
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
const roundPercent = (value) => Number(Number(value || 0).toFixed(2));

export const getClassChaptersMapController = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const userId = req.user.id;

    // 1. Kiểm tra class có tồn tại không
    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ message: 'Lớp không tồn tại' });
    }

    // 1.1. Chỉ cho phép xem class này khi class trước đó đã hoàn thành
    const orderedClasses = await Class.find().sort({ order: 1, createdAt: 1, _id: 1 });
    const currentClassIndex = orderedClasses.findIndex((item) => item._id.toString() === classId);

    if (currentClassIndex > 0) {
      const previousClass = orderedClasses[currentClassIndex - 1];
      const previousClassCompletion = await ClassCompletion.findOne({
        userId,
        classId: previousClass._id,
        isCompleted: true
      });

      if (!previousClassCompletion) {
        return res.status(400).json({
          message: 'Bạn phải hoàn thành lớp trước đó trước khi xem nội dung lớp này'
        });
      }
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
    const chapterCompletions = await ChapterCompletion.find({
      userId,
      chapterId: { $in: chapterIds }
    });

    // Tạo Map để check nhanh completed lessons
    const completedLessonMap = new Map();
    lessonCompletions.forEach(lc => {
      completedLessonMap.set(lc.lessonId.toString(), lc.isCompleted);
    });
    const completedChapterMap = new Map();
    chapterCompletions.forEach(cc => {
      completedChapterMap.set(cc.chapterId.toString(), cc.isCompleted);
    });

    // 5. Tìm lesson đầu tiên chưa hoàn thành trên toàn bộ chapters (chỉ 1 isCurrent toàn cục)
    // Nếu tất cả đã hoàn thành, giữ isCurrent = true tại lesson cuối cùng
    let currentLessonId = null;
    outer: for (const chapter of chapters) {
      const chapterLessons = allLessons.filter(
        lesson => lesson.chapterId.toString() === chapter._id.toString()
      );
      for (const lesson of chapterLessons) {
        const isCompleted = completedLessonMap.get(lesson._id.toString()) || false;
        if (!isCompleted) {
          currentLessonId = lesson._id.toString();
          break outer;
        }
      }
    }
    if (currentLessonId === null && allLessons.length > 0) {
      currentLessonId = allLessons[allLessons.length - 1]._id.toString();
    }

    // Build response: mỗi chapter bọc lessons của nó
    const chaptersWithLessons = chapters.map(chapter => {
      // Lấy lessons của chapter này
      const chapterLessons = allLessons.filter(
        lesson => lesson.chapterId.toString() === chapter._id.toString()
      );

      // Build lessons với status
      const lessonsWithStatus = chapterLessons.map(lesson => {
        const isCompleted = completedLessonMap.get(lesson._id.toString()) || false;
        const isCurrent = currentLessonId === lesson._id.toString();

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
        isCompleted:
          completedChapterMap.get(chapter._id.toString()) ||
          (chapterLessons.length > 0 &&
            chapterLessons.every(ls => completedLessonMap.get(ls._id.toString()) || false)),
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

const normalizeText = (text) => {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[\u0111\u0110]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
};

export const getClassChaptersPracticeMapController = async (req, res, next) => {
  try {
    const { classId, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId không hợp lệ' });
    }

    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ message: 'Lớp không tồn tại' });
    }

    const chapters = await Chapter.find({ classId }).sort({ order: 1 });
    if (chapters.length === 0) {
      return res.status(200).json({
        message: 'Lớp chưa có chapter nào',
        chapters: []
      });
    }

    const chapterIds = chapters.map((chapter) => chapter._id);
    const allLessons = await Lesson.find({ chapterId: { $in: chapterIds } }).sort({ order: 1 });
    const lessonIds = allLessons.map((lesson) => lesson._id);

    const progresses = await Progress.find({ lessonId: { $in: lessonIds } })
      .select('_id lessonId progressName')
      .lean();

    const practiceProgresses = progresses.filter(
      (progress) => normalizeText(progress.progressName) === 'luyen tap'
    );

    const lessonPracticeProgressMap = new Map();
    practiceProgresses.forEach((progress) => {
      const lessonKey = String(progress.lessonId);
      if (!lessonPracticeProgressMap.has(lessonKey)) {
        lessonPracticeProgressMap.set(lessonKey, []);
      }
      lessonPracticeProgressMap.get(lessonKey).push(String(progress._id));
    });

    const practiceProgressIds = practiceProgresses.map((progress) => progress._id);
    let attemptedProgressSet = new Set();

    if (practiceProgressIds.length > 0) {
      const attempts = await QuizAttempt.find({
        userId: new mongoose.Types.ObjectId(userId),
        progressId: { $in: practiceProgressIds }
      })
        .select('progressId')
        .lean();

      attemptedProgressSet = new Set(attempts.map((attempt) => String(attempt.progressId)));
    }

    const chaptersWithLessons = chapters.map((chapter) => {
      const chapterLessons = allLessons.filter(
        (lesson) => String(lesson.chapterId) === String(chapter._id)
      );

      const lessonsWithStatus = chapterLessons.map((lesson) => {
        const lessonProgressIds = lessonPracticeProgressMap.get(String(lesson._id)) || [];
        const isCompleted = lessonProgressIds.some((progressId) => attemptedProgressSet.has(progressId));

        return {
          _id: lesson._id,
          lessonName: lesson.lessonName || null,
          description: lesson.description,
          order: lesson.order,
          isCompleted
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
