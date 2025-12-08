import mongoose from 'mongoose';

const SkillSchema = new mongoose.Schema({
  classId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Class', 
    required: true 
  },
  skillName: { 
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

export default mongoose.model('Skill', SkillSchema);
