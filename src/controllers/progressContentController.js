import Progress from '../models/progress.schema.js';
import Video from '../models/video.schema.js';
import VideoWatch from '../models/videoWatch.schema.js';
// only need Video for this endpoint

export const getContentByProgressId = async (req, res, next) => {
  try {
    const { id } = req.params; // progressId
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 10;
    const skip = (page - 1) * perPage;

    const progress = await Progress.findById(id);
    if (!progress) return res.status(404).json({ message: 'Progress không tìm thấy' });

    if (progress.contentType === 'video') {
      // For video content, return a paginated list of videos associated with this progress
      const [docs, total] = await Promise.all([
        Video.find({ progressId: progress._id }).skip(skip).limit(perPage),
        Video.countDocuments({ progressId: progress._id })
      ]);
      if (!docs || docs.length === 0) return res.status(404).json({ message: 'Video không tìm thấy cho progress này' });
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      // Enrich each video with isWatched and watchedAt for the requesting user (if authenticated)
      const userId = req.user && (req.user.id || req.user._id);
      let result = docs.map(doc => doc.toObject());
      if (userId) {
        const videoIds = result.map(r => r._id);
        const watches = await VideoWatch.find({ userId, videoId: { $in: videoIds } });
        const watchMap = new Map(watches.map(w => [w.videoId.toString(), w]));
        result = result.map(r => {
          const w = watchMap.get(r._id.toString());
          return Object.assign(r, { isWatched: !!w, watchedAt: w ? w.watchedAt : null });
        });
      } else {
        result = result.map(r => Object.assign(r, { isWatched: false, watchedAt: null }));
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
