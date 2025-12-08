import mongoose from 'mongoose';

const RewardSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true
  },
  totalPoints: { 
    type: Number, 
    default: 0 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

export default mongoose.model('Reward', RewardSchema);
