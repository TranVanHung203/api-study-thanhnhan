import mongoose from 'mongoose';

const CharacterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  staticImageUrl: { type: String, default: null },
  rewardPoints: { type: Number, required: true, default: 0, min: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Character', CharacterSchema);
