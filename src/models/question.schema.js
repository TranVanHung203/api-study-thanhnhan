import mongoose from 'mongoose';

const QuestionSchema = new mongoose.Schema({
  quizId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Quiz', 
    required: true 
  },
  questionText: { 
    type: String, 
    required: true 
  },
  options: {
    type: [String],
    required: true
  },
  correctAnswer: { 
    type: String, 
    required: true 
  },
  hintText: { 
    type: String 
  },
  order: { 
    type: Number 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export default mongoose.model('Question', QuestionSchema);
