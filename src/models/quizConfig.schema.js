import mongoose from 'mongoose';

const PartSchema = new mongoose.Schema({
  type: { type: String, required: true },
  count: { type: Number, required: true },
  // order field removed
}, { _id: false });

const QuizConfigSchema = new mongoose.Schema({
  progressId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Progress',
    required: true,
    unique: true
  },
  total: { type: Number, required: true },
  parts: { type: [PartSchema], default: [] }
}, { timestamps: true });

const QuizConfig = mongoose.model('QuizConfig', QuizConfigSchema);

export default QuizConfig;
