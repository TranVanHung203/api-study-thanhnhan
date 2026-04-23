import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: function () { return !this.isGuest; },
    unique: true,
    sparse: true
  },
  passwordHash: {
    type: String,
    required: function () { return !this.isGuest; }
  },
  fullName: {
    type: String,
    required: true
  },
  gender: {
    type: Number,
    enum: [0, 1],
    required: false
  },
  email: {
    type: String,
    // Social providers may not return email; require it only for local accounts.
    required: function () {
      if (this.isGuest) return false;
      return (this.provider || 'local') === 'local';
    },
    unique: true,
    sparse: true,
    set: (value) => {
      if (typeof value !== 'string') return undefined;
      const normalized = value.trim().toLowerCase();
      return normalized || undefined;
    }
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: false
  },
  // OAuth fields
  googleId: {
    type: String,
    required: false,
    index: true,
    sparse: true
  },
  facebookId: {
    type: String,
    required: false,
    index: true,
    sparse: true
  },
  zaloId: {
    type: String,
    required: false,
    index: true,
    sparse: true
  },
  provider: {
    type: String,
    required: false,
    enum: ['local', 'google', 'facebook', 'zalo', 'guest'],
    default: 'local'
  },
  avatar: {
    type: String,
    required: false
  },
  // Selected character id for the user (reference to Character)
  characterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Character',
    default: null
  },
  preferredTopicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    default: null
  },
  // Roles in system: 'student', 'teacher', 'researchobject', 'admin'
  roles: {
    type: [String],
    enum: ['student', 'teacher', 'researchobject', 'admin'],
    default: ['student']
  },
  // Guest user fields
  isGuest: {
    type: Boolean,
    default: false
  },
  isShowCaseView: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', UserSchema);

export default User;
