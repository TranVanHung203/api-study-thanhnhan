import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import 'dotenv/config';

import Class from './src/models/class.schema.js';
import Chapter from './src/models/chapter.schema.js';
import User from './src/models/user.schema.js';
import Skill from './src/models/skill.schema.js';
import Progress from './src/models/progress.schema.js';
import Video from './src/models/video.schema.js';
import Exercise from './src/models/exercise.schema.js';
import Quiz from './src/models/quiz.schema.js';
import Question from './src/models/question.schema.js';
import Reward from './src/models/reward.schema.js';
import UserActivity from './src/models/userActivity.schema.js';
import RefreshToken from './src/models/refreshToken.schema.js';

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

// Xóa tất cả dữ liệu cũ
const clearDatabase = async () => {
  console.log('🗑️  Đang xóa dữ liệu cũ...');
  await Promise.all([
    Class.deleteMany({}),
    Chapter.deleteMany({}),
    User.deleteMany({}),
    Skill.deleteMany({}),
    Progress.deleteMany({}),
    Video.deleteMany({}),
    Exercise.deleteMany({}),
    Quiz.deleteMany({}),
    Question.deleteMany({}),
    Reward.deleteMany({}),
    UserActivity.deleteMany({}),
    RefreshToken.deleteMany({})
  ]);
  console.log('✅ Đã xóa dữ liệu cũ');
};

// Seed data
const seedDatabase = async () => {
  try {
    // Xóa dữ liệu cũ
    await clearDatabase();

    // ========== 1. TẠO CLASS ==========
    const classData = await Class.create({
      className: 'Lớp 1',
      description: 'Lớp học căn bản cho học sinh lớp 1'
    });
    console.log('✅ Class đã tạo:', classData._id);

    // ========== 2. TẠO CHAPTERS ==========
    const chapters = await Chapter.insertMany([
      {
        classId: classData._id,
        chapterName: 'Chương 1: Làm quen với số',
        description: 'Học các số từ 1 đến 10',
        order: 1
      },
      {
        classId: classData._id,
        chapterName: 'Chương 2: Phép cộng cơ bản',
        description: 'Học phép cộng trong phạm vi 20',
        order: 2
      },
      {
        classId: classData._id,
        chapterName: 'Chương 3: Phép cộng nâng cao',
        description: 'Học phép cộng trong phạm vi 100',
        order: 3
      }
    ]);
    console.log('✅ Chapters đã tạo:', chapters.length);

    // ========== 3. TẠO USERS ==========
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

    // ========== 4. TẠO REWARD CHO CÁC USER ==========
    for (const user of users) {
      await Reward.create({
        userId: user._id,
        totalPoints: 0
      });
    }
    console.log('✅ Rewards đã tạo');

    // ========== 5. TẠO SKILLS CHO CHAPTER 1 ==========
    const skillsChapter1 = await Skill.insertMany([
      {
        chapterId: chapters[0]._id,
        skillName: 'Số từ 1 đến 5',
        description: 'Học các số 1, 2, 3, 4, 5',
        order: 1
      },
      {
        chapterId: chapters[0]._id,
        skillName: 'Số từ 6 đến 10',
        description: 'Học các số 6, 7, 8, 9, 10',
        order: 2
      }
    ]);
    console.log('✅ Skills Chương 1 đã tạo:', skillsChapter1.length);

    // ========== 6. TẠO SKILLS CHO CHAPTER 2 ==========
    const skillsChapter2 = await Skill.insertMany([
      {
        chapterId: chapters[1]._id,
        skillName: 'Cộng trong phạm vi 10',
        description: 'Các phép cộng có kết quả không quá 10',
        order: 1
      },
      {
        chapterId: chapters[1]._id,
        skillName: 'Cộng trong phạm vi 20',
        description: 'Các phép cộng có kết quả không quá 20',
        order: 2
      }
    ]);
    console.log('✅ Skills Chương 2 đã tạo:', skillsChapter2.length);

    // ========== 7. TẠO SKILLS CHO CHAPTER 3 ==========
    const skillsChapter3 = await Skill.insertMany([
      {
        chapterId: chapters[2]._id,
        skillName: 'Cộng trong phạm vi 50',
        description: 'Các phép cộng có kết quả không quá 50',
        order: 1
      },
      {
        chapterId: chapters[2]._id,
        skillName: 'Cộng trong phạm vi 100',
        description: 'Các phép cộng có kết quả không quá 100',
        order: 2
      }
    ]);
    console.log('✅ Skills Chương 3 đã tạo:', skillsChapter3.length);

    // ========== 8. TẠO VIDEOS ==========
    const videos = await Video.insertMany([
      {
        title: 'Giới thiệu số 1-5',
        url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        duration: 180,
        description: 'Video giới thiệu các số từ 1 đến 5'
      },
      {
        title: 'Giới thiệu số 6-10',
        url: 'https://www.youtube.com/embed/jNQXAC9IVRw',
        duration: 200,
        description: 'Video giới thiệu các số từ 6 đến 10'
      },
      {
        title: 'Học cộng trong phạm vi 10',
        url: 'https://www.youtube.com/embed/abc123xyz',
        duration: 300,
        description: 'Video hướng dẫn phép cộng cơ bản'
      },
      {
        title: 'Học cộng trong phạm vi 20',
        url: 'https://www.youtube.com/embed/xyz456abc',
        duration: 350,
        description: 'Video hướng dẫn phép cộng nâng cao'
      }
    ]);
    console.log('✅ Videos đã tạo:', videos.length);

    // ========== 9. TẠO EXERCISES ==========
    const exercises = await Exercise.insertMany([
      {
        title: 'Nhận biết số 1-5',
        frontendRef: 'number_recognition_1_5',
        description: 'Bài tập nhận biết số từ 1 đến 5',
        bonusPoints: 5
      },
      {
        title: 'Nhận biết số 6-10',
        frontendRef: 'number_recognition_6_10',
        description: 'Bài tập nhận biết số từ 6 đến 10',
        bonusPoints: 5
      },
      {
        title: 'Bài tập cộng 1-10',
        frontendRef: 'addition_1_10',
        description: 'Làm bài tập cộng trong phạm vi 10',
        bonusPoints: 10
      },
      {
        title: 'Bài tập cộng 1-20',
        frontendRef: 'addition_1_20',
        description: 'Làm bài tập cộng trong phạm vi 20',
        bonusPoints: 15
      }
    ]);
    console.log('✅ Exercises đã tạo:', exercises.length);

    // ========== 10. TẠO QUIZ ==========
    const quizzes = await Quiz.insertMany([
      {
        title: 'Kiểm tra nhận biết số',
        description: 'Bài kiểm tra về các số từ 1-10',
        totalQuestions: 5,
        bonusPoints: 20
      },
      {
        title: 'Kiểm tra phép cộng cơ bản',
        description: 'Bài kiểm tra phép cộng trong phạm vi 20',
        totalQuestions: 10,
        bonusPoints: 50
      }
    ]);
    console.log('✅ Quizzes đã tạo:', quizzes.length);

    // ========== 11. TẠO CÂU HỎI CHO QUIZ 1 ==========
    const questionsQuiz1 = await Question.insertMany([
      { quizId: quizzes[0]._id, questionText: 'Số nào lớn hơn: 3 hay 5?', options: ['3', '5'], correctAnswer: '5', order: 1 },
      { quizId: quizzes[0]._id, questionText: 'Số nào nhỏ hơn: 7 hay 4?', options: ['7', '4'], correctAnswer: '4', order: 2 },
      { quizId: quizzes[0]._id, questionText: 'Sau số 8 là số mấy?', options: ['7', '9', '10'], correctAnswer: '9', order: 3 },
      { quizId: quizzes[0]._id, questionText: 'Trước số 6 là số mấy?', options: ['4', '5', '7'], correctAnswer: '5', order: 4 },
      { quizId: quizzes[0]._id, questionText: 'Có bao nhiêu số từ 1 đến 10?', options: ['9', '10', '11'], correctAnswer: '10', order: 5 }
    ]);
    console.log('✅ Questions Quiz 1 đã tạo:', questionsQuiz1.length);

    // ========== 12. TẠO CÂU HỎI CHO QUIZ 2 ==========
    const questionsQuiz2 = await Question.insertMany([
      { quizId: quizzes[1]._id, questionText: '5 + 3 = ?', options: ['7', '8', '9'], correctAnswer: '8', order: 1 },
      { quizId: quizzes[1]._id, questionText: '7 + 6 = ?', options: ['12', '13', '14'], correctAnswer: '13', order: 2 },
      { quizId: quizzes[1]._id, questionText: '9 + 4 = ?', options: ['12', '13', '14'], correctAnswer: '13', order: 3 },
      { quizId: quizzes[1]._id, questionText: '8 + 7 = ?', options: ['14', '15', '16'], correctAnswer: '15', order: 4 },
      { quizId: quizzes[1]._id, questionText: '11 + 9 = ?', options: ['19', '20', '21'], correctAnswer: '20', order: 5 },
      { quizId: quizzes[1]._id, questionText: '12 + 8 = ?', options: ['19', '20', '21'], correctAnswer: '20', order: 6 },
      { quizId: quizzes[1]._id, questionText: '6 + 5 = ?', options: ['10', '11', '12'], correctAnswer: '11', order: 7 },
      { quizId: quizzes[1]._id, questionText: '14 + 6 = ?', options: ['19', '20', '21'], correctAnswer: '20', order: 8 },
      { quizId: quizzes[1]._id, questionText: '10 + 10 = ?', options: ['18', '19', '20'], correctAnswer: '20', order: 9 },
      { quizId: quizzes[1]._id, questionText: '15 + 5 = ?', options: ['19', '20', '21'], correctAnswer: '20', order: 10 }
    ]);
    console.log('✅ Questions Quiz 2 đã tạo:', questionsQuiz2.length);

    // ========== 13. TẠO PROGRESS CHO SKILL 1 (Chapter 1 - Số 1-5) ==========
    // Create progresses without contentId, then link content.progressId -> progress._id
    const progressSkill1 = await Progress.insertMany([
      { skillId: skillsChapter1[0]._id, stepNumber: 1, contentType: 'video' },
      { skillId: skillsChapter1[0]._id, stepNumber: 2, contentType: 'exercise' }
    ]);
    // Link content documents
    await Video.findByIdAndUpdate(videos[0]._id, { progressId: progressSkill1[0]._id });
    await Exercise.findByIdAndUpdate(exercises[0]._id, { progressId: progressSkill1[1]._id });
    console.log('✅ Progress Skill 1 đã tạo and linked:', progressSkill1.length);

    // ========== 14. TẠO PROGRESS CHO SKILL 2 (Chapter 1 - Số 6-10) ==========
    const progressSkill2 = await Progress.insertMany([
      { skillId: skillsChapter1[1]._id, stepNumber: 1, contentType: 'video' },
      { skillId: skillsChapter1[1]._id, stepNumber: 2, contentType: 'exercise' },
      { skillId: skillsChapter1[1]._id, stepNumber: 3, contentType: 'quiz' }
    ]);
    await Video.findByIdAndUpdate(videos[1]._id, { progressId: progressSkill2[0]._id });
    await Exercise.findByIdAndUpdate(exercises[1]._id, { progressId: progressSkill2[1]._id });
    await Quiz.findByIdAndUpdate(quizzes[0]._id, { progressId: progressSkill2[2]._id });
    console.log('✅ Progress Skill 2 đã tạo and linked:', progressSkill2.length);

    // ========== 15. TẠO PROGRESS CHO SKILL 3 (Chapter 2 - Cộng 1-10) ==========
    const progressSkill3 = await Progress.insertMany([
      { skillId: skillsChapter2[0]._id, stepNumber: 1, contentType: 'video' },
      { skillId: skillsChapter2[0]._id, stepNumber: 2, contentType: 'exercise' }
    ]);
    await Video.findByIdAndUpdate(videos[2]._id, { progressId: progressSkill3[0]._id });
    await Exercise.findByIdAndUpdate(exercises[2]._id, { progressId: progressSkill3[1]._id });
    console.log('✅ Progress Skill 3 đã tạo and linked:', progressSkill3.length);

    // ========== 16. TẠO PROGRESS CHO SKILL 4 (Chapter 2 - Cộng 1-20) ==========
    const progressSkill4 = await Progress.insertMany([
      { skillId: skillsChapter2[1]._id, stepNumber: 1, contentType: 'video' },
      { skillId: skillsChapter2[1]._id, stepNumber: 2, contentType: 'exercise' },
      { skillId: skillsChapter2[1]._id, stepNumber: 3, contentType: 'quiz' }
    ]);
    await Video.findByIdAndUpdate(videos[3]._id, { progressId: progressSkill4[0]._id });
    await Exercise.findByIdAndUpdate(exercises[3]._id, { progressId: progressSkill4[1]._id });
    await Quiz.findByIdAndUpdate(quizzes[1]._id, { progressId: progressSkill4[2]._id });
    console.log('✅ Progress Skill 4 đã tạo and linked:', progressSkill4.length);

    // ========== 17. TẠO USER ACTIVITIES (MẪU - User 1 đã học xong Skill 1 và đang học Skill 2) ==========
    const userActivities = [
      // User 1 đã hoàn thành Skill 1 (cả 2 progress)
      { userId: users[0]._id, progressId: progressSkill1[0]._id, contentType: 'video', score: 0, isCompleted: true, bonusEarned: 0 },
      { userId: users[0]._id, progressId: progressSkill1[1]._id, contentType: 'exercise', score: 100, isCompleted: true, bonusEarned: 5 },
      // User 1 đang học Skill 2 (hoàn thành 1 progress)
      { userId: users[0]._id, progressId: progressSkill2[0]._id, contentType: 'video', score: 0, isCompleted: true, bonusEarned: 0 }
    ];

    await UserActivity.insertMany(userActivities);
    console.log('✅ User Activities đã tạo:', userActivities.length);

    // ========== 18. CẬP NHẬT ĐIỂM REWARD ==========
    await Reward.findOneAndUpdate(
      { userId: users[0]._id },
      { totalPoints: 5 }
    );
    console.log('✅ Rewards đã cập nhật');

    console.log('\n' + '='.repeat(60));
    console.log('✅ SEED DATABASE HOÀN TẤT!');
    console.log('='.repeat(60));
    console.log('\n📊 Dữ liệu đã tạo:');
    console.log(`  • Classes: 1`);
    console.log(`  • Chapters: 3`);
    console.log(`  • Users: 2`);
    console.log(`  • Skills: 6 (2 per chapter)`);
    console.log(`  • Videos: 4`);
    console.log(`  • Exercises: 4`);
    console.log(`  • Quizzes: 2`);
    console.log(`  • Questions: 15 (5 + 10)`);
    console.log(`  • Progress steps: 10`);
    console.log(`  • User activities: 3`);
    console.log('\n🔐 Thông tin đăng nhập:');
    console.log(`  User 1: student1 / user123`);
    console.log(`  User 2: student2 / user456`);
    console.log('\n📍 Test API /chapters/:chapterId/map với Chapter ID:');
    console.log(`  Chapter 1: ${chapters[0]._id}`);
    console.log(`  Chapter 2: ${chapters[1]._id}`);
    console.log(`  Chapter 3: ${chapters[2]._id}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi seed database:', error);
    process.exit(1);
  }
};

// Chạy
connectDB().then(() => seedDatabase());
