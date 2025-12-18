import mongoose from 'mongoose';

const SkillSchema = new mongoose.Schema({
  chapterId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Chapter', 
    required: true 
  },
  skillName: { 
    type: String, 
    required: true 
  },
  skillVoice: {
    type: String,
    default: null
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

export default mongoose.model('Skill', SkillSchema);
