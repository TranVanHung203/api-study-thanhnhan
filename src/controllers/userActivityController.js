import UserActivity from '../models/userActivity.schema.js';
import Reward from '../models/reward.schema.js';
import Progress from '../models/progress.schema.js';
import Skill from '../models/skill.schema.js';

// Ghi nhận hoạt động của user (video, exercise, quiz)
export const recordUserActivityController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { progressId, contentType, score, isCompleted } = req.body;

    // Tìm progress để lấy bonusPoints
    const progress = await Progress.findById(progressId)
      .populate('contentId');

    if (!progress) {
      return res.status(404).json({ message: 'Progress không tìm thấy' });
    }

    let bonusEarned = 0;
    if (isCompleted && progress.contentId.bonusPoints) {
      bonusEarned = progress.contentId.bonusPoints;
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
      const reward = await Reward.findOneAndUpdate(
        { userId },
        { $inc: { totalPoints: bonusEarned } },
        { new: true }
      );
    }

    return res.status(201).json({
      message: 'Ghi nhận hoạt động thành công',
      userActivity,
      bonusEarned
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
