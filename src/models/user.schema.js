import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: function () { return !this.isGuest; },
    unique: true,
    sparse: true
  },
  userCode: {
    type: String,
    unique: true,
    sparse: true,
    index: true
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
      if ((this.provider || 'local') !== 'local') return false;
      // Student accounts created by teachers can be managed without email.
      if (this.createdByTeacherId) return false;
      return true;
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
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: false,
    default: null
  },
  createdByTeacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  dateOfBirth: {
    type: Date,
    required: false,
    default: null
  },
  address: {
    type: String,
    required: false,
    trim: true,
    default: null
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
  isStatus: {
    type: String,
    enum: ['active', 'deleted'],
    default: 'active',
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  isShowCaseView: {
    type: Boolean,
    default: false
  },
  isOnline: {
    type: Boolean,
    default: false,
    index: true
  },
  onlineAt: {
    type: Date,
    default: null
  },
  lastSeenAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

UserSchema.pre('save', async function (next) {
  if (!this.isNew || this.userCode) return next();

  const createdDate = this.createdAt || new Date();
  const year = createdDate.getFullYear();
  const isStudent = Array.isArray(this.roles) && this.roles.includes('student');
  const prefix = isStudent ? 'HS' : 'U';
  const codePrefix = `${prefix}${year}_`;
  const escapedPrefix = codePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    const latestRows = await this.constructor.aggregate([
      { $match: { userCode: { $regex: `^${escapedPrefix}` } } },
      {
        $project: {
          sequence: {
            $convert: {
              input: { $arrayElemAt: [{ $split: ['$userCode', '_'] }, 1] },
              to: 'int',
              onError: 0,
              onNull: 0
            }
          }
        }
      },
      { $sort: { sequence: -1 } },
      { $limit: 1 }
    ]);

    const maxSequence = latestRows?.[0]?.sequence || 0;
    const nextNumber = maxSequence + 1;

    this.userCode = `${codePrefix}${nextNumber}`;
    return next();
  } catch (error) {
    return next(error);
  }
});

const User = mongoose.model('User', UserSchema);

export default User;
