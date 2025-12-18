import Progress from '../models/progress.schema.js';
import Video from '../models/video.schema.js';
import Quiz from '../models/quiz.schema.js';
import VideoWatch from '../models/videoWatch.schema.js';
import QuizAttempt from '../models/quizAttempt.schema.js';
// only need Video for this endpoint

export const getContentByProgressId = async (req, res, next) => {
  try {
    const { id } = req.params; // progressId
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 10;
    const skip = (page - 1) * perPage;

    const progress = await Progress.findById(id);
    if (!progress) return res.status(404).json({ message: 'Progress không tìm thấy' });

    // Support content types 'video' and 'quiz' and return a combined paginated list
    if (progress.contentType === 'video' || progress.contentType === 'quiz') {
      // Fetch all related videos and quizzes for this progress
      const [videos, quizzes] = await Promise.all([
        Video.find({ progressId: progress._id }).sort({ createdAt: 1 }),
        Quiz.find({ progressId: progress._id }).sort({ createdAt: 1 })
      ]);

      if ((videos.length + quizzes.length) === 0) return res.status(404).json({ message: 'No content found for this progress' });

      // Build unified items
      const items = [];
      for (const v of videos) {
        items.push({
          _id: v._id,
          type: 'video',
          title: v.title,
          description: v.description || null,
          voiceDescription: v.voiceDescription || null,
          url: v.url || null,
          totalQuestion: null,
          progressId: v.progressId
        });
      }
      for (const q of quizzes) {
        items.push({
          _id: q._id,
          type: 'quiz',
          title: q.title,
          description: q.description || null,
          voiceDescription: q.voiceDescription || null,
          url: null,
          totalQuestion: q.totalQuestions || null,
          progressId: q.progressId
        });
      }

      // Sort combined by createdAt to have deterministic order
      items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / perPage));

      // Paginate in-memory
      const start = (page - 1) * perPage;
      const pageItems = items.slice(start, start + perPage);

      // Determine isCompleted for each item for this user
      const userId = req.user && (req.user.id || req.user._id);
      let result = pageItems.map(i => ({ ...i }));

      if (userId) {
        const videoIds = result.filter(r => r.type === 'video').map(r => r._id);
        const quizIds = result.filter(r => r.type === 'quiz').map(r => r._id);


        const [watches, attempts] = await Promise.all([
          VideoWatch.find({ userId, videoId: { $in: videoIds } }),
          QuizAttempt.find({ userId, progressId: progress._id }).sort({ createdAt: -1 })
        ]);

        const watchMap = new Map(watches.map(w => [w.videoId.toString(), w]));
        const hasAnyAttempt = attempts && attempts.length > 0;

        result = result.map(r => {
          if (r.type === 'video') {
            const w = watchMap.get(r._id.toString());
            return Object.assign(r, { isCompleted: !!w });
          }
          if (r.type === 'quiz') {
            return Object.assign(r, { isCompleted: !!hasAnyAttempt });
          }
          return r;
        });
      } else {
        result = result.map(r => Object.assign(r, { isCompleted: false }));
      }

      return res.status(200).json({ page, perPage, total, totalPages, content: result });
    }

    // For any other contentType, return 400
    return res.status(400).json({ message: 'contentType không hợp lệ' });
  } catch (error) {
    next(error);
  }
};

export default { getContentByProgressId };
