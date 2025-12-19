import UserActivity from '../models/userActivity.schema.js';
import Reward from '../models/reward.schema.js';
import Progress from '../models/progress.schema.js';
import Skill from '../models/skill.schema.js';
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

    // Kiểm tra đã hoàn thành step này chưa
    const existingActivity = await UserActivity.findOne({ userId, progressId, isCompleted: true });
    if (existingActivity) {
      const bonusEarnedExisting = existingActivity.bonusEarned || 0;
      const nextStepExisting = currentProgress.stepNumber + 1;
      return res.status(200).json({
        message: 'Ghi nhận hoạt động đã tồn tại',
        userActivity: existingActivity,
        bonusEarned: bonusEarnedExisting,
        nextStep: nextStepExisting,
        isCheck: true
      });
    }

    // Lấy skill hiện tại
    const currentSkill = await Skill.findById(currentProgress.skillId);
    if (!currentSkill) throw new NotFoundError('Skill không tìm thấy');

    // ========== KIỂM TRA SKILL TRƯỚC ĐÃ HOÀN THÀNH CHƯA ==========
    if (currentSkill.order > 1) {
      const currentSkillProgresses = await Progress.find({ skillId: currentSkill._id });
      const currentSkillProgressIds = currentSkillProgresses.map(p => p._id);
      const hasStartedCurrentSkill = await UserActivity.exists({ userId, progressId: { $in: currentSkillProgressIds }, isCompleted: true });
      if (!hasStartedCurrentSkill) {
        const previousSkill = await Skill.findOne({ chapterId: currentSkill.chapterId, order: currentSkill.order - 1 });
        if (previousSkill) {
          const previousSkillProgresses = await Progress.find({ skillId: previousSkill._id });
          const previousProgressIds = previousSkillProgresses.map(p => p._id);
          const completedPreviousActivities = await UserActivity.find({ userId, progressId: { $in: previousProgressIds }, isCompleted: true });
          if (completedPreviousActivities.length < previousSkillProgresses.length) {
            const e = new BadRequestError(`Bạn cần hoàn thành skill "${previousSkill.skillName}" trước khi học skill này`);
            e.requiredSkillId = previousSkill._id;
            e.requiredSkillName = previousSkill.skillName;
            throw e;
          }
        }
      }
    }

    // ========== KIỂM TRA CÁC STEP TRƯỚC TRONG CÙNG SKILL ==========
    const currentStepNumber = currentProgress.stepNumber;
    if (currentStepNumber > 1) {
      const previousSteps = await Progress.find({ skillId: currentProgress.skillId, stepNumber: { $lt: currentStepNumber } });
      const previousStepIds = previousSteps.map(p => p._id);
      const completedPreviousSteps = await UserActivity.find({ userId, progressId: { $in: previousStepIds }, isCompleted: true });
      const allSkillProgresses = await Progress.find({ skillId: currentProgress.skillId });
      const allSkillProgressIds = allSkillProgresses.map(p => p._id);
      const userCompletedInSkill = await UserActivity.find({ userId, progressId: { $in: allSkillProgressIds }, isCompleted: true });
      const completedStepNumbers = new Set();
      let maxCompletedInSkill = 0;
      for (const activity of userCompletedInSkill) {
        const step = allSkillProgresses.find(p => p._id.toString() === activity.progressId.toString());
        if (step) {
          completedStepNumbers.add(step.stepNumber);
          if (step.stepNumber > maxCompletedInSkill) maxCompletedInSkill = step.stepNumber;
        }
      }
      for (let s = 1; s <= maxCompletedInSkill; s++) completedStepNumbers.add(s);
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

      return res.status(201).json({ message: 'Hoàn thành progress (tất cả video đã xem)', userActivity: createdActivity, bonusEarned, nextStep: currentStepNumber + 1, isCheck: false, isDone: true });
    }

    // Not yet completed all videos — return watched progress
    return res.status(200).json({ message: 'Đã đánh dấu video là đã xem', watchedCount, totalVideos, completed: false, isDone: false });
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
        populate: { path: 'skillId' }
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
export const getSkillProgressController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { skillId } = req.params;

    // Lấy tất cả progress steps của skill
    const progresses = await Progress.find({ skillId })
      .sort({ stepNumber: 1 });

    // Lấy activities của user cho skill này
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
      skillId,
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

    // Lấy tất cả skills của class
    const skills = await Skill.find({ classId });

    const skillProgress = [];

    for (const skill of skills) {
      const progresses = await Progress.find({ skillId: skill._id });
      const progressIds = progresses.map(p => p._id);
      const userActivities = await UserActivity.find({
        progressId: { $in: progressIds }
      });

      const totalSteps = progresses.length;
      const completedSteps = userActivities.filter(a => a.isCompleted).length;
      const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

      skillProgress.push({
        skillId: skill._id,
        skillName: skill.skillName,
        totalSteps,
        completedSteps,
        progressPercentage
      });
    }

    return res.status(200).json({
      classId,
      skillProgress
    });
  } catch (error) {
    next(error);
  }
};
