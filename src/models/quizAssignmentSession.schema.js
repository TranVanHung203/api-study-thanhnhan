import mongoose from 'mongoose';

const QuizAssignmentSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuizAssignment', required: true },
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  selectedAnswers: [
    {
      questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
      userAnswer: { type: mongoose.Schema.Types.Mixed },
      updatedAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true }
});

QuizAssignmentSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('QuizAssignmentSession', QuizAssignmentSessionSchema);
