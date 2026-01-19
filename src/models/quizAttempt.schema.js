import mongoose from 'mongoose';

const QuizAttemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  progressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Progress', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuizSession' },
  score: { type: Number, default: 0 },
  isCompleted: { type: Boolean, default: false },
  details: [
    {
      questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
      userAnswer: { type: mongoose.Schema.Types.Mixed },
      isCorrect: { type: Boolean, default: false },
      correctAnswer: { type: mongoose.Schema.Types.Mixed }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('QuizAttempt', QuizAttemptSchema);
