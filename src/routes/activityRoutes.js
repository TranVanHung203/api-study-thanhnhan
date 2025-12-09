import express from 'express';
import {
  recordUserActivityController,
  getUserActivityHistoryController,
  getSkillProgressController,
  getClassProgressController
} from '../controllers/userActivityController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /activities:
 *   post:
 *     summary: Ghi nhận hoạt động của user (video, exercise, quiz)
 *     description: contentType được tự động lấy từ progress, không cần truyền
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - progressId
 *               - isCompleted
 *             properties:
 *               progressId:
 *                 type: string
 *                 description: ID của progress step
 *               score:
 *                 type: number
 *                 description: Điểm số (cho exercise/quiz)
 *                 example: 85
 *               isCompleted:
 *                 type: boolean
 *                 description: Đã hoàn thành hay chưa
 *                 example: true
 *     responses:
 *       201:
 *         description: Ghi nhận thành công
 *       400:
 *         description: Cần hoàn thành step trước hoặc đã hoàn thành rồi
 */
router.post('/', recordUserActivityController);

/**
 * @swagger
 * /activities/history:
 *   get:
 *     summary: Lấy lịch sử hoạt động của user
 *     tags: [Activities]
 *     responses:
 *       200:
 *         description: Lịch sử hoạt động
 */
router.get('/history', getUserActivityHistoryController);

/**
 * @swagger
 * /activities/skill/{skillId}/progress:
 *   get:
 *     summary: Lấy tiến độ hoàn thành của một kỹ năng
 *     tags: [Activities]
 *     parameters:
 *       - in: path
 *         name: skillId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tiến độ hoàn thành
 */
router.get('/skill/:skillId/progress', getSkillProgressController);

/**
 * @swagger
 * /activities/class/{classId}/progress:
 *   get:
 *     summary: Lấy tiến độ hoàn thành của cả lớp
 *     tags: [Activities]
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tiến độ lớp
 */
router.get('/class/:classId/progress', getClassProgressController);

export default router;
