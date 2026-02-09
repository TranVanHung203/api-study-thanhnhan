import Progress from '../models/progress.schema.js';
import Lesson from '../models/lesson.schema.js';
import Video from '../models/video.schema.js';
import Exercise from '../models/exercise.schema.js';
import Quiz from '../models/quiz.schema.js';
import UserActivity from '../models/userActivity.schema.js';
import LessonCompletion from '../models/lessonCompletion.schema.js';

// Helper function: Create slug from text
const createSlug = (text) => {
  if (!text) return null;
  return text
    .trim()
    .replace(/[Đ]/g, 'D') // Replace Đ -> D
    .replace(/[đ]/g, 'd') // Replace đ -> d
    .normalize('NFD') // Normalize Vietnamese diacritics
    .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters (keep only letters, numbers, underscore, spaces)
    .replace(/\s+/g, '_') // Replace one or more spaces with single underscore
    .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
};

// Lấy danh sách progress của một lesson
export const getProgressByLessonController = async (req, res, next) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user && (req.user.id || req.user._id);

    const progresses = await Progress.find({ lessonId })
      .sort({ stepNumber: 1 });

    // Populate lesson để lấy lessonName, order, chapterId
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson không tìm thấy' });
    }
    const lessonSlug = createSlug(lesson.lessonName);

    // Kiểm tra lesson trước đã completed chưa
    let isPreviousLessonCompleted = true;
    
    if (lesson.order > 1) {
      // Tìm lesson trước trong cùng chapter
      const previousLesson = await Lesson.findOne({
        chapterId: lesson.chapterId,
        order: lesson.order - 1
      });

      if (previousLesson && userId) {
        // Kiểm tra lesson trước đã completed chưa
        const previousLessonCompletion = await LessonCompletion.findOne({
          userId,
          lessonId: previousLesson._id,
          isCompleted: true
        });
        
        isPreviousLessonCompleted = !!previousLessonCompletion;
      } else if (!userId) {
        // Nếu không có userId (guest), coi như chưa hoàn thành
        isPreviousLessonCompleted = false;
      }
    }

    // Lấy UserActivity để biết progress nào completed
    let userActivities = [];
    const progressIds = progresses.map(p => p._id);
    if (userId && progressIds.length > 0) {
      userActivities = await UserActivity.find({
        userId,
        progressId: { $in: progressIds },
        isCompleted: true
      });
    }

    // Tìm step hoàn thành cao nhất
    let maxCompletedStep = 0;
    userActivities.forEach(ua => {
      const progress = progresses.find(p => p._id.toString() === ua.progressId.toString());
      if (progress && progress.stepNumber > maxCompletedStep) {
        maxCompletedStep = progress.stepNumber;
      }
    });

    // Map progress to output with isLock, progressSlug, và lessonSlug
    const out = progresses.map(p => {
      let isLock;

      // Nếu lesson trước chưa completed → lock TẤT CẢ progress
      if (!isPreviousLessonCompleted) {
        isLock = true;
      } else {
        // Lesson trước đã completed → áp dụng logic unlock theo stepNumber
        if (p.stepNumber <= maxCompletedStep) {
          // Step trước step hoàn thành cao nhất -> không khóa
          isLock = false;
        } else if (p.stepNumber === maxCompletedStep + 1) {
          // Step tiếp theo -> không khóa (mở khóa)
          isLock = false;
        } else {
          // Step sau step tiếp theo -> khóa
          isLock = true;
        }
      }

      return {
        _id: p._id,
        lessonId: p.lessonId,
        stepNumber: p.stepNumber,
        progressName: p.progressName || null,
        progressSlug: createSlug(p.progressName),
        lessonSlug,
        isLock
      };
    });

    return res.status(200).json({ progresses: out });
  } catch (error) {
    next(error);
  }
};

// Tạo progress item (video, exercise, quiz)
export const createProgressController = async (req, res, next) => {
  try {
    const { lessonId, stepNumber, contentId } = req.body;

    // Kiểm tra contentId tồn tại
    let content;
    const video = await Video.findById(contentId);
    const exercise = await Exercise.findById(contentId);
    const quiz = await Quiz.findById(contentId);
    content = video || exercise || quiz;

    if (!content) {
      return res.status(404).json({ message: 'Nội dung không tìm thấy' });
    }

    const progress = new Progress({
      lessonId,
      stepNumber
    });

    await progress.save();

    // Link content -> progress
    content.progressId = progress._id;
    await content.save();

    const cp = progress.toObject();
    cp.contentId = content._id;

    return res.status(201).json({
      message: 'Tạo progress thành công',
      progress: cp
    });
  } catch (error) {
    next(error);
  }
};

// Cập nhật progress
export const updateProgressController = async (req, res, next) => {
  try {
    const { progressId } = req.params;
    const { stepNumber, contentId } = req.body;

    const progress = await Progress.findById(progressId);
    if (!progress) return res.status(404).json({ message: 'Progress không tìm thấy' });

    // If contentId changed, unlink previous content and link new content
    if (contentId) {
      // unlink any existing content that referenced this progress
      const prevVideo = await Video.findOne({ progressId: progress._id });
      if (prevVideo) { prevVideo.progressId = undefined; await prevVideo.save(); }
      const prevEx = await Exercise.findOne({ progressId: progress._id });
      if (prevEx) { prevEx.progressId = undefined; await prevEx.save(); }
      const prevQ = await Quiz.findOne({ progressId: progress._id });
      if (prevQ) { prevQ.progressId = undefined; await prevQ.save(); }

      // link new content
      let newContent = null;
      newContent = await Video.findById(contentId) || await Exercise.findById(contentId) || await Quiz.findById(contentId);
      if (!newContent) return res.status(404).json({ message: 'Nội dung mới không tìm thấy' });
      newContent.progressId = progress._id;
      await newContent.save();
    }

    // Update fields
    progress.stepNumber = stepNumber !== undefined ? stepNumber : progress.stepNumber;
    await progress.save();

    // attach contentId for compatibility
    const content = await Video.findOne({ progressId: progress._id }) || await Exercise.findOne({ progressId: progress._id }) || await Quiz.findOne({ progressId: progress._id });
    const out = progress.toObject();
    out.contentId = content ? content._id : null;

    return res.status(200).json({ message: 'Cập nhật progress thành công', progress: out });
  } catch (error) {
    next(error);
  }
};

// Xóa progress
export const deleteProgressController = async (req, res, next) => {
  try {
    const { progressId } = req.params;

    // Unlink content documents that reference this progress
    const prevVideo = await Video.findOne({ progressId });
    if (prevVideo) { prevVideo.progressId = undefined; await prevVideo.save(); }
    const prevEx = await Exercise.findOne({ progressId });
    if (prevEx) { prevEx.progressId = undefined; await prevEx.save(); }
    const prevQ = await Quiz.findOne({ progressId });
    if (prevQ) { prevQ.progressId = undefined; await prevQ.save(); }

    await Progress.findByIdAndDelete(progressId);

    return res.status(200).json({ message: 'Xóa progress thành công' });
  } catch (error) {
    next(error);
  }
};

// Đánh dấu hoàn thành một progress
export const completeProgressController = async (req, res, next) => {
  try {
    const { progressId } = req.params;
    const userId = req.user && (req.user.id || req.user._id);

    if (!userId) {
      return res.status(401).json({ message: 'Không xác định được user' });
    }

    // Kiểm tra progress tồn tại
    const progress = await Progress.findById(progressId);
    if (!progress) {
      return res.status(404).json({ message: 'Progress không tìm thấy' });
    }

    // Kiểm tra loại progress: phải là "Khởi động" hoặc "Hình thành kiến thức"
    const progressName = progress.progressName || '';
    const isValidType = progressName.includes('Khởi động') || progressName.includes('Hình thành kiến thức');
    
    if (!isValidType) {
      return res.status(400).json({ 
        message: 'Chỉ có thể đánh dấu hoàn thành progress loại "Khởi động" hoặc "Hình thành kiến thức"' 
      });
    }

    // Lấy thông tin lesson
    const lesson = await Lesson.findById(progress.lessonId);
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson không tìm thấy' });
    }

    // Kiểm tra lesson trước đã hoàn thành chưa
    if (lesson.order > 1) {
      const previousLesson = await Lesson.findOne({
        chapterId: lesson.chapterId,
        order: lesson.order - 1
      });

      if (previousLesson) {
        const previousLessonCompletion = await LessonCompletion.findOne({
          userId,
          lessonId: previousLesson._id,
          isCompleted: true
        });
        
        if (!previousLessonCompletion) {
          return res.status(400).json({ 
            message: 'Bạn phải hoàn thành lesson trước đó trước khi đánh dấu progress này' 
          });
        }
      }
    }

    // Kiểm tra progress trước đã hoàn thành chưa
    if (progress.stepNumber > 1) {
      const previousProgress = await Progress.findOne({
        lessonId: progress.lessonId,
        stepNumber: progress.stepNumber - 1
      });

      if (previousProgress) {
        const previousActivity = await UserActivity.findOne({
          userId,
          progressId: previousProgress._id,
          isCompleted: true
        });

        if (!previousActivity) {
          return res.status(400).json({ 
            message: 'Bạn phải hoàn thành progress trước đó trước khi đánh dấu progress này' 
          });
        }
      }
    }

    // Tìm hoặc tạo UserActivity
    let activity = await UserActivity.findOne({ progressId, userId });

    if (!activity) {
      activity = new UserActivity({
        userId,
        progressId,
        isCompleted: true,
        completedAt: new Date()
      });
    } else {
      activity.isCompleted = true;
      activity.completedAt = new Date();
    }

    await activity.save();

    // Kiểm tra xem có phải là progress cuối cùng của lesson không
    const allProgresses = await Progress.find({ lessonId: progress.lessonId })
      .sort({ stepNumber: 1 });
    
    // Lấy stepNumber cao nhất
    const maxStepNumber = Math.max(...allProgresses.map(p => p.stepNumber));
    
    // Nếu progress hiện tại là progress cuối cùng (max stepNumber) → đánh dấu lesson completed
    if (progress.stepNumber === maxStepNumber) {
      let lessonCompletion = await LessonCompletion.findOne({
        userId,
        lessonId: progress.lessonId
      });

      if (!lessonCompletion) {
        lessonCompletion = new LessonCompletion({
          userId,
          lessonId: progress.lessonId,
          isCompleted: true,
          completedAt: new Date()
        });
      } else {
        lessonCompletion.isCompleted = true;
        lessonCompletion.completedAt = new Date();
      }

      await lessonCompletion.save();
    }

    return res.status(200).json({
      message: 'Đánh dấu hoàn thành thành công',
      activity,
      lessonCompleted: progress.stepNumber === maxStepNumber
    });
  } catch (error) {
    next(error);
  }
};
