import mongoose from 'mongoose';

const QuizAssignmentSchema = new mongoose.Schema({
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
  schoolClassId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    required: false,
    default: null
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    required: false,
    trim: true,
    default: ''
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
