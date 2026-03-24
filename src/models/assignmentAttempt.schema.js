import mongoose from 'mongoose';

const AssignmentAttemptSchema = new mongoose.Schema({
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuizAssignment',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  score: { type: Number, default: 0 },
  isCompleted: { type: Boolean, default: false },
  details: [
    {
      questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
      userAnswer: { type: mongoose.Schema.Types.Mixed },
      isCorrect: { type: Boolean, default: false },
      correctAnswer: { type: mongoose.Schema.Types.Mixed }
    }
  ]
}, { timestamps: true });

export default mongoose.model('AssignmentAttempt', AssignmentAttemptSchema);
