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
 *     tags: [Activities]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               progressId:
 *                 type: string
 *               contentType:
 *                 type: string
 *                 enum: [video, exercise, quiz]
 *               score:
 *                 type: number
 *               isCompleted:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Ghi nhận thành công
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
