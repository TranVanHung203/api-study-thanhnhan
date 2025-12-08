import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true 
  },
  passwordHash: { 
    type: String, 
    required: true 
  },
  fullName: { 
    type: String, 
    required: true 
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  classId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Class',
    required: false
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const User = mongoose.model('User', UserSchema);

export default User;
