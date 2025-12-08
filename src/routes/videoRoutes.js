import express from 'express';
import {
  getVideosController,
  createVideoController,
  updateVideoController,
  deleteVideoController
} from '../controllers/videoController.js';
import { authToken } from '../middlewares/authMiddleware.js';
import { uploadVideo } from '../middlewares/uploadMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /videos:
 *   get:
 *     summary: Lấy danh sách videos
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách videos
 */
router.get('/', getVideosController);

/**
 * @swagger
 * /videos:
 *   post:
 *     summary: Upload video mới lên Cloudinary
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - video
 *               - title
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *                 description: File video (mp4, mov, avi, webm, mkv) - max 100MB
 *               title:
 *                 type: string
 *                 example: "Bài học 1"
 *               description:
 *                 type: string
 *                 example: "Mô tả video"
 *     responses:
 *       201:
 *         description: Upload video thành công
 */
router.post('/', uploadVideo.single('video'), createVideoController);

/**
 * @swagger
 * /videos/{videoId}:
 *   patch:
 *     summary: Cập nhật video (có thể upload video mới)
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *                 description: File video mới (tùy chọn)
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.patch('/:videoId', uploadVideo.single('video'), updateVideoController);

/**
 * @swagger
 * /videos/{videoId}:
 *   delete:
 *     summary: Xóa video (cả trên Cloudinary)
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa thành công
 */
router.delete('/:videoId', deleteVideoController);

export default router;
