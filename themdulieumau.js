import mongoose from 'mongoose';
import DatabaseConfig from './src/config/databaseConfig.js';
import Course from './src/models/course.schema.js';
import Lecturer from './src/models/lecturer.schema.js';
import Lesson from './src/models/lesson.schema.js';
import Module from './src/models/module.schema.js';
import Quiz from './src/models/quiz.schema.js';
import QuizAnswer from './src/models/quizAnswer.schema.js';
import QuizQuestion from './src/models/quizQuestion.schema.js';
import Student from './src/models/student.schema.js';
import StudentQuizAnswer from './src/models/studentQuizAnswer.schema.js';
import User from './src/models/user.schema.js';

const seedData = async () => {
  try {
    const dbConfig = new DatabaseConfig();
    await dbConfig.connect();

    // Xóa dữ liệu cũ
    await Course.deleteMany({});
    await Lecturer.deleteMany({});
    await Lesson.deleteMany({});
    await Module.deleteMany({});
    await Quiz.deleteMany({});
    await QuizAnswer.deleteMany({});
    await QuizQuestion.deleteMany({});
    await Student.deleteMany({});
    await StudentQuizAnswer.deleteMany({});
    await User.deleteMany({});

    // Thêm dữ liệu User
    const lecturerUser = new User({ name: 'Giảng viên A', email: 'lecturer@example.com', password: 'password', role: 'lecturer', is_admin: false });
    const studentUser1 = new User({ name: 'Sinh viên B', email: 'student@example.com', password: 'password', role: 'student', is_admin: false });
    const studentUser2 = new User({ name: 'Sinh viên C', email: 'student1@example.com', password: 'password1', role: 'student', is_admin: false });

    await lecturerUser.save();
    await studentUser1.save();
    await studentUser2.save();

    // Thêm dữ liệu Lecturer và Student với tham chiếu tới User
    const lecturer = new Lecturer({ user: lecturerUser._id, courses: [] });
    const student1 = new Student({ user: studentUser1._id, courses: [] });
    const student2 = new Student({ user: studentUser2._id, courses: [] });

    await lecturer.save();
    await student1.save();
    await student2.save();

    // Thêm dữ liệu Course và liên kết với Lecturer và Students
    const courses = [
      { name: 'Khóa học JavaScript', description: 'Học cơ bản về JavaScript' },
      { name: 'Khóa học Python', description: 'Học cơ bản về Python' }
    ];

    for (const courseData of courses) {
      const course = new Course({
        name: courseData.name,
        description: courseData.description,
        modules: [], // Dùng modules thay vì lessons
        quiz: []
      });
      lecturer.courses.push(course._id); // Thêm khóa học vào giảng viên
      student1.courses.push(course._id); // Thêm khóa học vào sinh viên 1
      student2.courses.push(course._id); // Thêm khóa học vào sinh viên 2

      await course.save();
    }

    await lecturer.save();
    await student1.save();
    await student2.save();

    // Thêm dữ liệu Module và liên kết với Course
    const firstCourse = await Course.findOne({ name: 'Khóa học JavaScript' });
    const module = new Module({
      name: 'Module 1',
      number: 1,
      lessons: [] // Danh sách các bài học cho module này
    });

    // Thêm dữ liệu Lesson và liên kết với Module
    const lesson = new Lesson({
      name: 'Bài học JavaScript cơ bản',
      number: 1,
      document_url: '/path/to/document.pdf',
      lesson_details: 'Chi tiết bài học JavaScript',
      course_order: 1,
      type: 'PDF'
    });

    module.lessons.push(lesson._id); // Thêm bài học vào module
    await lesson.save();
    await module.save();

    firstCourse.modules.push(module._id); // Thêm module vào khóa học
    await firstCourse.save();

    // Thêm dữ liệu Quiz cho khóa học đầu tiên
    const quiz = new Quiz({
      name: 'Quiz về JavaScript',
      number: 1,
      course_order: 1,
      min_pass_score: 5,
      is_pass_required: true,
      start_deadline: new Date(),
      end_deadline: new Date(new Date().getTime() + 604800000), // Một tuần sau ngày bắt đầu
      quiz_questions: [],
      students: [student1._id, student2._id], // Thêm sinh viên vào quiz
      score_achieved: [8, 6], // Điểm cho mỗi sinh viên tương ứng
      attempt_datetime: [new Date(), new Date()] // Thời gian làm bài của mỗi sinh viên
    });

    firstCourse.quiz.push(quiz._id); // Thêm quiz vào khóa học đầu tiên
    await quiz.save();
    await firstCourse.save();

    // Thêm dữ liệu QuizQuestion và liên kết với Quiz
    const quizQuestion = new QuizQuestion({
      question_title: 'JavaScript là gì?',
      quiz_answers: []
    });
    quiz.quiz_questions.push(quizQuestion._id);
    await quizQuestion.save();
    await quiz.save();

    // Thêm dữ liệu QuizAnswer và liên kết với QuizQuestion
    const quizAnswer1 = new QuizAnswer({
      answer_text: 'Ngôn ngữ lập trình',
      is_correct: true
    });
    const quizAnswer2 = new QuizAnswer({
      answer_text: 'Ngôn ngữ máy',
      is_correct: false
    });
    await quizAnswer1.save();
    await quizAnswer2.save();

    // Cập nhật QuizQuestion với câu trả lời
    quizQuestion.quiz_answers.push(quizAnswer1._id, quizAnswer2._id);
    await quizQuestion.save();

    // Thêm dữ liệu StudentQuizAnswer cho mỗi sinh viên
    const studentQuizAnswer1 = new StudentQuizAnswer({
      student: student1._id,
      quiz: quiz._id,
      question: quizQuestion._id,
      answer: quizAnswer1._id,
      is_correct: quizAnswer1.is_correct
    });
    const studentQuizAnswer2 = new StudentQuizAnswer({
      student: student2._id,
      quiz: quiz._id,
      question: quizQuestion._id,
      answer: quizAnswer2._id,
      is_correct: quizAnswer2.is_correct
    });

    await studentQuizAnswer1.save();
    await studentQuizAnswer2.save();

    console.log('Dữ liệu đã được chèn thành công!');
    process.exit();
  } catch (error) {
    console.error('Lỗi khi chèn dữ liệu:', error);
    process.exit(1);
  }
};

seedData();
