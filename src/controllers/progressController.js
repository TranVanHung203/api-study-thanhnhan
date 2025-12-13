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
      .sort({ stepNumber: 1 });

    // Attach contentId for compatibility: find content docs that reference these progresses
    const progressIds = progresses.map(p => p._id);
    const videos = await Video.find({ progressId: { $in: progressIds } }, '_id progressId');
    const exercises = await Exercise.find({ progressId: { $in: progressIds } }, '_id progressId');
    const quizzes = await Quiz.find({ progressId: { $in: progressIds } }, '_id progressId');
    const contentMap = new Map();
    for (const v of videos) contentMap.set(v.progressId.toString(), { _id: v._id });
    for (const e of exercises) contentMap.set(e.progressId.toString(), { _id: e._id });
    for (const q of quizzes) contentMap.set(q.progressId.toString(), { _id: q._id });

    const out = progresses.map(p => {
      const cp = p.toObject();
      const content = contentMap.get(p._id.toString());
      cp.contentId = content ? content._id : null;
      return cp;
    });

    return res.status(200).json({ progresses: out });
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
      contentType
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
    return res.status(500).json({ message: error.message });
  }
};

// Cập nhật progress
export const updateProgressController = async (req, res) => {
  try {
    const { progressId } = req.params;
    const { stepNumber, contentType, contentId } = req.body;

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
      if (contentType === 'video') newContent = await Video.findById(contentId);
      else if (contentType === 'exercise') newContent = await Exercise.findById(contentId);
      else if (contentType === 'quiz') newContent = await Quiz.findById(contentId);
      if (!newContent) return res.status(404).json({ message: 'Nội dung mới không tìm thấy' });
      newContent.progressId = progress._id;
      await newContent.save();
    }

    // Update fields
    progress.stepNumber = stepNumber !== undefined ? stepNumber : progress.stepNumber;
    progress.contentType = contentType !== undefined ? contentType : progress.contentType;
    await progress.save();

    // attach contentId for compatibility
    const content = await Video.findOne({ progressId: progress._id }) || await Exercise.findOne({ progressId: progress._id }) || await Quiz.findOne({ progressId: progress._id });
    const out = progress.toObject();
    out.contentId = content ? content._id : null;

    return res.status(200).json({ message: 'Cập nhật progress thành công', progress: out });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xóa progress
export const deleteProgressController = async (req, res) => {
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
    return res.status(500).json({ message: error.message });
  }
};
