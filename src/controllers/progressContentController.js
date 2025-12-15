import Progress from '../models/progress.schema.js';
import Video from '../models/video.schema.js';
import Exercise from '../models/exercise.schema.js';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';

export const getContentByProgressId = async (req, res) => {
  try {
    const { id } = req.params; // progressId
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 10;
    const skip = (page - 1) * perPage;

    const progress = await Progress.findById(id);
    if (!progress) return res.status(404).json({ message: 'Progress không tìm thấy' });

    if (progress.contentType === 'video') {
      // For video content, return the single video associated with this progress
      const doc = await Video.findOne({ progressId: progress._id });
      if (!doc) return res.status(404).json({ message: 'Video không tìm thấy cho progress này' });
      return res.status(200).json({ content: doc });
    } else if (progress.contentType === 'exercise') {
      const [docs, total] = await Promise.all([
        Exercise.find({ progressId: progress._id }).skip(skip).limit(perPage),
        Exercise.countDocuments({ progressId: progress._id })
      ]);
      if (!docs || docs.length === 0) return res.status(404).json({ message: 'Exercise không tìm thấy cho progress này' });
      // Remove answer field from all
      const result = docs.map(doc => {
        const obj = doc.toObject();
        delete obj.answer;
        return obj;
      });
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      return res.status(200).json({ page, perPage, total, totalPages, content: result });
    } else if (progress.contentType === 'quiz') {
      const quizzes = await Quiz.find({ progressId: progress._id });
      if (!quizzes || quizzes.length === 0) return res.status(404).json({ message: 'Quiz không tìm thấy cho progress này' });

      // If client provides quizId, use that; otherwise pick one random quiz
      const { quizId } = req.query;
      let selectedQuiz;
      if (quizId) {
        selectedQuiz = quizzes.find(q => q._id.toString() === quizId.toString());
        if (!selectedQuiz) return res.status(404).json({ message: 'QuizId không hợp lệ cho progress này' });
      } else {
        selectedQuiz = quizzes[Math.floor(Math.random() * quizzes.length)];
      }

      // Count total questions for selected quiz
      const total = await Question.countDocuments({ quizId: selectedQuiz._id });
      if (total === 0) return res.status(404).json({ message: 'Không có câu hỏi cho quiz được chọn' });

      // Fetch paginated questions for the selected quiz
      const questions = await Question.find({ quizId: selectedQuiz._id })
        .sort({ order: 1 })
        .skip(skip)
        .limit(perPage);

      const questionsNoAnswer = questions.map(q => {
        const obj = q.toObject();
        if ('answer' in obj) delete obj.answer;
        if ('correctAnswer' in obj) delete obj.correctAnswer;
        return obj;
      });

      const totalPages = Math.max(1, Math.ceil(total / perPage));
      return res.status(200).json({ page, perPage, total, totalPages, quiz: selectedQuiz.toObject(), questions: questionsNoAnswer });
    }

    return res.status(400).json({ message: 'contentType không hợp lệ' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export default { getContentByProgressId };
