import mongoose from 'mongoose';

const OTPVerificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true
  },
  otp: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  fullName: {
    type: String,
    required: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // Tự động xóa sau 10 phút (600 giây)
  }
});

const OTPVerification = mongoose.model('OTPVerification', OTPVerificationSchema);

export default OTPVerification;
