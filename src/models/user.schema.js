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
  // OAuth fields (Google)
  googleId: {
    type: String,
    required: false,
    index: true,
    sparse: true
  },
  provider: {
    type: String,
    required: false,
    enum: ['local', 'google', 'guest'],
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
  // Roles: only two roles in system: 'student' and 'teacher'
  roles: {
    type: [String],
    enum: ['student', 'teacher'],
    default: ['student']
  },
  // Guest user fields
  isGuest: {
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
