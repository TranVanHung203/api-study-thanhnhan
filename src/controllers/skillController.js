import Skill from '../models/skill.schema.js';

// Lấy danh sách skills của một class
export const getSkillsByClassController = async (req, res) => {
  try {
    const { classId } = req.params;

    const skills = await Skill.find({ classId })
      .sort({ order: 1 });

    return res.status(200).json({ skills });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Tạo skill mới
export const createSkillController = async (req, res) => {
  try {
    const { classId, skillName, description, order } = req.body;

    const skill = new Skill({
      classId,
      skillName,
      description,
      order: order || 0
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
