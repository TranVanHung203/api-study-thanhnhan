import mongoose from 'mongoose';

const ChoiceSchema = new mongoose.Schema({
  text: { type: String, required: false },
  imageUrl: { type: String, required: false }
}, { _id: false });

const QuestionSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  questionText: { type: String, required: false },
  questionVoice: { type: String, required: false },
  imageQuestion: { type: String, required: false },
  // choices: array of objects { text?, imageUrl? } - must have at least 2
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
  // answer: either a numeric index (0-based) into `choices`, or an object { text?, imageUrl? }
  answer: { type: mongoose.Schema.Types.Mixed, required: true },
  hintVoice: { type: String, required: false },
  order: { type: Number, required: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Question', QuestionSchema);
