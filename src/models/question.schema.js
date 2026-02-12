import mongoose from 'mongoose';

const QuestionSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  questionText: { type: String, required: false },
  rawQuestion: { type: mongoose.Schema.Types.Mixed, required: false, default: null },
  imageQuestion: { type: String, required: false },
  // choices: array of strings - if a choice is an image, store the image URL string directly
  choices: {
    type: [String],
    required: true,
    validate: {
      validator: function (v) {
        return Array.isArray(v) && v.length >= 2;
      },
      message: 'A question must have at least 2 choices'
    }
  },
  // questionType indicates how the answer should be interpreted
  // - single: single-choice (default)
  // - multiple: multiple-choice (multiple correct answers)
  // - text: free-text answer
  // - image: image-based choice
  questionType: { type: String, enum: ['single', 'multiple', 'text', 'image'], default: 'single' },
  // detailType: optional string to describe a more specific subtype of the question
  detailType: { type: String, required: false },
  // answer: either a numeric index (0-based) into `choices`, or a string
  answer: { type: mongoose.Schema.Types.Mixed, required: true },
  order: { type: Number, required: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Question', QuestionSchema);
