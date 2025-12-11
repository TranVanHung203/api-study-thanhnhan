import mongoose from 'mongoose';

/**
 * Exercise Schema
 * 
 * exerciseType: Loại bài tập
 * - drag_count: Kéo thả và đếm (VD: Kéo 5 quả táo vào giỏ)
 * - [TODO] Thêm các loại khác sau: drag_sort, matching, fill_number, ordering, multiple_choice
 * 
 * answer: Đáp án đúng (số tự nhiên - số lượng cần đếm)
 * - VD: answer = 5 nghĩa là user cần kéo đúng 5 item
 * - KHÔNG được gửi về client
 */

const ExerciseSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true 
  },
  frontendRef: { 
    type: String, 
    required: true 
  },
  
  // Loại bài tập - Flutter dùng để biết render game nào
  exerciseType: {
    type: String,
    enum: ['drag_count'],  // TODO: Thêm các loại khác khi cần
    default: 'drag_count'
  },
  
  // Đáp án đúng - KHÔNG gửi về client
  // Có thể lưu số, chuỗi, mảng, object tuỳ loại bài tập
  answer: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    select: false  // Mặc định không select field này khi query
  },
  
  description: {
    type: String
  },
  bonusPoints: { 
    type: Number, 
    default: 10 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export default mongoose.model('Exercise', ExerciseSchema);
