import mongoose from 'mongoose';

const SchoolSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const School = mongoose.model('School', SchoolSchema);

export default School;
