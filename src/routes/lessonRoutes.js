import express from 'express';
import {
  getLessonsByChapterController,
  createLessonController,
  updateLessonController,
  deleteLessonController
} from '../controllers/lessonController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /lessons/chapter/{chapterId}:
 *   get:
 *     summary: Lấy danh sách bài học của một chapter
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Danh sách bài học
 *       401:
 *         description: Không có token hoặc token không hợp lệ
 */
router.get('/chapter/:chapterId', getLessonsByChapterController);

/**
 * @swagger
 * /lessons:
 *   post:
 *     summary: Tạo bài học mới
 *     tags: [Lessons]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chapterId
 *               - lessonName
 *             properties:
 *               chapterId:
 *                 type: string
 *               lessonName:
 *                 type: string
 *               description:
 *                 type: string
 *               order:
 *                 type: number
 *                 description: Nếu không truyền sẽ tự động lấy order cao nhất + 1
 *     responses:
 *       201:
 *         description: Bài học được tạo thành công
 */
router.post('/', createLessonController);

/**
 * @swagger
 * /lessons/{lessonId}:
 *   patch:
 *     summary: Cập nhật bài học
 *     tags: [Lessons]
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.patch('/:lessonId', updateLessonController);

/**
 * @swagger
 * /lessons/{lessonId}:
 *   delete:
 *     summary: Xóa bài học
 *     tags: [Lessons]
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa thành công
 */
router.delete('/:lessonId', deleteLessonController);

export default router;
