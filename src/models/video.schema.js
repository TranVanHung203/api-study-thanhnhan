import mongoose from 'mongoose';

const VideoSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true 
  },
  url: { 
    type: String, 
    required: true 
  },
  duration: { 
    type: Number // Giây
  },
  description: {
    type: String
  },
  progressId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Progress'
  },
  cloudinaryPublicId: {
    type: String // Để xóa video trên Cloudinary
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export default mongoose.model('Video', VideoSchema);
