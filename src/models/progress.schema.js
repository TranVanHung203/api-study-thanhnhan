import mongoose from 'mongoose';

const ProgressSchema = new mongoose.Schema({
  lessonId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Lesson', 
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
  progressName: {
    type: String,
    required: false,
    trim: true,
    default: null
  },
  // contentId removed: content documents will reference progress via `progressId`
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export default mongoose.model('Progress', ProgressSchema);
