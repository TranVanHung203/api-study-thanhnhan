import express from 'express';
import {
	checkInStreakController,
	getMyStreakController,
	saveRecent30DaysCheckinsController
} from '../controllers/streakController.js';
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

/**
 * @swagger
 * /streaks/recent-30-days:
 *   post:
 *     tags: [Streaks]
 *     summary: Lưu lịch sử ngày đã điểm danh trong 30 ngày gần nhất
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - checkedInDates
 *             properties:
 *               timezone:
 *                 type: string
 *                 example: Asia/Ho_Chi_Minh
 *               checkedInDates:
 *                 type: array
 *                 description: Danh sách ngày đã điểm danh (YYYY-MM-DD), chỉ nhận trong 30 ngày gần nhất
 *                 items:
 *                   type: string
 *                   example: 2026-05-11
 *     responses:
 *       200:
 *         description: Lưu lịch sử thành công
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 */
router.post('/recent-30-days', authToken, saveRecent30DaysCheckinsController);

export default router;
