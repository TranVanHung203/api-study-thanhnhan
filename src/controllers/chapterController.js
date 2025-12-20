import Chapter from '../models/chapter.schema.js';
import Skill from '../models/skill.schema.js';
import Progress from '../models/progress.schema.js';
import UserActivity from '../models/userActivity.schema.js';
import Video from '../models/video.schema.js';

// Tạo chapter mới
export const createChapterController = async (req, res, next) => {
  try {
    const { classId, chapterName, description, order } = req.body;

    if (!classId || !chapterName) {
      return res.status(400).json({ message: 'classId và chapterName là bắt buộc' });
    }

    // Nếu không truyền order, tự động lấy order cao nhất + 1
    let chapterOrder = order;
    if (chapterOrder === undefined) {
      const maxOrderChapter = await Chapter.findOne({ classId }).sort({ order: -1 });
      chapterOrder = maxOrderChapter ? maxOrderChapter.order + 1 : 1;
    }

    const chapter = new Chapter({
      classId,
      chapterName,
      description,
      order: chapterOrder
    });

    await chapter.save();

    return res.status(201).json({
      message: 'Tạo chapter thành công',
      chapter
    });
  } catch (error) {
    next(error);
  }
};

// Lấy tất cả chapters của một class
export const getChaptersByClassController = async (req, res, next) => {
  try {
    const { classId } = req.params;

    const chapters = await Chapter.find({ classId }).sort({ order: 1 });

    return res.status(200).json({ chapters });
  } catch (error) {
    next(error);
  }
};

// Lấy chi tiết chapter
export const getChapterByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const chapter = await Chapter.findById(id).populate('classId');

    if (!chapter) {
      return res.status(404).json({ message: 'Chapter không tìm thấy' });
    }

    return res.status(200).json({ chapter });
  } catch (error) {
    next(error);
  }
};

// Cập nhật chapter
export const updateChapterController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { chapterName, description, order } = req.body;

    const chapter = await Chapter.findByIdAndUpdate(
      id,
      { chapterName, description, order },
      { new: true, runValidators: true }
    );

    if (!chapter) {
      return res.status(404).json({ message: 'Chapter không tìm thấy' });
    }

    return res.status(200).json({
      message: 'Cập nhật chapter thành công',
      chapter
    });
  } catch (error) {
    next(error);
  }
};

// Xóa chapter
export const deleteChapterController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const chapter = await Chapter.findByIdAndDelete(id);

    if (!chapter) {
      return res.status(404).json({ message: 'Chapter không tìm thấy' });
    }

    // Xóa tất cả skills thuộc chapter này
    await Skill.deleteMany({ chapterId: id });

    return res.status(200).json({ message: 'Xóa chapter thành công' });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// API CHÍNH: Lấy map chapter với trạng thái học của user
// =====================================================
export const getChapterMapController = async (req, res, next) => {
  try {
    const { chapterId } = req.params;
    const userId = req.user.id;

    // 1. Lấy chapter
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      return res.status(404).json({ message: 'Chapter không tìm thấy' });
    }

    // 2. Lấy tất cả skills của chapter, sắp xếp theo order
    const skills = await Skill.find({ chapterId }).sort({ order: 1 });

    // 3. Lấy tất cả progress của các skills
    const skillIds = skills.map(s => s._id);
    const progresses = await Progress.find({ skillId: { $in: skillIds } }).sort({ stepNumber: 1 });

    // 4. Lấy tất cả UserActivity của user cho các progress này
    const progressIds = progresses.map(p => p._id);
    const userActivities = await UserActivity.find({
      userId,
      progressId: { $in: progressIds },
      isCompleted: true
    });

    // Tạo Set để check nhanh
    const completedProgressIds = new Set(userActivities.map(ua => ua.progressId.toString()));

    // Build a global ordered list of progresses by skill.order then stepNumber
    const skillOrderMap = new Map(skills.map(s => [s._id.toString(), s.order]));
    const orderedProgresses = progresses.slice().sort((a, b) => {
      const ao = skillOrderMap.get(a.skillId.toString()) || 0;
      const bo = skillOrderMap.get(b.skillId.toString()) || 0;
      if (ao !== bo) return ao - bo;
      return a.stepNumber - b.stepNumber;
    });

    // Find latest completed index in the global ordered list
    let lastCompletedIndex = -1;
    for (let i = 0; i < orderedProgresses.length; i++) {
      const p = orderedProgresses[i];
      if (completedProgressIds.has(p._id.toString())) lastCompletedIndex = i;
    }

    // Determine which index should be current: first uncompleted progress whose skill is not locked
    // We'll compute skill-level completion after marking progress completions based on lastCompletedIndex
    const progressStateById = new Map(); // progressId -> { isCompleted, index }
    orderedProgresses.forEach((p, idx) => {
      const isCompleted = idx <= lastCompletedIndex;
      progressStateById.set(p._id.toString(), { isCompleted, index: idx });
    });

    // Compute skill-level completed based on progressStateById
    const skillCompletedMap = new Map(); // skillId -> boolean
    for (const skill of skills) {
      const skillProg = orderedProgresses.filter(p => p.skillId.toString() === skill._id.toString());
      const completedAll = skillProg.length === 0 ? false : skillProg.every(p => progressStateById.get(p._id.toString())?.isCompleted);
      skillCompletedMap.set(skill._id.toString(), completedAll);
    }

    // Precompute number of videos per progress (for progresses that reference videos)
    const videoCountMap = new Map();
    try {
      if (progressIds && progressIds.length > 0) {
        const agg = await Video.aggregate([
          { $match: { progressId: { $in: progressIds } } },
          { $group: { _id: '$progressId', count: { $sum: 1 } } }
        ]);
        for (const a of agg) videoCountMap.set(String(a._id), a.count);
      }
    } catch (e) {
      // if aggregation fails for any reason, we silently ignore and leave map empty
    }

    // Now determine current index: the first index > lastCompletedIndex where its skill is not locked
    let currentIndex = -1;
    // first find first skill that is not completed (in order)
    let firstNotCompletedSkillOrder = null;
    for (const skill of skills) {
      if (!skillCompletedMap.get(skill._id.toString())) {
        firstNotCompletedSkillOrder = skill.order;
        break;
      }
    }
    for (let i = lastCompletedIndex + 1; i < orderedProgresses.length; i++) {
      const p = orderedProgresses[i];
      const skillOrder = skillOrderMap.get(p.skillId.toString()) || 0;
      if (firstNotCompletedSkillOrder === null || skillOrder === firstNotCompletedSkillOrder) {
        currentIndex = i;
        break;
      }
    }

    // Build skillsWithStatus using computed states (removed isLocked fields)
    const skillsWithStatus = skills.map(skill => {
      const skillProgresses = orderedProgresses.filter(p => p.skillId.toString() === skill._id.toString());
      const isSkillCompleted = skillCompletedMap.get(skill._id.toString()) || false;
      const progressesWithStatus = skillProgresses.map(p => {
        const st = progressStateById.get(p._id.toString()) || { isCompleted: false, index: -1 };
        const idx = st.index;
        const isCompleted = st.isCompleted;
        const isCurrent = idx === currentIndex;
        return {
          _id: p._id,
          stepNumber: p.stepNumber,
          contentType: p.contentType,
          isCompleted,
          totalVideo: p.contentType === 'video' ? (videoCountMap.get(p._id.toString()) || 0) : null,
          isCurrent
        };
      });
      return {
        _id: skill._id,
        skillName: skill.skillName,
        skillVoice: skill.skillVoice || null,
        description: skill.description,
        order: skill.order,
        isCompleted: isSkillCompleted,
        progresses: progressesWithStatus
      };
    });

    return res.status(200).json({
      chapter: {
        _id: chapter._id,
        chapterName: chapter.chapterName,
        description: chapter.description,
        order: chapter.order
      },
      skills: skillsWithStatus
    });
  } catch (error) {
    next(error);
  }
};

// Chèn skill mới vào giữa (reorder)
export const insertSkillController = async (req, res, next) => {
  try {
    const { chapterId, skillName, description, afterOrder, skillVoice } = req.body;

    if (!chapterId || !skillName) {
      return res.status(400).json({ message: 'chapterId và skillName là bắt buộc' });
    }

    // afterOrder = order của skill mà skill mới sẽ đứng sau
    // VD: afterOrder = 2 → skill mới sẽ có order = 3, các skill order >= 3 sẽ +1

    // 1. Tăng order của các skill có order > afterOrder
    await Skill.updateMany(
      { chapterId, order: { $gt: afterOrder || 0 } },
      { $inc: { order: 1 } }
    );

    // 2. Tạo skill mới với order = afterOrder + 1
    const newOrder = (afterOrder || 0) + 1;
    const skill = new Skill({
      chapterId,
      skillName,
      description,
      order: newOrder,
      skillVoice: skillVoice || null
    });

    await skill.save();

    return res.status(201).json({
      message: 'Chèn skill thành công',
      skill
    });
  } catch (error) {
    next(error);
  }
};

// Chèn progress mới vào giữa (reorder)
export const insertProgressController = async (req, res, next) => {
  try {
    const { skillId, contentType, contentId, afterStepNumber } = req.body;

    if (!skillId || !contentType || !contentId) {
      return res.status(400).json({ message: 'skillId, contentType và contentId là bắt buộc' });
    }

    // Kiểm tra contentId có tồn tại trong collection tương ứng
    let ContentModel = null;
    if (contentType === 'video') {
      ContentModel = (await import('../models/video.schema.js')).default;
    } else if (contentType === 'exercise') {
      ContentModel = (await import('../models/exercise.schema.js')).default;
    } else if (contentType === 'quiz') {
      ContentModel = (await import('../models/quiz.schema.js')).default;
    } else {
      return res.status(400).json({ message: 'contentType không hợp lệ' });
    }

    const contentDoc = await ContentModel.findById(contentId);
    if (!contentDoc) {
      return res.status(404).json({ message: 'contentId không tồn tại trong bảng ' + contentType });
    }

    // 1. Tăng stepNumber của các progress có stepNumber > afterStepNumber
    await Progress.updateMany(
      { skillId, stepNumber: { $gt: afterStepNumber || 0 } },
      { $inc: { stepNumber: 1 } }
    );

    // 2. Tạo progress mới (không lưu contentId trên Progress)
    const newStepNumber = (afterStepNumber || 0) + 1;
    const progress = new Progress({
      skillId,
      stepNumber: newStepNumber,
      contentType
    });

    await progress.save();

    // Link content -> progress (set progressId trên content document)
    contentDoc.progressId = progress._id;
    await contentDoc.save();

    // Return compatibility payload including contentId
    const cp = progress.toObject();
    cp.contentId = contentDoc._id;

    return res.status(201).json({
      message: 'Chèn progress thành công',
      progress: cp
    });
  } catch (error) {
    next(error);
  }
};
