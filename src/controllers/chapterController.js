import Chapter from '../models/chapter.schema.js';
import Lesson from '../models/lesson.schema.js';
import Progress from '../models/progress.schema.js';
import UserActivity from '../models/userActivity.schema.js';
import Video from '../models/video.schema.js';
import LessonCompletion from '../models/lessonCompletion.schema.js';

// Tạo chapter mới
export const createChapterController = async (req, res, next) => {
  try {
    const { classId, chapterName, description, order } = req.body;

    if (!classId || !chapterName) {
      return res.status(400).json({ message: 'classId và chapterName là bắt buộc' });
    }

    // Nếu không truyền order, tự động lấy order cao nhất + 1
    let chapterOrder = order;
    if (chapterOrder === undefined) {
      const maxOrderChapter = await Chapter.findOne({ classId }).sort({ order: -1 });
      chapterOrder = maxOrderChapter ? maxOrderChapter.order + 1 : 1;
    }

    const chapter = new Chapter({
      classId,
      chapterName,
      description,
      order: chapterOrder
    });

    await chapter.save();

    return res.status(201).json({
      message: 'Tạo chapter thành công',
      chapter
    });
  } catch (error) {
    next(error);
  }
};

// Lấy tất cả chapters của một class
export const getChaptersByClassController = async (req, res, next) => {
  try {
    const { classId } = req.params;

    const chapters = await Chapter.find({ classId }).sort({ order: 1 });

    return res.status(200).json({ chapters });
  } catch (error) {
    next(error);
  }
};

// Lấy chi tiết chapter
export const getChapterByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const chapter = await Chapter.findById(id).populate('classId');

    if (!chapter) {
      return res.status(404).json({ message: 'Chapter không tìm thấy' });
    }

    return res.status(200).json({ chapter });
  } catch (error) {
    next(error);
  }
};

// Cập nhật chapter
export const updateChapterController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { chapterName, description, order } = req.body;

    const chapter = await Chapter.findByIdAndUpdate(
      id,
      { chapterName, description, order },
      { new: true, runValidators: true }
    );

    if (!chapter) {
      return res.status(404).json({ message: 'Chapter không tìm thấy' });
    }

    return res.status(200).json({
      message: 'Cập nhật chapter thành công',
      chapter
    });
  } catch (error) {
    next(error);
  }
};

// Xóa chapter
export const deleteChapterController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const chapter = await Chapter.findByIdAndDelete(id);

    if (!chapter) {
      return res.status(404).json({ message: 'Chapter không tìm thấy' });
    }

    // Xóa tất cả Lessons thuộc chapter này
    await Lesson.deleteMany({ chapterId: id });

    return res.status(200).json({ message: 'Xóa chapter thành công' });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// API CHÍNH: Lấy map chapter với trạng thái học của user
// =====================================================
export const getChapterMapController = async (req, res, next) => {
  try {
    const { chapterId } = req.params;
    const userId = req.user.id;

    // 1. Lấy chapter
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      return res.status(404).json({ message: 'Chapter không tìm thấy' });
    }

    // 2. Lấy tất cả Lessons của chapter, sắp xếp theo order
    const lessons = await Lesson.find({ chapterId }).sort({ order: 1 });
    const lessonIds = lessons.map(l => l._id);

    // 3. Lấy tất cả LessonCompletion của user cho các lessons này
    const lessonCompletions = await LessonCompletion.find({
      userId,
      lessonId: { $in: lessonIds }
    });

    // Tạo Map để check nhanh completed lessons
    const completedLessonMap = new Map();
    lessonCompletions.forEach(lc => {
      completedLessonMap.set(lc.lessonId.toString(), lc.isCompleted);
    });

    // Tìm Lesson đầu tiên chưa hoàn thành
    let currentLessonOrder = null;
    for (const lesson of lessons) {
      const isCompleted = completedLessonMap.get(lesson._id.toString()) || false;
      if (!isCompleted) {
        currentLessonOrder = lesson.order;
        break;
      }
    }

    // Build Lessons response
    const lessonsWithStatus = lessons.map(lesson => {
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

    return res.status(200).json({
      chapter: {
        _id: chapter._id,
        chapterName: chapter.chapterName,
        description: chapter.description,
        order: chapter.order
      },
      lessons: lessonsWithStatus
    });
  } catch (error) {
    next(error);
  }
};










// Chèn Lesson mới vào giữa (reorder)
export const insertLessonController = async (req, res, next) => {
  try {
    const { chapterId, lessonName, description, afterOrder } = req.body;

    if (!chapterId || !lessonName) {
      return res.status(400).json({ message: 'chapterId và lessonName là bắt buộc' });
    }

    // afterOrder = order của lesson mà lesson mới sẽ đứng sau
    // VD: afterOrder = 2 → lesson mới sẽ có order = 3, các lesson order >= 3 sẽ +1

    // 1. Tăng order của các lesson có order > afterOrder
    await Lesson.updateMany(
      { chapterId, order: { $gt: afterOrder || 0 } },
      { $inc: { order: 1 } }
    );

    // 2. Tạo Lesson mới với order = afterOrder + 1
    const newOrder = (afterOrder || 0) + 1;
    const lesson = new Lesson({
      chapterId,
      lessonName,
      description,
      order: newOrder
    });

    await lesson.save();

    return res.status(201).json({
      message: 'Chèn Lesson thành công',
      lesson
    });
  } catch (error) {
    next(error);
  }
};

// Chèn progress mới vào giữa (reorder)
export const insertProgressController = async (req, res, next) => {
  try {
    const { lessonId, contentId, afterStepNumber } = req.body;

    if (!lessonId || !contentId) {
      return res.status(400).json({ message: 'lessonId và contentId là bắt buộc' });
    }

    // Tự động phát hiện loại content
    let ContentModel = null;
    let detectedContentType = null;

    // Kiểm tra trong Video collection
    let content = await Video.findById(contentId);
    if (content) {
      ContentModel = Video;
      detectedContentType = 'video';
    } else {
      // Kiểm tra trong Exercise collection
      content = await Exercise.findById(contentId);
      if (content) {
        ContentModel = Exercise;
        detectedContentType = 'exercise';
      } else {
        // Kiểm tra trong Quiz collection
        content = await Quiz.findById(contentId);
        if (content) {
          ContentModel = Quiz;
          detectedContentType = 'quiz';
        }
      }
    }

    if (!content) {
      return res.status(404).json({ message: 'contentId không tồn tại' });
    }

    // 1. Tăng stepNumber của các progress có stepNumber > afterStepNumber
    await Progress.updateMany(
      { lessonId, stepNumber: { $gt: afterStepNumber || 0 } },
      { $inc: { stepNumber: 1 } }
    );

    // 2. Tạo progress mới (không lưu contentId trên Progress)
    const newStepNumber = (afterStepNumber || 0) + 1;
    const progress = new Progress({
      lessonId,
      stepNumber: newStepNumber
    });

    await progress.save();

    // Link content -> progress (set progressId trên content document)
    content.progressId = progress._id;
    await content.save();

    // Return compatibility payload including contentId
    const cp = progress.toObject();
    cp.contentId = content._id;

    return res.status(201).json({
      message: 'Chèn progress thành công',
      progress: cp
    });
  } catch (error) {
    next(error);
  }
};
