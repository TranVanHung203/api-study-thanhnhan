import Progress from '../models/progress.schema.js';
import Video from '../models/video.schema.js';
import Exercise from '../models/exercise.schema.js';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';

export const getContentByProgressId = async (req, res) => {
  try {
    const { id } = req.params; // progressId
    const progress = await Progress.findById(id);
    if (!progress) return res.status(404).json({ message: 'Progress không tìm thấy' });


    if (progress.contentType === 'video') {
      const docs = await Video.find({ progressId: progress._id });
      if (!docs || docs.length === 0) return res.status(404).json({ message: 'Video không tìm thấy cho progress này' });
      return res.status(200).json({ content: docs });
    } else if (progress.contentType === 'exercise') {
      const docs = await Exercise.find({ progressId: progress._id });
      if (!docs || docs.length === 0) return res.status(404).json({ message: 'Exercise không tìm thấy cho progress này' });
      // Remove answer field from all
      const result = docs.map(doc => {
        const obj = doc.toObject();
        delete obj.answer;
        return obj;
      });
      return res.status(200).json({ content: result });
    } else if (progress.contentType === 'quiz') {
      const quizzes = await Quiz.find({ progressId: progress._id });
      if (!quizzes || quizzes.length === 0) return res.status(404).json({ message: 'Quiz không tìm thấy cho progress này' });
      // For each quiz, fetch questions by quizId, remove answer
      const result = [];
      for (const quiz of quizzes) {
        const questions = await Question.find({ quizId: quiz._id });
        const questionsNoAnswer = questions.map(q => {
          const obj = q.toObject();
          // Remove any fields that reveal the correct answer
          if ('answer' in obj) delete obj.answer;
          if ('correctAnswer' in obj) delete obj.correctAnswer;
          return obj;
        });
        const quizObj = quiz.toObject();
        quizObj.questions = questionsNoAnswer;
        result.push(quizObj);
      }
      return res.status(200).json({ content: result });
    }

    return res.status(400).json({ message: 'contentType không hợp lệ' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export default { getContentByProgressId };
