import mongoose from 'mongoose';

const UserActivitySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  progressId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Progress', 
    required: true 
  },
  score: { 
    type: Number, 
    default: 0 
  },
  isCompleted: { 
    type: Boolean, 
    default: false 
  },
  bonusEarned: { 
    type: Number, 
    default: 0 
  },
  completedAt: { 
    type: Date, 
    default: null 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export default mongoose.model('UserActivity', UserActivitySchema);
