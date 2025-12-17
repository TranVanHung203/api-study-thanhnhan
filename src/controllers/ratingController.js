import Rating from '../models/rating.schema.js';
import Progress from '../models/progress.schema.js';
import UserActivity from '../models/userActivity.schema.js';

export const postRatingController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { progressId } = req.params;
    const { rating } = req.body;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'rating phải là số nguyên trong khoảng 1..5' });
    }

    const progress = await Progress.findById(progressId);
    if (!progress) return res.status(404).json({ message: 'Progress không tìm thấy' });

    const hadActivity = await UserActivity.exists({ userId, progressId });
    if (!hadActivity) return res.status(400).json({ message: 'Bạn chưa hoàn thành hoặc chưa làm progress này, không thể đánh giá' });

    const existing = await Rating.findOne({ userId, progressId });
    if (existing) return res.status(400).json({ message: 'Bạn đã đánh giá progress này trước đó' });

    const r = new Rating({ userId, progressId, rating });
    await r.save();
    return res.status(201).json({ message: 'Đã ghi nhận đánh giá', rating: r });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getRatingsForProgressController = async (req, res) => {
  try {
    const { progressId } = req.params;
    const ratings = await Rating.find({ progressId }).populate('userId', 'fullName');
    return res.status(200).json({ ratings });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export default { postRatingController, getRatingsForProgressController };
