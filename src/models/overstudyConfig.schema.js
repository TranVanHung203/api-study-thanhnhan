import mongoose from 'mongoose';

const PartSchema = new mongoose.Schema({
  type: { type: String, required: true },
  count: { type: Number, required: true }
}, { _id: false });

const OverstudyConfigSchema = new mongoose.Schema({
  chapterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
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
  const hasChapterId = !!this.chapterId;
  const hasClassId = !!this.classId;

  if (hasChapterId === hasClassId) {
    return next(new Error('Exactly one of chapterId or classId must be provided'));
  }

  return next();
});

OverstudyConfigSchema.index(
  { chapterId: 1 },
  { unique: true, partialFilterExpression: { chapterId: { $exists: true, $ne: null } } }
);

OverstudyConfigSchema.index(
  { classId: 1 },
  { unique: true, partialFilterExpression: { classId: { $exists: true, $ne: null } } }
);

const OverstudyConfig = mongoose.model('OverstudyConfig', OverstudyConfigSchema);

export default OverstudyConfig;
