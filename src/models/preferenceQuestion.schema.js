import mongoose from 'mongoose';

const OptionTopicScoreSchema = new mongoose.Schema({
  topicSlug: {
    type: String,
    required: true,
    trim: true
  },
  score: {
    type: Number,
    default: 1
  }
}, { _id: false });

const PreferenceOptionSchema = new mongoose.Schema({
  value: {
    type: String,
    required: true,
    trim: true
  },
  label: {
    type: String,
    required: true,
    trim: true
  },
  imageCode: {
    type: String,
    default: null,
    trim: true
  },
  topicScores: {
    type: [OptionTopicScoreSchema],
    default: []
  }
}, { _id: false });

const PreferenceQuestionSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  questionText: {
    type: String,
    required: true,
    trim: true
  },
  questionType: {
    type: String,
    enum: ['single', 'multiple', 'text'],
    default: 'single'
  },
  options: {
    type: [PreferenceOptionSchema],
    default: []
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const PreferenceQuestion = mongoose.model('PreferenceQuestion', PreferenceQuestionSchema);

export default PreferenceQuestion;
