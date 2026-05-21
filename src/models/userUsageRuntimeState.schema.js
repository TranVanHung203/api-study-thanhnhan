import mongoose from 'mongoose';

const UserUsageRuntimeStateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  isOnline: {
    type: Boolean,
    default: false,
    index: true
  },
  sessionStartedAt: {
    type: Date,
    default: null
  },
  lastPingAt: {
    type: Date,
    default: null,
    index: true
  },
  endedAt: {
    type: Date,
    default: null
  },
  endReason: {
    type: String,
    default: null
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

UserUsageRuntimeStateSchema.index({ isOnline: 1, lastPingAt: 1 });

export default mongoose.model('UserUsageRuntimeState', UserUsageRuntimeStateSchema);

