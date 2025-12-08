import Video from '../models/video.schema.js';
import cloudinary from '../config/cloudinaryConfig.js';

// Lấy danh sách videos
export const getVideosController = async (req, res) => {
  try {
    const videos = await Video.find();
    return res.status(200).json({ videos });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Upload video lên Cloudinary và tạo record
export const createVideoController = async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng upload file video' });
    }

    // Upload video lên Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'learning_videos',
          allowed_formats: ['mp4', 'mov', 'avi', 'webm', 'mkv']
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    const video = new Video({
      title,
      url: uploadResult.secure_url,
      duration: Math.round(uploadResult.duration || 0),
      description,
      cloudinaryPublicId: uploadResult.public_id
    });

    await video.save();

    return res.status(201).json({
      message: 'Upload video thành công',
      video
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Cập nhật video (có thể upload video mới)
export const updateVideoController = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { title, description } = req.body;

    const existingVideo = await Video.findById(videoId);
    if (!existingVideo) {
      return res.status(404).json({ message: 'Video không tồn tại' });
    }

    let updateData = { title, description };

    // Nếu có file mới, upload lên Cloudinary
    if (req.file) {
      // Xóa video cũ trên Cloudinary
      if (existingVideo.cloudinaryPublicId) {
        await cloudinary.uploader.destroy(existingVideo.cloudinaryPublicId, { resource_type: 'video' });
      }

      // Upload video mới
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'video',
            folder: 'learning_videos',
            allowed_formats: ['mp4', 'mov', 'avi', 'webm', 'mkv']
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });

      updateData.url = uploadResult.secure_url;
      updateData.duration = Math.round(uploadResult.duration || 0);
      updateData.cloudinaryPublicId = uploadResult.public_id;
    }

    const video = await Video.findByIdAndUpdate(videoId, updateData, { new: true });

    return res.status(200).json({
      message: 'Cập nhật video thành công',
      video
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xóa video (cả trên Cloudinary)
export const deleteVideoController = async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: 'Video không tồn tại' });
    }

    // Xóa video trên Cloudinary
    if (video.cloudinaryPublicId) {
      await cloudinary.uploader.destroy(video.cloudinaryPublicId, { resource_type: 'video' });
    }

    await Video.findByIdAndDelete(videoId);

    return res.status(200).json({
      message: 'Xóa video thành công'
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
