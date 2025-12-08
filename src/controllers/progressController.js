import Progress from '../models/progress.schema.js';
import Skill from '../models/skill.schema.js';
import Video from '../models/video.schema.js';
import Exercise from '../models/exercise.schema.js';
import Quiz from '../models/quiz.schema.js';

// Lấy danh sách progress của một skill
export const getProgressBySkillController = async (req, res) => {
  try {
    const { skillId } = req.params;

    const progresses = await Progress.find({ skillId })
      .populate('contentId')
      .sort({ stepNumber: 1 });

    return res.status(200).json({ progresses });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Tạo progress item (video, exercise, quiz)
export const createProgressController = async (req, res) => {
  try {
    const { skillId, stepNumber, contentType, contentId } = req.body;

    // Kiểm tra contentId tồn tại
    let content;
    if (contentType === 'video') {
      content = await Video.findById(contentId);
    } else if (contentType === 'exercise') {
      content = await Exercise.findById(contentId);
    } else if (contentType === 'quiz') {
      content = await Quiz.findById(contentId);
    }

    if (!content) {
      return res.status(404).json({ message: 'Nội dung không tìm thấy' });
    }

    const progress = new Progress({
      skillId,
      stepNumber,
      contentType,
      contentId
    });

    await progress.save();
    await progress.populate('contentId');

    return res.status(201).json({
      message: 'Tạo progress thành công',
      progress
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Cập nhật progress
export const updateProgressController = async (req, res) => {
  try {
    const { progressId } = req.params;
    const { stepNumber, contentType, contentId } = req.body;

    const progress = await Progress.findByIdAndUpdate(
      progressId,
      { stepNumber, contentType, contentId },
      { new: true }
    ).populate('contentId');

    return res.status(200).json({
      message: 'Cập nhật progress thành công',
      progress
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xóa progress
export const deleteProgressController = async (req, res) => {
  try {
    const { progressId } = req.params;

    await Progress.findByIdAndDelete(progressId);

    return res.status(200).json({
      message: 'Xóa progress thành công'
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
