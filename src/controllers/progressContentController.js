import Progress from '../models/progress.schema.js';
import Video from '../models/video.schema.js';
import Quiz from '../models/quiz.schema.js';
import VideoWatch from '../models/videoWatch.schema.js';
import QuizAttempt from '../models/quizAttempt.schema.js';
import Lesson from '../models/lesson.schema.js';
import UserActivity from '../models/userActivity.schema.js';
// only need Video for this endpoint

export const getContentByProgressId = async (req, res, next) => {
  try {
    const { id } = req.params; // progressId
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 10;
    const skip = (page - 1) * perPage;

    const progress = await Progress.findById(id);
    if (!progress) return res.status(404).json({ message: 'Progress không tìm thấy' });

    // Return combined list of videos and quizzes for this progress
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

      // Compute whether THIS progress is locked for the current user
      let isLocked = false;

      if (userId) {
        try {
          const currentLesson = await Lesson.findById(progress.LessonId);
          if (currentLesson) {

            /* =========================
              1️⃣ KIỂM TRA HỌC VƯỢT
            ========================== */
            let unlockedByLater = false;

            const laterProgresses = await Progress.find({
              LessonId: currentLesson._id,
              stepNumber: { $gt: progress.stepNumber }
            }).select('_id');

            if (laterProgresses.length > 0) {
              const laterActivity = await UserActivity.findOne({
                userId,
                progressId: { $in: laterProgresses.map(p => p._id) }
              });

              if (laterActivity) {
                unlockedByLater = true;
                isLocked = false; // 🔓 học vượt → mở luôn
              }
            }

            /* =========================
              2️⃣ CHỈ CHECK KHÓA
              KHI KHÔNG HỌC VƯỢT
            ========================== */
            if (!unlockedByLater) {

              // 2.1️⃣ Check only the immediate previous progress in the same Lesson
              const immediatePrev = await Progress.findOne({
                LessonId: currentLesson._id,
                stepNumber: progress.stepNumber - 1
              }).select('_id');

              if (immediatePrev) {
                const immediateCompleted = await UserActivity.exists({
                  userId,
                  progressId: immediatePrev._id,
                  isCompleted: true
                });

                if (!immediateCompleted) {
                  isLocked = true; // 🔒 immediate previous progress not completed
                }
              }

              // 2.2️⃣ Check Lesson trước (nếu chưa bị khóa)
              if (!isLocked && currentLesson.order > 1) {
                const previousLesson = await Lesson.findOne({
                  chapterId: currentLesson.chapterId,
                  order: currentLesson.order - 1
                });

                if (previousLesson) {
                  // Find the final progress in the previous Lesson (highest stepNumber)
                  const lastPrevProgress = await Progress.findOne({
                    LessonId: previousLesson._id
                  }).sort({ stepNumber: -1 }).select('_id');

                  if (lastPrevProgress) {
                    const lastCompleted = await UserActivity.exists({
                      userId,
                      progressId: lastPrevProgress._id,
                      isCompleted: true
                    });

                    if (!lastCompleted) {
                      isLocked = true; // 🔒 chưa hoàn thành progress cuối của Lesson trước
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          // Fail-safe: có lỗi thì KHÔNG khóa
          isLocked = false;
        }
      } else {
        // Không có user → không khóa
        isLocked = false;
      }


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
            return Object.assign(r, { isCompleted: !!w, isLocked });
          }
          if (r.type === 'quiz') {
            return Object.assign(r, { isCompleted: !!hasAnyAttempt, isLocked });
          }
          return Object.assign(r, { isLocked });
        });
      } else {
        result = result.map(r => Object.assign(r, { isCompleted: false, isLocked }));
      }

      return res.status(200).json({ page, perPage, total, totalPages, progressName: progress.progressName || null, content: result });
  } catch (error) {
    next(error);
  }
};

export default { getContentByProgressId };
