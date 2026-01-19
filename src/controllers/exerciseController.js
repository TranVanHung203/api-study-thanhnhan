import Exercise from '../models/exercise.schema.js';

// Lấy danh sách exercises (KHÔNG bao gồm answer)
export const getExercisesController = async (req, res, next) => {
  try {
    const exercises = await Exercise.find();
    return res.status(200).json({ exercises });
  } catch (error) {
    next(error);
  }
};

// Lấy exercise theo ID - CHỈ trả về id, frontendRef, exerciseType (cho client chơi game)
export const getExerciseByIdController = async (req, res, next) => {
  try {
    const { exerciseId } = req.params;
    const exercise = await Exercise.findById(exerciseId).select('_id frontendRef exerciseType');
    
    if (!exercise) {
      return res.status(404).json({ message: 'Exercise không tồn tại' });
    }
    
    return res.status(200).json({ exercise });
  } catch (error) {
    next(error);
  }
};

// Tạo exercise
export const createExerciseController = async (req, res, next) => {
  try {
    const { title, frontendRef, exerciseType, answer, description, bonusPoints } = req.body;

    if (!answer && answer !== 0) {
      return res.status(400).json({ message: 'Vui lòng nhập đáp án (answer)' });
    }

    const exercise = new Exercise({
      title,
      frontendRef,
      exerciseType: exerciseType || 'drag_count',
      answer,
      description,
      bonusPoints: bonusPoints || 10
    });

    await exercise.save();

    return res.status(201).json({
      message: 'Tạo exercise thành công',
      exercise
    });
  } catch (error) {
    next(error);
  }
};

// Cập nhật exercise
export const updateExerciseController = async (req, res, next) => {
  try {
    const { exerciseId } = req.params;
    const { title, frontendRef, exerciseType, answer, description, bonusPoints } = req.body;

    const updateData = { title, frontendRef, description, bonusPoints };
    if (exerciseType) updateData.exerciseType = exerciseType;
    if (answer !== undefined) updateData.answer = answer;

    const exercise = await Exercise.findByIdAndUpdate(
      exerciseId,
      updateData,
      { new: true }
    );

    return res.status(200).json({
      message: 'Cập nhật exercise thành công',
      exercise
    });
  } catch (error) {
    next(error);
  }
};

// Xóa exercise
export const deleteExerciseController = async (req, res, next) => {
  try {
    const { exerciseId } = req.params;
    await Exercise.findByIdAndDelete(exerciseId);

    return res.status(200).json({
      message: 'Xóa exercise thành công'
    });
  } catch (error) {
    next(error);
  }
};
