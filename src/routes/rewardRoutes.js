import express from 'express';
import {
  getRewardController,
  getLeaderboardController,
  addRewardPointsController,
  resetRewardController
} from '../controllers/rewardController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /rewards:
 *   get:
 *     summary: Lấy điểm thưởng của user
 *     tags: [Rewards]
 *     responses:
 *       200:
 *         description: Thông tin điểm thưởng
 */
router.get('/', getRewardController);

/**
 * @swagger
 * /rewards/leaderboard/{classId}:
 *   get:
 *     summary: Lấy bảng xếp hạng theo điểm của một lớp
 *     tags: [Rewards]
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 10
 *     responses:
 *       200:
 *         description: Bảng xếp hạng
 */
router.get('/leaderboard/:classId', getLeaderboardController);

/**
 * @swagger
 * /rewards/add:
 *   post:
 *     summary: Thêm điểm thưởng cho user (admin only)
 *     tags: [Rewards]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               points:
 *                 type: number
 *     responses:
 *       200:
 *         description: Cộng điểm thành công
 */
router.post('/add', addRewardPointsController);

/**
 * @swagger
 * /rewards/{userId}/reset:
 *   patch:
 *     summary: Reset điểm thưởng (admin only)
 *     tags: [Rewards]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reset thành công
 */
router.patch('/:userId/reset', resetRewardController);

export default router;
