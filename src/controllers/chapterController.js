import Chapter from '../models/chapter.schema.js';
import Skill from '../models/skill.schema.js';
import Progress from '../models/progress.schema.js';
import UserActivity from '../models/userActivity.schema.js';

// Tạo chapter mới
export const createChapterController = async (req, res) => {
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
    return res.status(500).json({ message: error.message });
  }
};

// Lấy tất cả chapters của một class
export const getChaptersByClassController = async (req, res) => {
  try {
    const { classId } = req.params;

    const chapters = await Chapter.find({ classId }).sort({ order: 1 });

    return res.status(200).json({ chapters });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy chi tiết chapter
export const getChapterByIdController = async (req, res) => {
  try {
    const { id } = req.params;

    const chapter = await Chapter.findById(id).populate('classId');

    if (!chapter) {
      return res.status(404).json({ message: 'Chapter không tìm thấy' });
    }

    return res.status(200).json({ chapter });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Cập nhật chapter
export const updateChapterController = async (req, res) => {
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
    return res.status(500).json({ message: error.message });
  }
};

// Xóa chapter
export const deleteChapterController = async (req, res) => {
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
    return res.status(500).json({ message: error.message });
  }
};

// =====================================================
// API CHÍNH: Lấy map chapter với trạng thái học của user
// =====================================================
export const getChapterMapController = async (req, res) => {
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

    // 5. Tính toán trạng thái cho từng skill và progress
    let previousSkillCompleted = true; // Skill đầu tiên luôn mở

    // Biến để theo dõi đã tìm thấy vị trí hiện tại chưa
    let foundCurrent = false;

    const skillsWithStatus = skills.map((skill, skillIndex) => {
      // Lấy progress của skill này
      const skillProgresses = progresses.filter(p => p.skillId.toString() === skill._id.toString());
      
      // Skill bị khóa nếu skill trước chưa hoàn thành
      const isSkillLocked = !previousSkillCompleted;
      
      // Tính trạng thái cho từng progress
      let previousProgressCompleted = true; // Progress đầu tiên trong skill mở nếu skill không bị khóa
      
      const progressesWithStatus = skillProgresses.map((progress, progressIndex) => {
        const isProgressCompleted = completedProgressIds.has(progress._id.toString());
        
        // Progress bị khóa nếu:
        // 1. Skill bị khóa, hoặc
        // 2. Progress trước chưa hoàn thành
        const isProgressLocked = isSkillLocked || !previousProgressCompleted;
        
        // Xác định đây có phải là vị trí tiếp theo cần làm không
        // (không bị khóa + chưa hoàn thành + chưa tìm thấy current)
        const isCurrent = !isProgressLocked && !isProgressCompleted && !foundCurrent;
        
        if (isCurrent) {
          foundCurrent = true;
        }
        
        previousProgressCompleted = isProgressCompleted;
        
        return {
          _id: progress._id,
          stepNumber: progress.stepNumber,
          contentType: progress.contentType,
          contentId: progress.contentId,
          isCompleted: isProgressCompleted,
          isLocked: isProgressLocked,
          isCurrent  // Đánh dấu đây là bước tiếp theo cần làm
        };
      });

      // Skill hoàn thành khi TẤT CẢ progress đều hoàn thành
      const isSkillCompleted = skillProgresses.length > 0 && 
        skillProgresses.every(p => completedProgressIds.has(p._id.toString()));
      
      // Cập nhật cho skill tiếp theo
      previousSkillCompleted = isSkillCompleted;

      return {
        _id: skill._id,
        skillName: skill.skillName,
        description: skill.description,
        order: skill.order,
        isCompleted: isSkillCompleted,
        isLocked: isSkillLocked,
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
    return res.status(500).json({ message: error.message });
  }
};

// Chèn skill mới vào giữa (reorder)
export const insertSkillController = async (req, res) => {
  try {
    const { chapterId, skillName, description, afterOrder } = req.body;

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
      order: newOrder
    });

    await skill.save();

    return res.status(201).json({
      message: 'Chèn skill thành công',
      skill
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Chèn progress mới vào giữa (reorder)
export const insertProgressController = async (req, res) => {
  try {
    const { skillId, contentType, contentId, afterStepNumber } = req.body;

    if (!skillId || !contentType || !contentId) {
      return res.status(400).json({ message: 'skillId, contentType và contentId là bắt buộc' });
    }

    // 1. Tăng stepNumber của các progress có stepNumber > afterStepNumber
    await Progress.updateMany(
      { skillId, stepNumber: { $gt: afterStepNumber || 0 } },
      { $inc: { stepNumber: 1 } }
    );

    // 2. Tạo progress mới
    const newStepNumber = (afterStepNumber || 0) + 1;
    const progress = new Progress({
      skillId,
      stepNumber: newStepNumber,
      contentType,
      contentId
    });

    await progress.save();

    return res.status(201).json({
      message: 'Chèn progress thành công',
      progress
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
