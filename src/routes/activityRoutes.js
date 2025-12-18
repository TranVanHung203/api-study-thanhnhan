import express from 'express';
import {
  recordUserActivityController,
  getUserActivityHistoryController,
  getProgressActivityHistoryController,
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
 *     summary: Ghi nhận hoạt động của user (video completion)
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               progressId:
 *                 type: string
 *                 description: ID của progress
 *               videoId:
 *                 type: string
 *                 description: ID của video để đánh dấu đã xem (bắt buộc khi contentType === video)
 *               isCompleted:
 *                 type: boolean
 *                 description: Gửi true để ghi nhận đã xem
 *             required:
 *               - progressId
 *               - isCompleted
 *             description: |
 *               If the progress contains multiple videos, `videoId` is required. If the progress has exactly one video, `videoId` may be omitted and the server will infer it.
 *     responses:
 *       200:
 *         description: Video marked watched (not all videos completed yet)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 watchedCount:
 *                   type: integer
 *                 totalVideos:
 *                   type: integer
 *                 completed:
 *                   type: boolean
 *       201:
 *         description: Progress completed (all videos watched), returns created UserActivity and bonus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 userActivity:
 *                   type: object
 *                 bonusEarned:
 *                   type: integer
 */
router.post('/', recordUserActivityController);
// /**
//  * @swagger
//  * /activities/history:
//  *   get:
//  *     summary: Lấy lịch sử hoạt động của user
//  *     tags: [Activities]
//  *     responses:
//  *       200:
//  *         description: Lịch sử hoạt động
//  */
// router.get('/history', getUserActivityHistoryController);

/**
 * @swagger
 * /activities/progress/{progressId}/history:
 *   get:
 *     summary: Lấy lịch sử hoạt động cho một progress cụ thể (phân trang)
 *     tags: [Activities]
 *     parameters:
 *       - in: path
 *         name: progressId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Số trang (mặc định 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Số item mỗi trang (mặc định 20, tối đa 100)
 *     responses:
 *       200:
 *         description: Lịch sử hoạt động của progress
 */
router.get('/progress/:progressId/history', getProgressActivityHistoryController);



// /**
//  * @swagger
//  * /activities/skill/{skillId}/progress:
//  *   get:
//  *     summary: Lấy tiến độ hoàn thành của một kỹ năng
//  *     tags: [Activities]
//  *     parameters:
//  *       - in: path
//  *         name: skillId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Tiến độ hoàn thành
//  */
// router.get('/skill/:skillId/progress', getSkillProgressController);

// /**
//  * @swagger
//  * /activities/class/{classId}/progress:
//  *   get:
//  *     summary: Lấy tiến độ hoàn thành của cả lớp
//  *     tags: [Activities]
//  *     parameters:
//  *       - in: path
//  *         name: classId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Tiến độ lớp
//  */
// router.get('/class/:classId/progress', getClassProgressController);

export default router;
