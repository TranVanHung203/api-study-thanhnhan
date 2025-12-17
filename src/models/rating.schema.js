import mongoose from 'mongoose';

const RatingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  progressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Progress', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now }
});

RatingSchema.index({ userId: 1, progressId: 1 }, { unique: true });

export default mongoose.model('Rating', RatingSchema);
