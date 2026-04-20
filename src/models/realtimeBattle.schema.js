import mongoose from 'mongoose';

const BattleSubmissionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userAnswer: { type: mongoose.Schema.Types.Mixed, default: null },
    isCorrect: { type: Boolean, default: false },
    elapsedMs: { type: Number, default: 0 },
    scoreAwarded: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const BattleQuestionResultSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    submissions: { type: [BattleSubmissionSchema], default: [] }
  },
  { _id: false }
);

const BattlePlayerResultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, default: null },
    fullName: { type: String, default: null },
    totalScore: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    totalCorrectTimeMs: { type: Number, default: 0 },
    isWinner: { type: Boolean, default: false }
  },
  { _id: false }
);

const RealtimeBattleSchema = new mongoose.Schema(
  {
    battleId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['playing', 'completed', 'aborted'],
      default: 'playing'
    },
    reason: { type: String, default: null },
    winnerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    players: { type: [BattlePlayerResultSchema], default: [] },
    questions: { type: [BattleQuestionResultSchema], default: [] },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

const RealtimeBattle = mongoose.model('RealtimeBattle', RealtimeBattleSchema);

export default RealtimeBattle;
