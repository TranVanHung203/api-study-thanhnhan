import mongoose from 'mongoose';

const ChoiceSchema = new mongoose.Schema({
  // Always store choice content in `text`. If it's an image URL, store the URL string here.
  text: { type: String, required: true }
}, { _id: false });

const QuestionSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  questionText: { type: String, required: false },
  rawQuestion: { type: mongoose.Schema.Types.Mixed, required: false, default: null },
  questionVoice: { type: String, required: false },
  imageQuestion: { type: String, required: false },
  // choices: array of objects { text } - if a choice is an image, store the image URL string in `text`
  choices: {
    type: [ChoiceSchema],
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
  // answer: either a numeric index (0-based) into `choices`, or an object { text }
  answer: { type: mongoose.Schema.Types.Mixed, required: true },
  hintVoice: { type: String, required: false },
  order: { type: Number, required: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Question', QuestionSchema);
