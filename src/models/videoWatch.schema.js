import mongoose from 'mongoose';

const VideoWatchSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true
  },
  progressId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Progress',
    required: true
  },
  watchedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure a user only has one watch record per video
VideoWatchSchema.index({ userId: 1, videoId: 1 }, { unique: true });

export default mongoose.model('VideoWatch', VideoWatchSchema);
