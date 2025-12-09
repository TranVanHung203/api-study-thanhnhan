import UserActivity from '../models/userActivity.schema.js';
import Reward from '../models/reward.schema.js';
import Progress from '../models/progress.schema.js';
import Skill from '../models/skill.schema.js';

// Ghi nhận hoạt động của user (video, exercise, quiz)
export const recordUserActivityController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { progressId, score, isCompleted } = req.body;

    // Tìm progress hiện tại
    const currentProgress = await Progress.findById(progressId)
      .populate('contentId');

    if (!currentProgress) {
      return res.status(404).json({ message: 'Progress không tìm thấy' });
    }

    // Tự động lấy contentType từ progress
    const contentType = currentProgress.contentType;

    // Kiểm tra đã hoàn thành step này chưa
    const existingActivity = await UserActivity.findOne({
      userId,
      progressId,
      isCompleted: true
    });

    if (existingActivity) {
      return res.status(400).json({ 
        message: 'Bạn đã hoàn thành step này rồi',
        activity: existingActivity
      });
    }

    // Lấy skill hiện tại
    const currentSkill = await Skill.findById(currentProgress.skillId);
    if (!currentSkill) {
      return res.status(404).json({ message: 'Skill không tìm thấy' });
    }

    // ========== KIỂM TRA SKILL TRƯỚC ĐÃ HOÀN THÀNH CHƯA ==========
    if (currentSkill.order > 1) {
      // Tìm skill trước đó (order nhỏ hơn 1)
      const previousSkill = await Skill.findOne({
        chapterId: currentSkill.chapterId,
        order: currentSkill.order - 1
      });

      if (previousSkill) {
        // Lấy tất cả progress của skill trước
        const previousSkillProgresses = await Progress.find({ skillId: previousSkill._id });
        const previousProgressIds = previousSkillProgresses.map(p => p._id);

        // Kiểm tra user đã hoàn thành tất cả progress của skill trước chưa
        const completedPreviousActivities = await UserActivity.find({
          userId,
          progressId: { $in: previousProgressIds },
          isCompleted: true
        });

        // So sánh số lượng
        if (completedPreviousActivities.length < previousSkillProgresses.length) {
          return res.status(400).json({
            message: `Bạn cần hoàn thành skill "${previousSkill.skillName}" trước khi học skill này`,
            requiredSkillId: previousSkill._id,
            requiredSkillName: previousSkill.skillName,
            completedSteps: completedPreviousActivities.length,
            totalSteps: previousSkillProgresses.length
          });
        }
      }
    }

    // ========== KIỂM TRA CÁC STEP TRƯỚC TRONG CÙNG SKILL ==========
    const currentStepNumber = currentProgress.stepNumber;
    
    if (currentStepNumber > 1) {
      // Lấy tất cả các step trước của cùng skill
      const previousSteps = await Progress.find({
        skillId: currentProgress.skillId,
        stepNumber: { $lt: currentStepNumber }
      });

      const previousStepIds = previousSteps.map(p => p._id);

      // Kiểm tra user đã hoàn thành tất cả step trước chưa
      const completedPreviousSteps = await UserActivity.find({
        userId,
        progressId: { $in: previousStepIds },
        isCompleted: true
      });

      const completedStepNumbers = new Set();
      for (const activity of completedPreviousSteps) {
        const step = previousSteps.find(p => p._id.toString() === activity.progressId.toString());
        if (step) {
          completedStepNumbers.add(step.stepNumber);
        }
      }

      // Tìm step chưa hoàn thành
      for (let i = 1; i < currentStepNumber; i++) {
        if (!completedStepNumbers.has(i)) {
          return res.status(400).json({
            message: `Bạn cần hoàn thành step ${i} trước khi làm step ${currentStepNumber}`,
            requiredStep: i,
            currentStep: currentStepNumber
          });
        }
      }
    }

    // Tính điểm thưởng
    let bonusEarned = 0;
    if (isCompleted && currentProgress.contentId && currentProgress.contentId.bonusPoints) {
      bonusEarned = currentProgress.contentId.bonusPoints;
    }

    const userActivity = new UserActivity({
      userId,
      progressId,
      contentType,
      score,
      isCompleted,
      bonusEarned
    });

    await userActivity.save();

    // Cập nhật reward nếu có điểm thưởng
    if (bonusEarned > 0) {
      await Reward.findOneAndUpdate(
        { userId },
        { $inc: { totalPoints: bonusEarned } },
        { new: true }
      );
    }

    return res.status(201).json({
      message: 'Ghi nhận hoạt động thành công',
      userActivity,
      bonusEarned,
      nextStep: currentStepNumber + 1
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy lịch sử hoạt động của user
export const getUserActivityHistoryController = async (req, res) => {
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
    return res.status(500).json({ message: error.message });
  }
};

// Lấy tiến độ hoàn thành của một kỹ năng
export const getSkillProgressController = async (req, res) => {
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
    return res.status(500).json({ message: error.message });
  }
};

// Lấy tiến độ hoàn thành của cả lớp
export const getClassProgressController = async (req, res) => {
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
    return res.status(500).json({ message: error.message });
  }
};
