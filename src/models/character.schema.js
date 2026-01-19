import mongoose from 'mongoose';

const CharacterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Character', CharacterSchema);
