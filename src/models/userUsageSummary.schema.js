import mongoose from 'mongoose';

const UserUsageSummarySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  totalUsageSeconds: {
    type: Number,
    default: 0
  },
  lastActiveAt: {
    type: Date,
    default: null
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

UserUsageSummarySchema.index({ updatedAt: -1 });

export default mongoose.model('UserUsageSummary', UserUsageSummarySchema);

