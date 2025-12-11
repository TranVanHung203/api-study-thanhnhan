import mongoose from 'mongoose';
import 'dotenv/config';

import Exercise from './src/models/exercise.schema.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/online_learning';

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Kết nối MongoDB thành công');
  } catch (error) {
    console.error('❌ Lỗi kết nối MongoDB:', error);
    process.exit(1);
  }
};

const addExerciseSample = async () => {
  try {
    // Tạo 1 exercise mẫu với cấu trúc mới
    const exercise = await Exercise.create({
      title: 'Kéo 5 quả táo vào giỏ',
      description: 'Hãy kéo đúng 5 quả táo vào giỏ để hoàn thành bài tập',
      frontendRef: 'drag_count_apple_game',
      exerciseType: 'drag_count',
      answer: 5,  // Cần kéo đúng 5 item
      bonusPoints: 10
    });

    console.log('✅ Đã tạo exercise mẫu:');
    console.log({
      _id: exercise._id,
      title: exercise.title,
      frontendRef: exercise.frontendRef,
      exerciseType: exercise.exerciseType,
      bonusPoints: exercise.bonusPoints
    });
    console.log('\n📌 Lưu ý: field "answer" không hiển thị do select: false');
    console.log('\n🎯 Exercise ID:', exercise._id.toString());

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Đã đóng kết nối MongoDB');
  }
};

connectDB().then(() => addExerciseSample());
