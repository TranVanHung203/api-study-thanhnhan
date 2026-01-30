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
  progressId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Progress'
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const Quiz = mongoose.model('Quiz', QuizSchema);

export default Quiz;