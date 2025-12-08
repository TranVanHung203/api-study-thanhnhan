import mongoose from 'mongoose';

const ExerciseSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true 
  },
  frontendRef: { 
    type: String, 
    required: true 
  },
  description: {
    type: String
  },
  bonusPoints: { 
    type: Number, 
    default: 10 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export default mongoose.model('Exercise', ExerciseSchema);
