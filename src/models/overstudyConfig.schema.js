import mongoose from 'mongoose';

const PartSchema = new mongoose.Schema({
  type: { type: String, required: true },
  count: { type: Number, required: true }
}, { _id: false });

const OverstudyConfigSchema = new mongoose.Schema({
  progressId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Progress',
    default: null
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    default: null
  },
  total: { type: Number, required: true },
  parts: { type: [PartSchema], default: [] }
}, { timestamps: true });

OverstudyConfigSchema.pre('validate', function (next) {
  const hasProgressId = !!this.progressId;
  const hasClassId = !!this.classId;

  if (hasProgressId === hasClassId) {
    return next(new Error('Exactly one of progressId or classId must be provided'));
  }

  return next();
});

OverstudyConfigSchema.index(
  { progressId: 1 },
  { unique: true, partialFilterExpression: { progressId: { $exists: true, $ne: null } } }
);

OverstudyConfigSchema.index(
  { classId: 1 },
  { unique: true, partialFilterExpression: { classId: { $exists: true, $ne: null } } }
);

const OverstudyConfig = mongoose.model('OverstudyConfig', OverstudyConfigSchema);

export default OverstudyConfig;
