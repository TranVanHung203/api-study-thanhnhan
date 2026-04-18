import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import 'dotenv/config';

import ClassModel from './src/models/class.schema.js';
import Chapter from './src/models/chapter.schema.js';
import User from './src/models/user.schema.js';
import Lesson from './src/models/lesson.schema.js';
import Progress from './src/models/progress.schema.js';
import Video from './src/models/video.schema.js';
import Quiz from './src/models/quiz.schema.js';
import Question from './src/models/question.schema.js';
import Reward from './src/models/reward.schema.js';
import UserActivity from './src/models/userActivity.schema.js';
import RefreshToken from './src/models/refreshToken.schema.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/online_learning';

const connect = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Kết nối MongoDB thành công');
  } catch (error) {
    console.error('❌ Lỗi kết nối MongoDB:', error);
    process.exit(1);
  }
};

const clearAll = async () => {
  console.log('🗑️  Xóa dữ liệu cũ...');
  await Promise.all([
    ClassModel.deleteMany({}),
    Chapter.deleteMany({}),
    User.deleteMany({}),
    Lesson.deleteMany({}),
    Progress.deleteMany({}),
    Video.deleteMany({}),
    Quiz.deleteMany({}),
    Question.deleteMany({}),
    Reward.deleteMany({}),
    UserActivity.deleteMany({}),
    RefreshToken.deleteMany({})
  ]);
};

const seed = async () => {
  try {
    // Create class
    const classDoc = await ClassModel.create({ className: 'Lớp mẫu 1', description: 'Lớp demo' });

    // Chapters
    const chapters = await Chapter.insertMany([
      { classId: classDoc._id, chapterName: 'Chương 1', description: 'Cơ bản', order: 1 },
      { classId: classDoc._id, chapterName: 'Chương 2', description: 'Nâng cao', order: 2 }
    ]);

    // Users
    const pass = await bcrypt.hash('password123', 10);
    const u1 = await User.create({ username: 'student1', email: 'student1@example.com', fullName: 'Học sinh A', passwordHash: pass, classId: classDoc._id });
    const u2 = await User.create({ username: 'student2', email: 'student2@example.com', fullName: 'Học sinh B', passwordHash: pass, classId: classDoc._id });

    // Rewards
    await Reward.create({ userId: u1._id, totalPoints: 0 });
    await Reward.create({ userId: u2._id, totalPoints: 0 });

    // Lessons
    const lessonsChapter1 = await Lesson.insertMany([
      { chapterId: chapters[0]._id, lessonName: 'Bài học 1', description: 'Mô tả 1', order: 1 },
      { chapterId: chapters[0]._id, lessonName: 'Bài học 2', description: 'Mô tả 2', order: 2 }
    ]);
    const lessonsChapter2 = await Lesson.insertMany([
      { chapterId: chapters[1]._id, lessonName: 'Bài học 3', description: 'Mô tả 3', order: 1 },
      { chapterId: chapters[1]._id, lessonName: 'Bài học 4', description: 'Mô tả 4', order: 2 }
    ]);

    // Videos, Quizzes
    const videos = await Video.insertMany([
      { title: 'Video A', url: 'https://example.com/a', description: 'Video A' },
      { title: 'Video B', url: 'https://example.com/b', description: 'Video B' },
      { title: 'Video C', url: 'https://example.com/c', description: 'Video C' },
      { title: 'Video D', url: 'https://example.com/d', description: 'Video D' }
    ]);

    const quizzes = await Quiz.insertMany([
      { title: 'Quiz A', description: 'Quiz A', totalQuestions: 3, bonusPoints: 15 },
      { title: 'Quiz B', description: 'Quiz B', totalQuestions: 5, bonusPoints: 25 }
    ]);

    // Insert many questions for quizzes using new schema
    const sampleQuestions = [];
    const choiceTexts = [
      ['Red', 'Blue', 'Green', 'Yellow'],
      ['Cat', 'Dog', 'Bird', 'Fish'],
      ['Apple', 'Banana', 'Cherry', 'Date'],
      ['One', 'Two', 'Three', 'Four']
    ];

    // helper to return a placeholder image URL
    const placeholderImage = (id) => `https://placehold.co/80x80?text=img${id}`;

    for (let q = 0; q < 60; q++) {
      const quizIdx = q % quizzes.length;
      const base = choiceTexts[q % choiceTexts.length];

      // variable number of choices: 2..4
      const choiceCount = 2 + (q % 3); // yields 2,3,4 repeating
      const choicesArray = [];

      // Choose a mode for this question: either all text choices or all image choices
      const mode = (q % 2 === 0) ? 'text' : 'image';
      if (mode === 'text') {
        for (let i = 0; i < choiceCount; i++) {
          choicesArray.push({ text: base[i % base.length] + (i > 0 ? ` ${i}` : '') });
        }
      } else {
        for (let i = 0; i < choiceCount; i++) {
          // store image URL as text
          choicesArray.push({ text: placeholderImage(q * 10 + i) });
        }
      }

      const correctIndex = q % choiceCount; // pick one valid index

      sampleQuestions.push({
        quizId: quizzes[quizIdx]._id,
        questionText: `Sample question ${q+1} for ${quizzes[quizIdx].title}`,
        imageQuestion: (q % 7 === 0) ? placeholderImage(q) : null,
        choices: choicesArray,
        answer: correctIndex,
        order: q + 1
      });
    }

    await Question.insertMany(sampleQuestions);

    // Create progresses and link content.progressId
    const p1 = await Progress.create({ lessonId: lessonsChapter1[0]._id, stepNumber: 1, contentType: 'video' });
    await Video.findByIdAndUpdate(videos[0]._id, { progressId: p1._id });

    const p3 = await Progress.create({ lessonId: lessonsChapter1[1]._id, stepNumber: 1, contentType: 'video' });
    await Video.findByIdAndUpdate(videos[1]._id, { progressId: p3._id });
    const p5 = await Progress.create({ lessonId: lessonsChapter1[1]._id, stepNumber: 2, contentType: 'quiz' });
    await Quiz.findByIdAndUpdate(quizzes[0]._id, { progressId: p5._id });

    const p6 = await Progress.create({ lessonId: lessonsChapter2[0]._id, stepNumber: 1, contentType: 'video' });
    await Video.findByIdAndUpdate(videos[2]._id, { progressId: p6._id });

    const p8 = await Progress.create({ lessonId: lessonsChapter2[1]._id, stepNumber: 1, contentType: 'video' });
    await Video.findByIdAndUpdate(videos[3]._id, { progressId: p8._id });
    const p10 = await Progress.create({ lessonId: lessonsChapter2[1]._id, stepNumber: 2, contentType: 'quiz' });
    await Quiz.findByIdAndUpdate(quizzes[1]._id, { progressId: p10._id });

    // Sample user activities
    await UserActivity.create({ userId: u1._id, progressId: p1._id, contentType: 'video', score: 0, isCompleted: true, bonusEarned: 0 });
    await UserActivity.create({ userId: u1._id, progressId: p5._id, contentType: 'quiz', score: 100, isCompleted: true, bonusEarned: 15 });

    console.log('✅ Thêm dữ liệu mẫu thành công');
  } catch (err) {
    console.error('❌ Lỗi khi thêm dữ liệu mẫu:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Ngắt kết nối DB');
  }
};

connect().then(async () => {
  await clearAll();
  await seed();
});
