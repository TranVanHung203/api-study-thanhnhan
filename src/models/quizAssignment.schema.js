import mongoose from 'mongoose';

const QuizAssignmentSchema = new mongoose.Schema({
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startAt: {
    type: Date,
    default: Date.now
  },
  endAt: {
    type: Date,
    required: false
  },
  status: {
    type: String,
    enum: ['draft', 'open', 'closed'],
    default: 'open'
  }
}, { timestamps: true });

export default mongoose.model('QuizAssignment', QuizAssignmentSchema);
