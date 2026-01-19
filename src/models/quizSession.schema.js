import mongoose from 'mongoose';

const QuizSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  progressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Progress', required: true },
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true }
});

// TTL index on expiresAt - documents will be removed after expiresAt
QuizSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('QuizSession', QuizSessionSchema);
