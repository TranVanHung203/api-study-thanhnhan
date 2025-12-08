import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import 'dotenv/config';

import Class from './src/models/class.schema.js';
import User from './src/models/user.schema.js';
import Skill from './src/models/skill.schema.js';
import Progress from './src/models/progress.schema.js';
import Video from './src/models/video.schema.js';
import Exercise from './src/models/exercise.schema.js';
import Quiz from './src/models/quiz.schema.js';
import Question from './src/models/question.schema.js';
import Reward from './src/models/reward.schema.js';
import UserActivity from './src/models/userActivity.schema.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/online_learning';

// Kết nối MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Kết nối MongoDB thành công');
  } catch (error) {
    console.error('❌ Lỗi kết nối MongoDB:', error);
    process.exit(1);
  }
};

// Seed data
const seedDatabase = async () => {
  try {
    // ========== 1. TẠO CLASS ==========
    let classData = await Class.findOne({ className: 'Lớp 1' });
    if (!classData) {
      classData = await Class.create({
        className: 'Lớp 1',
        description: 'Lớp học căn bản cho học sinh lớp 1'
      });
      console.log('✅ Class đã tạo:', classData._id);
    } else {
      console.log('⏭️  Class đã tồn tại, bỏ qua');
    }

    // ========== 2. TẠO USERS ==========
    const users = [];
    const userPasswords = ['user123', 'user456'];
    const userInfos = [
      { username: 'student1', email: 'student1@example.com', fullName: 'Nguyễn Văn A' },
      { username: 'student2', email: 'student2@example.com', fullName: 'Trần Thị B' }
    ];

    for (let i = 0; i < 2; i++) {
      const passwordHash = await bcrypt.hash(userPasswords[i], 10);
      const user = await User.create({
        ...userInfos[i],
        passwordHash,
        classId: classData._id
      });
      users.push(user);
      console.log(`✅ User #${i + 1} đã tạo:`, user.username);
    }

    // ========== 3. TẠO REWARD CHO CÁC USER ==========
    for (const user of users) {
      await Reward.create({
        userId: user._id,
        totalPoints: 0
      });
    }
    console.log('✅ Rewards đã tạo');

    // ========== 4. TẠO SKILL ==========
    const skill = await Skill.create({
      classId: classData._id,
      skillName: 'Cộng trong phạm vi 100',
      description: 'Học các phép cộng từ 1 đến 100',
      order: 1
    });
    console.log('✅ Skill đã tạo:', skill._id);

    // ========== 5. TẠO VIDEO ==========
    const videos = await Video.insertMany([
      {
        title: 'Giới thiệu về phép cộng',
        url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        duration: 300,
        description: 'Video giới thiệu cơ bản về phép cộng'
      },
      {
        title: 'Cộng các số từ 1-20',
        url: 'https://www.youtube.com/embed/jNQXAC9IVRw',
        duration: 480,
        description: 'Hướng dẫn cộng các số nhỏ'
      }
    ]);
    console.log('✅ Videos đã tạo:', videos.length);

    // ========== 6. TẠO EXERCISE ==========
    const exercises = await Exercise.insertMany([
      {
        title: 'Bài tập cộng số 1',
        frontendRef: 'addition_level_1',
        description: 'Làm bài tập cộng các số từ 1-10',
        bonusPoints: 10
      },
      {
        title: 'Bài tập cộng số 2',
        frontendRef: 'addition_level_2',
        description: 'Làm bài tập cộng các số từ 11-50',
        bonusPoints: 15
      }
    ]);
    console.log('✅ Exercises đã tạo:', exercises.length);

    // ========== 7. TẠO QUIZ ==========
    const quiz = await Quiz.create({
      title: 'Kiểm tra kiến thức cộng',
      description: 'Bài kiểm tra 15 câu về phép cộng',
      totalQuestions: 15,
      bonusPoints: 100
    });
    console.log('✅ Quiz đã tạo:', quiz._id);

    // ========== 8. TẠO CÂU HỎI (15 CÂU) ==========
    const questions = await Question.insertMany([
      {
        quizId: quiz._id,
        questionText: '5 + 3 = ?',
        options: ['7', '8', '9', '10'],
        correctAnswer: '8',
        hintText: 'Đếm từ 5: 6, 7, 8',
        order: 1
      },
      {
        quizId: quiz._id,
        questionText: '12 + 8 = ?',
        options: ['19', '20', '21', '22'],
        correctAnswer: '20',
        hintText: 'Hãy tính từng chữ số',
        order: 2
      },
      {
        quizId: quiz._id,
        questionText: '25 + 15 = ?',
        options: ['39', '40', '41', '42'],
        correctAnswer: '40',
        hintText: '20 + 20 = ?',
        order: 3
      },
      {
        quizId: quiz._id,
        questionText: '7 + 6 = ?',
        options: ['12', '13', '14', '15'],
        correctAnswer: '13',
        hintText: 'Đếm từ 7',
        order: 4
      },
      {
        quizId: quiz._id,
        questionText: '18 + 22 = ?',
        options: ['38', '39', '40', '41'],
        correctAnswer: '40',
        hintText: 'Tính từng chữ số riêng',
        order: 5
      },
      {
        quizId: quiz._id,
        questionText: '33 + 17 = ?',
        options: ['48', '49', '50', '51'],
        correctAnswer: '50',
        hintText: '30 + 20 = ?',
        order: 6
      },
      {
        quizId: quiz._id,
        questionText: '9 + 4 = ?',
        options: ['12', '13', '14', '15'],
        correctAnswer: '13',
        hintText: 'Đếm từ 9: 10, 11, 12, 13',
        order: 7
      },
      {
        quizId: quiz._id,
        questionText: '44 + 26 = ?',
        options: ['68', '69', '70', '71'],
        correctAnswer: '70',
        hintText: '40 + 30 = ?',
        order: 8
      },
      {
        quizId: quiz._id,
        questionText: '11 + 9 = ?',
        options: ['19', '20', '21', '22'],
        correctAnswer: '20',
        hintText: 'Tính từng chữ số',
        order: 9
      },
      {
        quizId: quiz._id,
        questionText: '37 + 23 = ?',
        options: ['58', '59', '60', '61'],
        correctAnswer: '60',
        hintText: '30 + 20 = 50, sau đó + 10',
        order: 10
      },
      {
        quizId: quiz._id,
        questionText: '16 + 14 = ?',
        options: ['28', '29', '30', '31'],
        correctAnswer: '30',
        hintText: 'Tính từng chữ số',
        order: 11
      },
      {
        quizId: quiz._id,
        questionText: '42 + 18 = ?',
        options: ['58', '59', '60', '61'],
        correctAnswer: '60',
        hintText: '40 + 20 = ?',
        order: 12
      },
      {
        quizId: quiz._id,
        questionText: '8 + 7 = ?',
        options: ['14', '15', '16', '17'],
        correctAnswer: '15',
        hintText: 'Đếm từ 8',
        order: 13
      },
      {
        quizId: quiz._id,
        questionText: '29 + 31 = ?',
        options: ['58', '59', '60', '61'],
        correctAnswer: '60',
        hintText: '30 + 30 = ?',
        order: 14
      },
      {
        quizId: quiz._id,
        questionText: '21 + 19 = ?',
        options: ['38', '39', '40', '41'],
        correctAnswer: '40',
        hintText: '20 + 20 = ?',
        order: 15
      }
    ]);
    console.log('✅ Questions đã tạo:', questions.length);

    // ========== 9. TẠO PROGRESS (ĐỊNH NGHĨA CÁC BƯỚC) ==========
    const progresses = await Progress.insertMany([
      {
        skillId: skill._id,
        stepNumber: 1,
        contentType: 'video',
        contentId: videos[0]._id
      },
      {
        skillId: skill._id,
        stepNumber: 2,
        contentType: 'video',
        contentId: videos[1]._id
      },
      {
        skillId: skill._id,
        stepNumber: 3,
        contentType: 'exercise',
        contentId: exercises[0]._id
      },
      {
        skillId: skill._id,
        stepNumber: 4,
        contentType: 'exercise',
        contentId: exercises[1]._id
      },
      {
        skillId: skill._id,
        stepNumber: 5,
        contentType: 'quiz',
        contentId: quiz._id
      }
    ]);
    console.log('✅ Progress steps đã tạo:', progresses.length);

    // ========== 10. TẠO USER ACTIVITIES (MẪU LỊCH SỬ HỌC) ==========
    const userActivities = [
      {
        userId: users[0]._id,
        progressId: progresses[0]._id,
        contentType: 'video',
        score: 0,
        isCompleted: true,
        bonusEarned: 0
      },
      {
        userId: users[0]._id,
        progressId: progresses[1]._id,
        contentType: 'video',
        score: 0,
        isCompleted: true,
        bonusEarned: 0
      },
      {
        userId: users[0]._id,
        progressId: progresses[2]._id,
        contentType: 'exercise',
        score: 10,
        isCompleted: true,
        bonusEarned: 10
      }
    ];

    await UserActivity.insertMany(userActivities);
    console.log('✅ User Activities đã tạo:', userActivities.length);

    // ========== 11. CẬP NHẬT ĐIỂM REWARD ==========
    await Reward.findOneAndUpdate(
      { userId: users[0]._id },
      { totalPoints: 10 }
    );
    console.log('✅ Rewards đã cập nhật');

    console.log('\n' + '='.repeat(50));
    console.log('✅ SEED DATABASE HOÀN TẤT!');
    console.log('='.repeat(50));
    console.log('\n📊 Dữ liệu đã tạo:');
    console.log(`  • Classes: 1`);
    console.log(`  • Users: 2`);
    console.log(`  • Skills: 1`);
    console.log(`  • Videos: 2`);
    console.log(`  • Exercises: 2`);
    console.log(`  • Quiz: 1`);
    console.log(`  • Questions: 15`);
    console.log(`  • Progress steps: 5`);
    console.log(`  • User activities: 3`);
    console.log('\n🔐 Thông tin đăng nhập:');
    console.log(`  User 1: student1 / user123`);
    console.log(`  User 2: student2 / user456`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi seed database:', error);
    process.exit(1);
  }
};

// Chạy
connectDB().then(() => seedDatabase());
