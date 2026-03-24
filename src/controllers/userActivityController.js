import UserActivity from '../models/userActivity.schema.js';
import Reward from '../models/reward.schema.js';
import Progress from '../models/progress.schema.js';
import Lesson from '../models/lesson.schema.js';
import Exercise from '../models/exercise.schema.js';
import Video from '../models/video.schema.js';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';
import QuizAttempt from '../models/quizAttempt.schema.js';
import VideoWatch from '../models/videoWatch.schema.js';
import BadRequestError from '../errors/badRequestError.js';
import NotFoundError from '../errors/notFoundError.js';
import UnauthorizedError from '../errors/unauthorizedError.js';

/**
 * Validate đáp án exercise dựa theo exerciseType
 * 
 * @param {string} exerciseType - Loại bài tập
 * @param {number} correctAnswer - Đáp án đúng từ database
 * @param {array} userAnswer - Mảng items user gửi lên
 * @returns {object} { isCorrect: boolean, message: string }
 * 
 * Hiện tại hỗ trợ:
 * - drag_count: Đếm số item trong mảng, so sánh với answer
 * 
 * [TODO] Thêm các loại khác khi cần:
 * - drag_sort: Phân loại đúng vị trí
 * - matching: Nối đúng cặp
 * - fill_number: Điền đúng số
 * - ordering: Sắp đúng thứ tự
 * - multiple_choice: Chọn đúng đáp án
 */
export const validateExerciseAnswer = (exerciseType, correctAnswer, userAnswer) => {
  // ✅ Chặn tuyệt đối nếu thiếu dữ liệu
  if (!exerciseType) {
    return { isCorrect: false, message: 'Thiếu loại bài tập' };
  }

  if (correctAnswer === undefined || correctAnswer === null) {
    return { isCorrect: false, message: 'Bài tập chưa có đáp án trong hệ thống' };
  }

  switch (exerciseType) {

    // ================= DRAG COUNT =================
    case 'drag_count': {
      if (!Array.isArray(userAnswer)) {
        return { isCorrect: false, message: 'Dữ liệu không hợp lệ' };
      }

      const userCount = userAnswer.length;
      const isCorrect = userCount === correctAnswer;

      return {
        isCorrect,
        message: isCorrect
          ? `✅ Chính xác!`
          : `❌ Chưa đúng!`
      };
    }

    // ================= FILL NUMBER =================
    // case 'fill_number': {
    //   const isCorrect = Number(userAnswer) === Number(correctAnswer);
    //   return {
    //     isCorrect,
    //     message: isCorrect ? '✅ Điền đúng!' : '❌ Điền sai!'
    //   };
    // }

    // ================= MULTIPLE CHOICE =================
    // case 'multiple_choice': {
    //   const isCorrect = userAnswer === correctAnswer;
    //   return {
    //     isCorrect,
    //     message: isCorrect ? '✅ Chọn đúng!' : '❌ Chọn sai!'
    //   };
    // }

    // ================= MATCHING =================
    // case 'matching': {
    //   if (!Array.isArray(userAnswer) || !Array.isArray(correctAnswer)) {
    //     return { isCorrect: false, message: 'Dữ liệu nối cặp không hợp lệ' };
    //   }
    //
    //   const isCorrect =
    //     JSON.stringify(userAnswer.sort()) === JSON.stringify(correctAnswer.sort());
    //
    //   return {
    //     isCorrect,
    //     message: isCorrect ? '✅ Nối đúng tất cả!' : '❌ Nối sai!'
    //   };
    // }

    // ================= ORDERING =================
    // case 'ordering': {
    //   if (!Array.isArray(userAnswer)) {
    //     return { isCorrect: false, message: 'Dữ liệu sắp xếp không hợp lệ' };
    //   }
    //
    //   const isCorrect =
    //     JSON.stringify(userAnswer) === JSON.stringify(correctAnswer);
    //
    //   return {
    //     isCorrect,
    //     message: isCorrect ? '✅ Sắp xếp đúng!' : '❌ Sắp xếp sai!'
    //   };
    // }

    default:
      return { isCorrect: false, message: 'Loại bài tập chưa được hỗ trợ' };
  }
};


// Ghi nhận hoạt động của user (video, exercise, quiz)
// Body cho VIDEO: { progressId, isCompleted: true }
// Body cho EXERCISE: { progressId, exerciseType, userAnswer: ["item1", "item2", ...] }
// Body cho QUIZ: { progressId, score, isCompleted }
export const recordUserActivityController = async (req, res, next) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) throw new UnauthorizedError('Unauthorized');

    const { progressId, score, isCompleted, exerciseType, userAnswer } = req.body;

    // Tìm progress hiện tại
    const currentProgress = await Progress.findById(progressId);
    if (!currentProgress) throw new NotFoundError('Progress không tìm thấy');

    // Tự động lấy contentType từ progress
    const contentType = currentProgress.contentType;

    // Don't return early on existing UserActivity here; we'll determine `isCheck` from VideoWatch later
    // existingActivity will be queried later when needed for completion idempotency

    // Lấy Lesson hiện tại
    const currentLesson = await Lesson.findById(currentProgress.LessonId);
    if (!currentLesson) throw new NotFoundError('Lesson không tìm thấy');

    // ========== KIỂM TRA Lesson TRƯỚC ĐÃ HOÀN THÀNH CHƯA ==========
    if (currentLesson.order > 1) {
      const currentLessonProgresses = await Progress.find({ LessonId: currentLesson._id });
      const currentLessonProgressIds = currentLessonProgresses.map(p => p._id);
      const hasStartedCurrentLesson = await UserActivity.exists({ userId, progressId: { $in: currentLessonProgressIds }, isCompleted: true });
      if (!hasStartedCurrentLesson) {
        const previousLesson = await Lesson.findOne({ chapterId: currentLesson.chapterId, order: currentLesson.order - 1 });
        if (previousLesson) {
          const previousLessonProgresses = await Progress.find({ LessonId: previousLesson._id });
          const previousProgressIds = previousLessonProgresses.map(p => p._id);
          const completedPreviousActivities = await UserActivity.find({ userId, progressId: { $in: previousProgressIds }, isCompleted: true });
          if (completedPreviousActivities.length < previousLessonProgresses.length) {
            const e = new BadRequestError(`Bạn cần hoàn thành Lesson "${previousLesson.LessonName}" trước khi học Lesson này`);
            e.requiredLessonId = previousLesson._id;
            e.requiredLessonName = previousLesson.LessonName;
            throw e;
          }
        }
      }
    }

    // ========== KIỂM TRA CÁC STEP TRƯỚC TRONG CÙNG Lesson ==========
    const currentStepNumber = currentProgress.stepNumber;
    if (currentStepNumber > 1) {
      const previousSteps = await Progress.find({ LessonId: currentProgress.LessonId, stepNumber: { $lt: currentStepNumber } });
      const previousStepIds = previousSteps.map(p => p._id);
      const completedPreviousSteps = await UserActivity.find({ userId, progressId: { $in: previousStepIds }, isCompleted: true });
      const allLessonProgresses = await Progress.find({ LessonId: currentProgress.LessonId });
      const allLessonProgressIds = allLessonProgresses.map(p => p._id);
      const userCompletedInLesson = await UserActivity.find({ userId, progressId: { $in: allLessonProgressIds }, isCompleted: true });
      const completedStepNumbers = new Set();
      let maxCompletedInLesson = 0;
      for (const activity of userCompletedInLesson) {
        const step = allLessonProgresses.find(p => p._id.toString() === activity.progressId.toString());
        if (step) {
          completedStepNumbers.add(step.stepNumber);
          if (step.stepNumber > maxCompletedInLesson) maxCompletedInLesson = step.stepNumber;
        }
      }
      for (let s = 1; s <= maxCompletedInLesson; s++) completedStepNumbers.add(s);
      for (let i = 1; i < currentStepNumber; i++) {
        if (!completedStepNumbers.has(i)) {
          const e = new BadRequestError(`Bạn cần hoàn thành step ${i} trước khi làm step ${currentStepNumber}`);
          e.requiredStep = i;
          e.currentStep = currentStepNumber;
          throw e;
        }
      }
    }

    // ========== XỬ LÝ THEO LOẠI CONTENT ==========
    if (contentType !== 'video') throw new BadRequestError('Endpoint này chỉ dùng để ghi nhận video. Exercise và Quiz xử lý ở endpoints riêng.');

    // VIDEO handling expects a `videoId` in body to mark a specific video as watched
    if (isCompleted !== true) throw new BadRequestError('Vui lòng gửi isCompleted: true để ghi nhận hoàn thành video');

    let { videoId } = req.body;
    // If videoId not provided, allow it when the progress has exactly one video (convenience)
    if (!videoId) {
      const videosForProgress = await Video.find({ progressId: currentProgress._id }).limit(2);
      if (videosForProgress.length === 0) {
        throw new NotFoundError('Progress chưa có video nào');
      }
      if (videosForProgress.length === 1) {
        videoId = videosForProgress[0]._id;
      } else {
        throw new BadRequestError('videoId là bắt buộc khi progress có nhiều hơn 1 video');
      }
    }

    // Verify video belongs to this progress
    const video = await Video.findById(videoId);
    if (!video) throw new NotFoundError('Video không tìm thấy');
    if (video.progressId?.toString() !== currentProgress._id.toString()) {
      throw new BadRequestError('Video không thuộc progress được gửi');
    }

    // Upsert VideoWatch (only one per user+video)
      const existingWatch = await VideoWatch.findOne({ userId, videoId, progressId });
      const isCheck = !!existingWatch;

      // Upsert VideoWatch (only one per user+video)
      await VideoWatch.updateOne(
        { userId, videoId },
        { $setOnInsert: { userId, videoId, progressId, watchedAt: new Date() } },
        { upsert: true }
      );

    // Count total videos for this progress and watched videos by user
    const [totalVideos, watchedCount] = await Promise.all([
      Video.countDocuments({ progressId: currentProgress._id }),
      VideoWatch.countDocuments({ userId, progressId: currentProgress._id })
    ]);

    // If user has watched all videos for this progress, create UserActivity (progress completion)
    if (totalVideos > 0 && watchedCount >= totalVideos) {
      // Check existing UserActivity again (idempotency)
      let createdActivity = await UserActivity.findOne({ userId, progressId, isCompleted: true });
      let bonusEarned = 0;
      if (!createdActivity) {
        // Sum bonus points across videos if any
        const videosForProgress = await Video.find({ progressId: currentProgress._id });
        for (const v of videosForProgress) {
          if (v.bonusPoints) bonusEarned += v.bonusPoints;
        }

        createdActivity = new UserActivity({ userId, progressId, contentType: 'video', score: score || 100, isCompleted: true, bonusEarned });
        await createdActivity.save();

        if (bonusEarned > 0) await Reward.findOneAndUpdate({ userId }, { $inc: { totalPoints: bonusEarned } }, { new: true, upsert: true });
      }

      return res.status(201).json({ message: 'Hoàn thành progress (tất cả video đã xem)', userActivity: createdActivity, bonusEarned, nextStep: currentStepNumber + 1, isCheck,isDone: true });
    }

    // Not yet completed all videos — return watched progress
      return res.status(200).json({ message: 'Đã đánh dấu video là đã xem', watchedCount, totalVideos, completed: false, isCheck, isDone: false });
  } catch (error) {
    next(error);
  }
};

// Lấy lịch sử hoạt động của user
export const getUserActivityHistoryController = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const activities = await UserActivity.find({ userId })
      .populate({
        path: 'progressId',
        populate: { path: 'LessonId' }
      })
      .sort({ completedAt: -1 });

    return res.status(200).json({ activities });
  } catch (error) {
    next(error);
  }
};

// Lấy lịch sử hoạt động cho một progress cụ thể (có phân trang)
export const getProgressActivityHistoryController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { progressId } = req.params;

    // Pagination params
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    // Verify progress exists and belongs to appropriate context (optional)
    const progress = await Progress.findById(progressId);
    if (!progress) {
      return res.status(404).json({ message: 'Progress không tìm thấy' });
    }

    // Query QuizAttempt collection directly for per-attempt details
    const query = { userId, progressId };

    const [total, attemptsRaw] = await Promise.all([
      QuizAttempt.countDocuments(query),
      QuizAttempt.find(query)
        .populate({ path: 'details.questionId' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    // Compute correctCount / totalQuestions for each attempt
    const attempts = attemptsRaw.map(at => {
      const totalQuestions = Array.isArray(at.details) ? at.details.length : 0;
      const correctCount = Array.isArray(at.details) ? at.details.filter(d => d.isCorrect).length : 0;
      const obj = at.toObject ? at.toObject() : JSON.parse(JSON.stringify(at));
      obj.totalQuestions = totalQuestions;
      obj.correctCount = correctCount;
      return obj;
    });

    return res.status(200).json({
      progressId,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      attempts
    });
  } catch (error) {
    next(error);
  }
};

// rating endpoints moved to src/controllers/ratingController.js

// Lấy tiến độ hoàn thành của một kỹ năng
export const getLessonProgressController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { LessonId } = req.params;

    // Lấy tất cả progress steps của Lesson
    const progresses = await Progress.find({ LessonId })
      .sort({ stepNumber: 1 });

    // Lấy activities của user cho Lesson này
    const progressIds = progresses.map(p => p._id);
    const userActivities = await UserActivity.find({
      userId,
      progressId: { $in: progressIds }
    });

    // Tính toán tiến độ
    const totalSteps = progresses.length;
    const completedSteps = userActivities.filter(a => a.isCompleted).length;
    const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    return res.status(200).json({
      LessonId,
      totalSteps,
      completedSteps,
      progressPercentage,
      steps: progresses.map(p => ({
        stepId: p._id,
        stepNumber: p.stepNumber,
        contentType: p.contentType,
        isCompleted: userActivities.some(a => a.progressId.toString() === p._id.toString() && a.isCompleted)
      }))
    });
  } catch (error) {
    next(error);
  }
};

// Lấy tiến độ hoàn thành của cả lớp
export const getClassProgressController = async (req, res, next) => {
  try {
    const { classId } = req.params;

    // Lấy tất cả Lessons của class
    const Lessons = await Lesson.find({ classId });

    const LessonProgress = [];

    for (const Lesson of Lessons) {
      const progresses = await Progress.find({ LessonId: Lesson._id });
      const progressIds = progresses.map(p => p._id);
      const userActivities = await UserActivity.find({
        progressId: { $in: progressIds }
      });

      const totalSteps = progresses.length;
      const completedSteps = userActivities.filter(a => a.isCompleted).length;
      const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

      LessonProgress.push({
        LessonId: Lesson._id,
        LessonName: Lesson.LessonName,
        totalSteps,
        completedSteps,
        progressPercentage
      });
    }

    return res.status(200).json({
      classId,
      LessonProgress
    });
  } catch (error) {
    next(error);
  }
};
