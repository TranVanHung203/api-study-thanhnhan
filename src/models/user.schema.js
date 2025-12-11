import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: function() { return !this.isGuest; }, // Không bắt buộc cho guest
    unique: true,
    sparse: true // Cho phép nhiều null (guest không có username)
  },
  passwordHash: { 
    type: String, 
    required: function() { return !this.isGuest; } // Không bắt buộc cho guest
  },
  fullName: { 
    type: String, 
    required: true 
  },
  email: {
    type: String,
    required: function() { return !this.isGuest; }, // Không bắt buộc cho guest
    unique: true,
    sparse: true // Cho phép nhiều null (guest không có email)
  },
  classId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Class',
    required: false
  },
  // Guest user fields
  isGuest: {
    type: Boolean,
    default: false
  },
  guestExpiresAt: {
    type: Date,
    default: null // Thời gian hết hạn cho guest (ví dụ: 7 ngày)
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Index để auto-delete expired guests (TTL index)
UserSchema.index({ guestExpiresAt: 1 }, { expireAfterSeconds: 0 });

const User = mongoose.model('User', UserSchema);

export default User;
