import mongoose from 'mongoose';

const QuizSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true 
  },
  description: {
    type: String
  },
  totalQuestions: { 
    type: Number, 
    default: 15 
  },
  bonusPoints: { 
    type: Number, 
    default: 100 
  },
  chapterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
    required: false,
    default: null
  },
  progressId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Progress',
    required: false,
    default: null
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: false,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const Quiz = mongoose.model('Quiz', QuizSchema);

export default Quiz;
