import express from 'express';
import {
  getVideosController,
  createVideoController,
  updateVideoController,
  deleteVideoController
} from '../controllers/videoController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /videos:
 *   get:
 *     summary: Lấy danh sách videos
 *     tags: [Videos]
 *     responses:
 *       200:
 *         description: Danh sách videos
 */
router.get('/', getVideosController);

/**
 * @swagger
 * /videos:
 *   post:
 *     summary: Tạo video mới
 *     tags: [Videos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               url:
 *                 type: string
 *               duration:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Video được tạo thành công
 */
router.post('/', createVideoController);

/**
 * @swagger
 * /videos/{videoId}:
 *   patch:
 *     summary: Cập nhật video
 *     tags: [Videos]
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.patch('/:videoId', updateVideoController);

/**
 * @swagger
 * /videos/{videoId}:
 *   delete:
 *     summary: Xóa video
 *     tags: [Videos]
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
