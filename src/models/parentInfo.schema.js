import mongoose from 'mongoose';
import User from './user.schema.js';

const ParentInfoSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  fatherName: {
    type: String,
    trim: true,
    default: null
  },
  fatherPhone: {
    type: String,
    trim: true,
    default: null
  },
  motherName: {
    type: String,
    trim: true,
    default: null
  },
  motherPhone: {
    type: String,
    trim: true,
    default: null
  }
}, { timestamps: true });

ParentInfoSchema.pre('validate', async function (next) {
  if (!this.studentId) return next();

  try {
    const student = await User.findById(this.studentId).select('_id roles isStatus').lean();
    if (!student || student.isStatus === 'deleted') {
      return next(new Error('Student user does not exist'));
    }

    const roles = Array.isArray(student.roles)
      ? student.roles.map((role) => String(role).toLowerCase())
      : [];

    if (!roles.includes('student')) {
      return next(new Error('ParentInfo can only link to user with role student'));
    }

    return next();
  } catch (error) {
    return next(error);
  }
});

const ParentInfo = mongoose.model('ParentInfo', ParentInfoSchema);

export default ParentInfo;

