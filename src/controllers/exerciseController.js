import Exercise from '../models/exercise.schema.js';

// Lấy danh sách exercises
export const getExercisesController = async (req, res) => {
  try {
    const exercises = await Exercise.find();
    return res.status(200).json({ exercises });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Tạo exercise
export const createExerciseController = async (req, res) => {
  try {
    const { title, frontendRef, description, bonusPoints } = req.body;

    const exercise = new Exercise({
      title,
      frontendRef,
      description,
      bonusPoints: bonusPoints || 10
    });

    await exercise.save();

    return res.status(201).json({
      message: 'Tạo exercise thành công',
      exercise
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Cập nhật exercise
export const updateExerciseController = async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const { title, frontendRef, description, bonusPoints } = req.body;

    const exercise = await Exercise.findByIdAndUpdate(
      exerciseId,
      { title, frontendRef, description, bonusPoints },
      { new: true }
    );

    return res.status(200).json({
      message: 'Cập nhật exercise thành công',
      exercise
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xóa exercise
export const deleteExerciseController = async (req, res) => {
  try {
    const { exerciseId } = req.params;
    await Exercise.findByIdAndDelete(exerciseId);

    return res.status(200).json({
      message: 'Xóa exercise thành công'
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
