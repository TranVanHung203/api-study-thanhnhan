import mongoose from 'mongoose';

const ChapterCompletionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  chapterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
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

// Dam bao moi user chi co mot record completion cho moi chapter
ChapterCompletionSchema.index({ userId: 1, chapterId: 1 }, { unique: true });

export default mongoose.model('ChapterCompletion', ChapterCompletionSchema);
