import mongoose from 'mongoose';

const ChapterSchema = new mongoose.Schema({
  classId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Class', 
    required: true 
  },
  chapterName: { 
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

export default mongoose.model('Chapter', ChapterSchema);
