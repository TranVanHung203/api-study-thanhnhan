import mongoose from 'mongoose';

const RefreshTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Thông tin thiết bị (optional)
  deviceInfo: {
    type: String,
    default: null
  },
  // Đánh dấu token đã bị revoke
  isRevoked: {
    type: Boolean,
    default: false
  }
});

// TTL Index: Tự động xóa token hết hạn
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index để tìm token nhanh
RefreshTokenSchema.index({ token: 1 });
RefreshTokenSchema.index({ userId: 1 });

const RefreshToken = mongoose.model('RefreshToken', RefreshTokenSchema);

export default RefreshToken;
