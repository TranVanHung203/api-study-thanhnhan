import Skill from '../models/skill.schema.js';

// Lấy danh sách skills của một chapter
export const getSkillsByChapterController = async (req, res) => {
  try {
    const { chapterId } = req.params;

    const skills = await Skill.find({ chapterId })
      .sort({ order: 1 });

    return res.status(200).json({ skills });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Tạo skill mới
export const createSkillController = async (req, res) => {
  try {
    const { chapterId, skillName, description, order } = req.body;

    if (!chapterId || !skillName) {
      return res.status(400).json({ message: 'chapterId và skillName là bắt buộc' });
    }

    // Nếu không truyền order, tự động lấy order cao nhất + 1
    let skillOrder = order;
    if (skillOrder === undefined) {
      const maxOrderSkill = await Skill.findOne({ chapterId }).sort({ order: -1 });
      skillOrder = maxOrderSkill ? maxOrderSkill.order + 1 : 1;
    }

    const skill = new Skill({
      chapterId,
      skillName,
      description,
      order: skillOrder
    });

    await skill.save();

    return res.status(201).json({
      message: 'Tạo skill thành công',
      skill
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Cập nhật skill
export const updateSkillController = async (req, res) => {
  try {
    const { skillId } = req.params;
    const { skillName, description, order } = req.body;

    const skill = await Skill.findByIdAndUpdate(
      skillId,
      { skillName, description, order },
      { new: true }
    );

    return res.status(200).json({
      message: 'Cập nhật skill thành công',
      skill
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xóa skill
export const deleteSkillController = async (req, res) => {
  try {
    const { skillId } = req.params;

    await Skill.findByIdAndDelete(skillId);

    return res.status(200).json({
      message: 'Xóa skill thành công'
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
