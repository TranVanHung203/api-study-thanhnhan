import Reward from '../models/reward.schema.js';
import User from '../models/user.schema.js';

// Lấy điểm thưởng của user
export const getRewardController = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const reward = await Reward.findOne({ userId });

    if (!reward) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin điểm thưởng' });
    }

    return res.status(200).json({ reward });
  } catch (error) {
    next(error);
  }
};

// Lấy bảng xếp hạng theo điểm
export const getLeaderboardController = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { limit = 10 } = req.query;

    // Lấy users của class
    const User = require('../models/user.schema.js').default;
    const users = await User.find({ classId }).select('_id');

    const userIds = users.map(u => u._id);

    // Lấy rewards sắp xếp theo điểm
    const rewards = await Reward.find({ userId: { $in: userIds } })
      .populate('userId', 'fullName username email')
      .sort({ totalPoints: -1 })
      .limit(parseInt(limit));

    return res.status(200).json({ rewards });
  } catch (error) {
    next(error);
  }
};

// Thêm điểm thưởng (admin only)
export const addRewardPointsController = async (req, res, next) => {
  try {
    const { userId, points } = req.body;

    const reward = await Reward.findOneAndUpdate(
      { userId },
      { $inc: { totalPoints: points } },
      { new: true }
    );

    return res.status(200).json({
      message: 'Cộng điểm thành công',
      reward
    });
  } catch (error) {
    next(error);
  }
};

// Reset điểm thưởng (admin only)
export const resetRewardController = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const reward = await Reward.findOneAndUpdate(
      { userId },
      { totalPoints: 0 },
      { new: true }
    );

    return res.status(200).json({
      message: 'Reset điểm thành công',
      reward
    });
  } catch (error) {
    next(error);
  }
};
