import Video from '../models/video.schema.js';

// Lấy danh sách videos
export const getVideosController = async (req, res) => {
  try {
    const videos = await Video.find();
    return res.status(200).json({ videos });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Tạo video
export const createVideoController = async (req, res) => {
  try {
    const { title, url, duration, description } = req.body;

    const video = new Video({
      title,
      url,
      duration,
      description
    });

    await video.save();

    return res.status(201).json({
      message: 'Tạo video thành công',
      video
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Cập nhật video
export const updateVideoController = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { title, url, duration, description } = req.body;

    const video = await Video.findByIdAndUpdate(
      videoId,
      { title, url, duration, description },
      { new: true }
    );

    return res.status(200).json({
      message: 'Cập nhật video thành công',
      video
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xóa video
export const deleteVideoController = async (req, res) => {
  try {
    const { videoId } = req.params;
    await Video.findByIdAndDelete(videoId);

    return res.status(200).json({
      message: 'Xóa video thành công'
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
