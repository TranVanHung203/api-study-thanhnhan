import mongoose from 'mongoose';

const PasswordResetOTPSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true
  },
  otp: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // Tu dong xoa sau 10 phut
  }
});

const PasswordResetOTP = mongoose.model('PasswordResetOTP', PasswordResetOTPSchema);

export default PasswordResetOTP;
