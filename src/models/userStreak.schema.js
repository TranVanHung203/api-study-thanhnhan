import mongoose from 'mongoose';

const UserStreakSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  lastActiveDate: {
    type: String,
    default: null
  },
  streakStartDate: {
    type: String,
    default: null
  }
}, { timestamps: true });

const UserStreak = mongoose.model('UserStreak', UserStreakSchema);

export default UserStreak;
