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
 *             properties:
 *               progressId:
 *                 type: string
 *                 description: ID của progress step
 *                 example: "657a1b2c3d4e5f6a7b8c9d0e"
 *               isCompleted:
 *                 type: boolean
 *                 description: Đã hoàn thành hay chưa (bắt buộc cho VIDEO/QUIZ, không cần cho EXERCISE)
 *                 example: true
 *               userAnswer:
 *                 type: array
 *                 description: Đáp án của user (bắt buộc cho EXERCISE)
 *                 items:
 *                   type: string
 *                 example: ["apple1", "apple2", "apple3"]
 *               score:
 *                 type: number
 *                 description: Điểm số (bắt buộc cho QUIZ, tuỳ chọn cho EXERCISE)
 *                 example: 85
 *           examples:
 *             video:
 *               summary: Ghi nhận VIDEO
 *               value:
 *                 progressId: "657a1b2c3d4e5f6a7b8c9d0e"
 *                 isCompleted: true
 *             exercise:
 *               summary: Ghi nhận EXERCISE dạng đếm kéo thả
 *               value:
 *                 progressId: "657a1b2c3d4e5f6a7b8c9d0e"
 *                 userAnswer: ["apple1", "apple2", "apple3"]
 *             quiz:
 *               summary: Ghi nhận QUIZ
 *               value:
 *                 progressId: "657a1b2c3d4e5f6a7b8c9d0e"
 *                 score: 80
 *                 isCompleted: true
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
