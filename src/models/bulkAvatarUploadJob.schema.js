import mongoose from 'mongoose';

const BulkAvatarUploadJobSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    schoolClassId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
      default: null
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
      index: true
    },
    progress: {
      totalAssignments: { type: Number, default: 0 },
      totalCodes: { type: Number, default: 0 },
      processedCodes: { type: Number, default: 0 }
    },
    result: {
      avatarUploaded: { type: Number, default: 0 },
      avatarMissing: { type: Number, default: 0 },
      avatarCleared: { type: Number, default: 0 },
      usersUpdated: { type: Number, default: 0 }
    },
    errors: [
      {
        row: { type: Number, default: null },
        message: { type: String, default: '' }
      }
    ],
    performanceMs: {
      avatarProcessingMs: { type: Number, default: 0 }
    },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    // Auto cleanup jobs after 7 days to avoid unbounded growth.
    expireAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      index: { expires: 0 }
    }
  },
  { timestamps: true }
);

BulkAvatarUploadJobSchema.index({ teacherId: 1, createdAt: -1 });

const BulkAvatarUploadJob = mongoose.model('BulkAvatarUploadJob', BulkAvatarUploadJobSchema);

export default BulkAvatarUploadJob;
