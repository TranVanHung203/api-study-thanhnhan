import mongoose from 'mongoose';

const LessonCompletionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    required: true
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Đảm bảo mỗi user chỉ có một record completion cho mỗi lesson
LessonCompletionSchema.index({ userId: 1, lessonId: 1 }, { unique: true });

export default mongoose.model('LessonCompletion', LessonCompletionSchema);
