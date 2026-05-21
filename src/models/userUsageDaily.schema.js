import mongoose from 'mongoose';

const UserUsageDailySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  dateKey: {
    type: String,
    required: true
  },
  usageSeconds: {
    type: Number,
    default: 0
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

UserUsageDailySchema.index({ userId: 1, dateKey: 1 }, { unique: true });
UserUsageDailySchema.index({ dateKey: 1, updatedAt: -1 });

export default mongoose.model('UserUsageDaily', UserUsageDailySchema);

