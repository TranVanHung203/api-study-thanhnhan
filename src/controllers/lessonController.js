import Lesson from '../models/lesson.schema.js';

// Lấy danh sách lessons của một chapter
export const getLessonsByChapterController = async (req, res, next) => {
  try {
    const { chapterId } = req.params;

    const lessons = await Lesson.find({ chapterId })
      .sort({ order: 1 });

    return res.status(200).json({ lessons });
  } catch (error) {
    next(error);
  }
};

// Tạo lesson mới
export const createLessonController = async (req, res, next) => {
  try {
    const { chapterId, lessonName, description, order } = req.body;

    if (!chapterId || !lessonName) {
      return res.status(400).json({ message: 'chapterId và lessonName là bắt buộc' });
    }

    // Nếu không truyền order, tự động lấy order cao nhất + 1
    let lessonOrder = order;
    if (lessonOrder === undefined) {
      const maxOrderLesson = await Lesson.findOne({ chapterId }).sort({ order: -1 });
      lessonOrder = maxOrderLesson ? maxOrderLesson.order + 1 : 1;
    }

    const lesson = new Lesson({
      chapterId,
      lessonName,
      description,
      order: lessonOrder
    });

    await lesson.save();

    return res.status(201).json({
      message: 'Tạo lesson thành công',
      lesson
    });
  } catch (error) {
    next(error);
  }
};

// Cập nhật lesson
export const updateLessonController = async (req, res, next) => {
  try {
    const { lessonId } = req.params;
    const { lessonName, description, order } = req.body;

    const lesson = await Lesson.findByIdAndUpdate(
      lessonId,
      { lessonName, description, order },
      { new: true }
    );

    return res.status(200).json({
      message: 'Cập nhật lesson thành công',
      lesson
    });
  } catch (error) {
    next(error);
  }
};

// Xóa lesson
export const deleteLessonController = async (req, res, next) => {
  try {
    const { lessonId } = req.params;

    await Lesson.findByIdAndDelete(lessonId);

    return res.status(200).json({
      message: 'Xóa lesson thành công'
    });
  } catch (error) {
    next(error);
  }
};
