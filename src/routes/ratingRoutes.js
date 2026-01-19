import express from 'express';
import { postRatingController, getRatingsForProgressController } from '../controllers/ratingController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /ratings/{progressId}:
 *   post:
 *     summary: Gửi đánh giá cho một progress (1..5)
 *     tags: [Ratings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: progressId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *     responses:
 *       201:
 *         description: Đã ghi nhận đánh giá
 *       400:
 *         description: Yêu cầu không hợp lệ (chưa làm progress hoặc đã đánh giá)
 */
router.post('/:progressId', postRatingController);

/**
 * @swagger
 * /ratings/{progressId}:
 *   get:
 *     summary: Lấy danh sách đánh giá cho progress
 *     tags: [Ratings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: progressId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Danh sách đánh giá
 */
router.get('/:progressId', getRatingsForProgressController);

export default router;
