import express from 'express';
import { checkInStreakController, getMyStreakController } from '../controllers/streakController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Streaks
 *   description: API điểm danh và streak
 */

/**
 * @swagger
 * /streaks/me:
 *   get:
 *     tags: [Streaks]
 *     summary: Lấy thông tin streak hiện tại
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin streak
 */
router.get('/me', authToken, getMyStreakController);

/**
 * @swagger
 * /streaks/check-in:
 *   post:
 *     tags: [Streaks]
 *     summary: Điểm danh ngày hôm nay (tăng streak)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               timezone:
 *                 type: string
 *                 example: Asia/Ho_Chi_Minh
 *     responses:
 *       200:
 *         description: Kết quả check-in
 */
router.post('/check-in', authToken, checkInStreakController);

export default router;
