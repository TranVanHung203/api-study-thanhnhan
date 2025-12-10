import mongoose from 'mongoose';
import 'dotenv/config';

import Skill from './src/models/skill.schema.js';
import Progress from './src/models/progress.schema.js';
import Video from './src/models/video.schema.js';
import Exercise from './src/models/exercise.schema.js';
import Quiz from './src/models/quiz.schema.js';
import Question from './src/models/question.schema.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/online_learning';

// IDs đã có sẵn
const CHAPTER_ID = '6937c3a027bcdbde9cf07d43';
const SKILL_1_ID = '6937c3a027bcdbde9cf07d4f';  // Số từ 1 đến 5
const SKILL_2_ID = '6937c3a027bcdbde9cf07d50';  // Số từ 6 đến 10

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Kết nối MongoDB thành công');
  } catch (error) {
    console.error('❌ Lỗi kết nối MongoDB:', error);
    process.exit(1);
  }
};

const addSampleData = async () => {
  try {
    // Xóa progress cũ của cả 2 skills
    await Progress.deleteMany({ skillId: { $in: [SKILL_1_ID, SKILL_2_ID] } });
    console.log('🗑️  Đã xóa progress cũ của 2 skills');

    // ========== SKILL 1: Số từ 1 đến 5 ==========
    console.log('\n📌 Tạo dữ liệu cho Skill 1: Số từ 1 đến 5');
    
    const skill1Videos = await Video.insertMany([
      {
        title: 'Video: Giới thiệu số 1',
        description: 'Học cách nhận biết số 1',
        url: 'https://example.com/skill1-video1.mp4',
        duration: 60
      },
      {
        title: 'Video: Giới thiệu số 2, 3',
        description: 'Học cách nhận biết số 2 và 3',
        url: 'https://example.com/skill1-video2.mp4',
        duration: 90
      },
      {
        title: 'Video: Giới thiệu số 4, 5',
        description: 'Học cách nhận biết số 4 và 5',
        url: 'https://example.com/skill1-video3.mp4',
        duration: 100
      }
    ]);
    console.log('   ✅ Videos:', skill1Videos.length);

    const skill1Exercises = await Exercise.insertMany([
      {
        title: 'Bài tập: Nhận biết số 1',
        description: 'Chọn hình có số 1',
        frontendRef: 'exercise_recognize_1',
        bonusPoints: 10
      },
      {
        title: 'Bài tập: Điền số 1-3',
        description: 'Điền số còn thiếu: 1, __, 3',
        frontendRef: 'exercise_fill_1_3',
        bonusPoints: 15
      },
      {
        title: 'Bài tập: Điền số 3-5',
        description: 'Điền số còn thiếu: 3, __, 5',
        frontendRef: 'exercise_fill_3_5',
        bonusPoints: 15
      }
    ]);
    console.log('   ✅ Exercises:', skill1Exercises.length);

    const skill1Quiz = await Quiz.create({
      title: 'Quiz: Kiểm tra số 1-5',
      description: 'Trắc nghiệm kiểm tra nhận biết số 1-5',
      totalQuestions: 3,
      bonusPoints: 25
    });

    await Question.insertMany([
      {
        quizId: skill1Quiz._id,
        questionText: 'Số nào đứng sau số 2?',
        options: ['1', '3', '4', '5'],
        correctAnswer: '3',
        order: 1
      },
      {
        quizId: skill1Quiz._id,
        questionText: 'Đếm: 1, 2, __, 4, 5. Số còn thiếu là?',
        options: ['0', '3', '6', '2'],
        correctAnswer: '3',
        order: 2
      },
      {
        quizId: skill1Quiz._id,
        questionText: 'Số nào lớn nhất trong 1, 2, 3, 4, 5?',
        options: ['1', '3', '5', '4'],
        correctAnswer: '5',
        order: 3
      }
    ]);
    console.log('   ✅ Quiz với 3 questions');

    // Tạo Progress: video → exercise → video → exercise → video → exercise → quiz
    const skill1Progresses = await Progress.insertMany([
      { skillId: SKILL_1_ID, stepNumber: 1, contentType: 'video', contentId: skill1Videos[0]._id },
      { skillId: SKILL_1_ID, stepNumber: 2, contentType: 'exercise', contentId: skill1Exercises[0]._id },
      { skillId: SKILL_1_ID, stepNumber: 3, contentType: 'video', contentId: skill1Videos[1]._id },
      { skillId: SKILL_1_ID, stepNumber: 4, contentType: 'exercise', contentId: skill1Exercises[1]._id },
      { skillId: SKILL_1_ID, stepNumber: 5, contentType: 'video', contentId: skill1Videos[2]._id },
      { skillId: SKILL_1_ID, stepNumber: 6, contentType: 'exercise', contentId: skill1Exercises[2]._id },
      { skillId: SKILL_1_ID, stepNumber: 7, contentType: 'quiz', contentId: skill1Quiz._id }
    ]);
    console.log('   ✅ Progress: 7 steps (video→exercise→video→exercise→video→exercise→quiz)');

    // ========== SKILL 2: Số từ 6 đến 10 ==========
    console.log('\n📌 Tạo dữ liệu cho Skill 2: Số từ 6 đến 10');
    
    const skill2Videos = await Video.insertMany([
      {
        title: 'Video: Giới thiệu số 6',
        description: 'Học cách nhận biết số 6',
        url: 'https://example.com/skill2-video1.mp4',
        duration: 60
      },
      {
        title: 'Video: Giới thiệu số 7, 8',
        description: 'Học cách nhận biết số 7 và 8',
        url: 'https://example.com/skill2-video2.mp4',
        duration: 100
      },
      {
        title: 'Video: Giới thiệu số 9, 10',
        description: 'Học cách nhận biết số 9 và 10',
        url: 'https://example.com/skill2-video3.mp4',
        duration: 110
      }
    ]);
    console.log('   ✅ Videos:', skill2Videos.length);

    const skill2Exercises = await Exercise.insertMany([
      {
        title: 'Bài tập: Nhận biết số 6',
        description: 'Chọn hình có số 6',
        frontendRef: 'exercise_recognize_6',
        bonusPoints: 10
      },
      {
        title: 'Bài tập: Điền số 6-8',
        description: 'Điền số còn thiếu: 6, __, 8',
        frontendRef: 'exercise_fill_6_8',
        bonusPoints: 15
      },
      {
        title: 'Bài tập: Điền số 8-10',
        description: 'Điền số còn thiếu: 8, __, 10',
        frontendRef: 'exercise_fill_8_10',
        bonusPoints: 15
      }
    ]);
    console.log('   ✅ Exercises:', skill2Exercises.length);

    const skill2Quiz = await Quiz.create({
      title: 'Quiz: Kiểm tra số 6-10',
      description: 'Trắc nghiệm kiểm tra nhận biết số 6-10',
      totalQuestions: 3,
      bonusPoints: 25
    });

    await Question.insertMany([
      {
        quizId: skill2Quiz._id,
        questionText: 'Số nào đứng sau số 7?',
        options: ['6', '8', '9', '10'],
        correctAnswer: '8',
        order: 1
      },
      {
        quizId: skill2Quiz._id,
        questionText: 'Đếm: 6, 7, __, 9, 10. Số còn thiếu là?',
        options: ['5', '8', '11', '7'],
        correctAnswer: '8',
        order: 2
      },
      {
        quizId: skill2Quiz._id,
        questionText: 'Số nào lớn nhất trong 6, 7, 8, 9, 10?',
        options: ['6', '8', '10', '9'],
        correctAnswer: '10',
        order: 3
      }
    ]);
    console.log('   ✅ Quiz với 3 questions');

    // Tạo Progress: video → exercise → video → exercise → video → exercise → quiz
    const skill2Progresses = await Progress.insertMany([
      { skillId: SKILL_2_ID, stepNumber: 1, contentType: 'video', contentId: skill2Videos[0]._id },
      { skillId: SKILL_2_ID, stepNumber: 2, contentType: 'exercise', contentId: skill2Exercises[0]._id },
      { skillId: SKILL_2_ID, stepNumber: 3, contentType: 'video', contentId: skill2Videos[1]._id },
      { skillId: SKILL_2_ID, stepNumber: 4, contentType: 'exercise', contentId: skill2Exercises[1]._id },
      { skillId: SKILL_2_ID, stepNumber: 5, contentType: 'video', contentId: skill2Videos[2]._id },
      { skillId: SKILL_2_ID, stepNumber: 6, contentType: 'exercise', contentId: skill2Exercises[2]._id },
      { skillId: SKILL_2_ID, stepNumber: 7, contentType: 'quiz', contentId: skill2Quiz._id }
    ]);
    console.log('   ✅ Progress: 7 steps (video→exercise→video→exercise→video→exercise→quiz)');

    // ========== TỔNG KẾT ==========
    console.log('\n========== TỔNG KẾT ==========');
    console.log('📌 Chapter ID:', CHAPTER_ID);
    
    console.log('\n📌 Skill 1 - Số từ 1 đến 5 (ID:', SKILL_1_ID, ')');
    console.log('   Progress:');
    skill1Progresses.forEach(p => {
      console.log(`   - Step ${p.stepNumber}: ${p.contentType} → ${p._id}`);
    });
    
    console.log('\n📌 Skill 2 - Số từ 6 đến 10 (ID:', SKILL_2_ID, ')');
    console.log('   Progress:');
    skill2Progresses.forEach(p => {
      console.log(`   - Step ${p.stepNumber}: ${p.contentType} → ${p._id}`);
    });

    console.log('\n✅ Hoàn tất thêm dữ liệu mẫu!');

  } catch (error) {
    console.error('❌ Lỗi:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Đã ngắt kết nối MongoDB');
  }
};

// Chạy
connectDB().then(addSampleData);
