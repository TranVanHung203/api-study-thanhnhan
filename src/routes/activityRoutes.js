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
 *     summary: Ghi nhận hoàn thành video (chỉ video)
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
 *                 description: ID của progress thuộc video
 *               isCompleted:
 *                 type: boolean
 *                 description: Ghi `true` để báo hoàn thành video
 *           examples:
 *             video:
 *               summary: Ghi nhận VIDEO
 *               value: {"progressId":"<id>","isCompleted":true}
 *     responses:
 *       '201':
 *         description: Ghi nhận thành công — lưu UserActivity và cập nhật reward (nếu có bonus)
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
 *                   type: number
 *                 nextStep:
 *                   type: integer
 *                 isCheck:
 *                   type: boolean
 *       '400':
 *         description: Yêu cầu không hợp lệ (ví dụ progress không phải video hoặc thiếu isCompleted)
 *       '404':
 *         description: Progress không tìm thấy
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
