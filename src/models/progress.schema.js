import mongoose from 'mongoose';

const ProgressSchema = new mongoose.Schema({
  skillId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Skill', 
    required: true 
  },
  stepNumber: { 
    type: Number, 
    required: true 
  },
  contentType: { 
    type: String, 
    required: true, 
    enum: ['video', 'exercise', 'quiz'] 
  },
  contentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export default mongoose.model('Progress', ProgressSchema);
