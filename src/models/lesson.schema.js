import mongoose from 'mongoose';

const LessonSchema = new mongoose.Schema({
  chapterId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Chapter', 
    required: true 
  },
  lessonName: { 
    type: String, 
    required: true 
  },
  description: {
    type: String
  },
  order: { 
    type: Number, 
    default: 0 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export default mongoose.model('Lesson', LessonSchema);
