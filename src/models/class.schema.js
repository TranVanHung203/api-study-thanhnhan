import mongoose from 'mongoose';

const ClassSchema = new mongoose.Schema({
  className: { 
    type: String, 
    required: true,
    unique: true 
  },
  order: {
    type: Number,
    default: 0
  },
  description: { 
    type: String 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export default mongoose.model('Class', ClassSchema);
