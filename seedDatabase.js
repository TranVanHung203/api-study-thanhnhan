import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import 'dotenv/config';

import Class from './src/models/class.schema.js';
import Chapter from './src/models/chapter.schema.js';
import User from './src/models/user.schema.js';
import Skill from './src/models/skill.schema.js';
import Progress from './src/models/progress.schema.js';
import Video from './src/models/video.schema.js';
import Quiz from './src/models/quiz.schema.js';
import Question from './src/models/question.schema.js';
import Reward from './src/models/reward.schema.js';
import UserActivity from './src/models/userActivity.schema.js';
import RefreshToken from './src/models/refreshToken.schema.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/online_learning';

// Káº¿t ná»‘i MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('âœ… Káº¿t ná»‘i MongoDB thÃ nh cÃ´ng');
  } catch (error) {
    console.error('âŒ Lá»—i káº¿t ná»‘i MongoDB:', error);
    process.exit(1);
  }
};

// XÃ³a táº¥t cáº£ dá»¯ liá»‡u cÅ©
const clearDatabase = async () => {
  console.log('ðŸ—‘ï¸  Äang xÃ³a dá»¯ liá»‡u cÅ©...');
  await Promise.all([
    Class.deleteMany({}),
    Chapter.deleteMany({}),
    User.deleteMany({}),
    Skill.deleteMany({}),
    Progress.deleteMany({}),
    Video.deleteMany({}),
    Quiz.deleteMany({}),
    Question.deleteMany({}),
    Reward.deleteMany({}),
    UserActivity.deleteMany({}),
    RefreshToken.deleteMany({})
  ]);
  console.log('âœ… ÄÃ£ xÃ³a dá»¯ liá»‡u cÅ©');
};

// Seed data
const seedDatabase = async () => {
  try {
    // XÃ³a dá»¯ liá»‡u cÅ©
    await clearDatabase();

    // ========== 1. Táº O CLASS ==========
    const classData = await Class.create({
      className: 'Lá»›p 1',
      description: 'Lá»›p há»c cÄƒn báº£n cho há»c sinh lá»›p 1'
    });
    console.log('âœ… Class Ä‘Ã£ táº¡o:', classData._id);

    // ========== 2. Táº O CHAPTERS ==========
    const chapters = await Chapter.insertMany([
      {
        classId: classData._id,
        chapterName: 'ChÆ°Æ¡ng 1: LÃ m quen vá»›i sá»‘',
        description: 'Há»c cÃ¡c sá»‘ tá»« 1 Ä‘áº¿n 10',
        order: 1
      },
      {
        classId: classData._id,
        chapterName: 'ChÆ°Æ¡ng 2: PhÃ©p cá»™ng cÆ¡ báº£n',
        description: 'Há»c phÃ©p cá»™ng trong pháº¡m vi 20',
        order: 2
      },
      {
        classId: classData._id,
        chapterName: 'ChÆ°Æ¡ng 3: PhÃ©p cá»™ng nÃ¢ng cao',
        description: 'Há»c phÃ©p cá»™ng trong pháº¡m vi 100',
        order: 3
      }
    ]);
    console.log('âœ… Chapters Ä‘Ã£ táº¡o:', chapters.length);

    // ========== 3. Táº O USERS ==========
    const users = [];
    const userPasswords = ['user123', 'user456'];
    const userInfos = [
      { username: 'student1', email: 'student1@example.com', fullName: 'Nguyá»…n VÄƒn A' },
      { username: 'student2', email: 'student2@example.com', fullName: 'Tráº§n Thá»‹ B' }
    ];

    for (let i = 0; i < 2; i++) {
      const passwordHash = await bcrypt.hash(userPasswords[i], 10);
      const user = await User.create({
        ...userInfos[i],
        passwordHash,
        classId: classData._id
      });
      users.push(user);
      console.log(`âœ… User #${i + 1} Ä‘Ã£ táº¡o:`, user.username);
    }

    // ========== 4. Táº O REWARD CHO CÃC USER ==========
    for (const user of users) {
      await Reward.create({
        userId: user._id,
        totalPoints: 0
      });
    }
    console.log('âœ… Rewards Ä‘Ã£ táº¡o');

    // ========== 5. Táº O SKILLS CHO CHAPTER 1 ==========
    const skillsChapter1 = await Skill.insertMany([
      {
        chapterId: chapters[0]._id,
        skillName: 'Sá»‘ tá»« 1 Ä‘áº¿n 5',
        description: 'Há»c cÃ¡c sá»‘ 1, 2, 3, 4, 5',
        order: 1
      },
      {
        chapterId: chapters[0]._id,
        skillName: 'Sá»‘ tá»« 6 Ä‘áº¿n 10',
        description: 'Há»c cÃ¡c sá»‘ 6, 7, 8, 9, 10',
        order: 2
      }
    ]);
    console.log('âœ… Skills ChÆ°Æ¡ng 1 Ä‘Ã£ táº¡o:', skillsChapter1.length);

    // ========== 6. Táº O SKILLS CHO CHAPTER 2 ==========
    const skillsChapter2 = await Skill.insertMany([
      {
        chapterId: chapters[1]._id,
        skillName: 'Cá»™ng trong pháº¡m vi 10',
        description: 'CÃ¡c phÃ©p cá»™ng cÃ³ káº¿t quáº£ khÃ´ng quÃ¡ 10',
        order: 1
      },
      {
        chapterId: chapters[1]._id,
        skillName: 'Cá»™ng trong pháº¡m vi 20',
        description: 'CÃ¡c phÃ©p cá»™ng cÃ³ káº¿t quáº£ khÃ´ng quÃ¡ 20',
        order: 2
      }
    ]);
    console.log('âœ… Skills ChÆ°Æ¡ng 2 Ä‘Ã£ táº¡o:', skillsChapter2.length);

    // ========== 7. Táº O SKILLS CHO CHAPTER 3 ==========
    const skillsChapter3 = await Skill.insertMany([
      {
        chapterId: chapters[2]._id,
        skillName: 'Cá»™ng trong pháº¡m vi 50',
        description: 'CÃ¡c phÃ©p cá»™ng cÃ³ káº¿t quáº£ khÃ´ng quÃ¡ 50',
        order: 1
      },
      {
        chapterId: chapters[2]._id,
        skillName: 'Cá»™ng trong pháº¡m vi 100',
        description: 'CÃ¡c phÃ©p cá»™ng cÃ³ káº¿t quáº£ khÃ´ng quÃ¡ 100',
        order: 2
      }
    ]);
    console.log('âœ… Skills ChÆ°Æ¡ng 3 Ä‘Ã£ táº¡o:', skillsChapter3.length);

    // ========== 8. Táº O VIDEOS ==========
    const videos = await Video.insertMany([
      {
        title: 'Giá»›i thiá»‡u sá»‘ 1-5',
        url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        description: 'Video giá»›i thiá»‡u cÃ¡c sá»‘ tá»« 1 Ä‘áº¿n 5'
      },
      {
        title: 'Giá»›i thiá»‡u sá»‘ 6-10',
        url: 'https://www.youtube.com/embed/jNQXAC9IVRw',
        description: 'Video giá»›i thiá»‡u cÃ¡c sá»‘ tá»« 6 Ä‘áº¿n 10'
      },
      {
        title: 'Há»c cá»™ng trong pháº¡m vi 10',
        url: 'https://www.youtube.com/embed/abc123xyz',
        description: 'Video hÆ°á»›ng dáº«n phÃ©p cá»™ng cÆ¡ báº£n'
      },
      {
        title: 'Há»c cá»™ng trong pháº¡m vi 20',
        url: 'https://www.youtube.com/embed/xyz456abc',
        description: 'Video hÆ°á»›ng dáº«n phÃ©p cá»™ng nÃ¢ng cao'
      }
    ]);
    console.log('âœ… Videos Ä‘Ã£ táº¡o:', videos.length);


    // ========== 10. Táº O QUIZ ==========
    const quizzes = await Quiz.insertMany([
      {
        title: 'Kiá»ƒm tra nháº­n biáº¿t sá»‘',
        description: 'BÃ i kiá»ƒm tra vá» cÃ¡c sá»‘ tá»« 1-10',
        totalQuestions: 5,
        bonusPoints: 20
      },
      {
        title: 'Kiá»ƒm tra phÃ©p cá»™ng cÆ¡ báº£n',
        description: 'BÃ i kiá»ƒm tra phÃ©p cá»™ng trong pháº¡m vi 20',
        totalQuestions: 10,
        bonusPoints: 50
      }
    ]);
    console.log('âœ… Quizzes Ä‘Ã£ táº¡o:', quizzes.length);

    // ========== 11. Táº O CÃ‚U Há»ŽI CHO QUIZ 1 ==========
    const questionsQuiz1 = await Question.insertMany([
      { quizId: quizzes[0]._id, questionText: 'Sá»‘ nÃ o lá»›n hÆ¡n: 3 hay 5?', options: ['3', '5'], correctAnswer: '5', order: 1 },
      { quizId: quizzes[0]._id, questionText: 'Sá»‘ nÃ o nhá» hÆ¡n: 7 hay 4?', options: ['7', '4'], correctAnswer: '4', order: 2 },
      { quizId: quizzes[0]._id, questionText: 'Sau sá»‘ 8 lÃ  sá»‘ máº¥y?', options: ['7', '9', '10'], correctAnswer: '9', order: 3 },
      { quizId: quizzes[0]._id, questionText: 'TrÆ°á»›c sá»‘ 6 lÃ  sá»‘ máº¥y?', options: ['4', '5', '7'], correctAnswer: '5', order: 4 },
      { quizId: quizzes[0]._id, questionText: 'CÃ³ bao nhiÃªu sá»‘ tá»« 1 Ä‘áº¿n 10?', options: ['9', '10', '11'], correctAnswer: '10', order: 5 }
    ]);
    console.log('âœ… Questions Quiz 1 Ä‘Ã£ táº¡o:', questionsQuiz1.length);

    // ========== 12. Táº O CÃ‚U Há»ŽI CHO QUIZ 2 ==========
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
    console.log('âœ… Questions Quiz 2 Ä‘Ã£ táº¡o:', questionsQuiz2.length);

    // ========== 13. Táº O PROGRESS CHO SKILL 1 (Chapter 1 - Sá»‘ 1-5) ==========
    // Create progresses without contentId, then link content.progressId -> progress._id
    const progressSkill1 = await Progress.insertMany([
      { skillId: skillsChapter1[0]._id, stepNumber: 1, contentType: 'video' },
    ]);
    // Link content documents
    await Video.findByIdAndUpdate(videos[0]._id, { progressId: progressSkill1[0]._id });
    console.log('âœ… Progress Skill 1 Ä‘Ã£ táº¡o and linked:', progressSkill1.length);

    // ========== 14. Táº O PROGRESS CHO SKILL 2 (Chapter 1 - Sá»‘ 6-10) ==========
    const progressSkill2 = await Progress.insertMany([
      { skillId: skillsChapter1[1]._id, stepNumber: 1, contentType: 'video' },
      { skillId: skillsChapter1[1]._id, stepNumber: 2, contentType: 'quiz' }
    ]);
    await Video.findByIdAndUpdate(videos[1]._id, { progressId: progressSkill2[0]._id });
    await Quiz.findByIdAndUpdate(quizzes[0]._id, { progressId: progressSkill2[1]._id });
    console.log('âœ… Progress Skill 2 Ä‘Ã£ táº¡o and linked:', progressSkill2.length);

    // ========== 15. Táº O PROGRESS CHO SKILL 3 (Chapter 2 - Cá»™ng 1-10) ==========
    const progressSkill3 = await Progress.insertMany([
      { skillId: skillsChapter2[0]._id, stepNumber: 1, contentType: 'video' },
    ]);
    await Video.findByIdAndUpdate(videos[2]._id, { progressId: progressSkill3[0]._id });
    console.log('âœ… Progress Skill 3 Ä‘Ã£ táº¡o and linked:', progressSkill3.length);

    // ========== 16. Táº O PROGRESS CHO SKILL 4 (Chapter 2 - Cá»™ng 1-20) ==========
    const progressSkill4 = await Progress.insertMany([
      { skillId: skillsChapter2[1]._id, stepNumber: 1, contentType: 'video' },
      { skillId: skillsChapter2[1]._id, stepNumber: 2, contentType: 'quiz' }
    ]);
    await Video.findByIdAndUpdate(videos[3]._id, { progressId: progressSkill4[0]._id });
    await Quiz.findByIdAndUpdate(quizzes[1]._id, { progressId: progressSkill4[1]._id });
    console.log('âœ… Progress Skill 4 Ä‘Ã£ táº¡o and linked:', progressSkill4.length);

    // ========== 17. Táº O USER ACTIVITIES (MáºªU - User 1 Ä‘Ã£ há»c xong Skill 1 vÃ  Ä‘ang há»c Skill 2) ==========
    const userActivities = [
      // User 1 Ä‘Ã£ hoÃ n thÃ nh Skill 1
      { userId: users[0]._id, progressId: progressSkill1[0]._id, contentType: 'video', score: 0, isCompleted: true, bonusEarned: 0 },
      { userId: users[0]._id, progressId: progressSkill2[1]._id, contentType: 'quiz', score: 100, isCompleted: true, bonusEarned: 20 },
      // User 1 Ä‘ang há»c Skill 2 (hoÃ n thÃ nh 1 progress)
      { userId: users[0]._id, progressId: progressSkill2[0]._id, contentType: 'video', score: 0, isCompleted: true, bonusEarned: 0 }
    ];

    await UserActivity.insertMany(userActivities);
    console.log('âœ… User Activities Ä‘Ã£ táº¡o:', userActivities.length);

    // ========== 18. Cáº¬P NHáº¬T ÄIá»‚M REWARD ==========
    await Reward.findOneAndUpdate(
      { userId: users[0]._id },
      { totalPoints: 20 }
    );
    console.log('âœ… Rewards Ä‘Ã£ cáº­p nháº­t');

    console.log('\n' + '='.repeat(60));
    console.log('âœ… SEED DATABASE HOÃ€N Táº¤T!');
    console.log('='.repeat(60));
    console.log('\nðŸ“Š Dá»¯ liá»‡u Ä‘Ã£ táº¡o:');
    console.log(`  â€¢ Classes: 1`);
    console.log(`  â€¢ Chapters: 3`);
    console.log(`  â€¢ Users: 2`);
    console.log(`  â€¢ Skills: 6 (2 per chapter)`);
    console.log(`  â€¢ Videos: 4`);
    console.log(`  â€¢ Quizzes: 2`);
    console.log(`  â€¢ Questions: 15 (5 + 10)`);
    console.log(`  â€¢ Progress steps: 6`);
    console.log(`  â€¢ User activities: 3`);
    console.log('\nðŸ” ThÃ´ng tin Ä‘Äƒng nháº­p:');
    console.log(`  User 1: student1 / user123`);
    console.log(`  User 2: student2 / user456`);
    console.log('\nðŸ“ Test API /chapters/:chapterId/map vá»›i Chapter ID:');
    console.log(`  Chapter 1: ${chapters[0]._id}`);
    console.log(`  Chapter 2: ${chapters[1]._id}`);
    console.log(`  Chapter 3: ${chapters[2]._id}`);

    process.exit(0);
  } catch (error) {
    console.error('âŒ Lá»—i seed database:', error);
    process.exit(1);
  }
};

// Cháº¡y
connectDB().then(() => seedDatabase());
