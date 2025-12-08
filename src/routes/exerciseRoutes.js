import express from 'express';
import {
  getExercisesController,
  createExerciseController,
  updateExerciseController,
  deleteExerciseController
} from '../controllers/exerciseController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /exercises:
 *   get:
 *     summary: Lấy danh sách bài tập
 *     tags: [Exercises]
 *     responses:
 *       200:
 *         description: Danh sách bài tập
 */
router.get('/', getExercisesController);

/**
 * @swagger
 * /exercises:
 *   post:
 *     summary: Tạo bài tập mới
 *     tags: [Exercises]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               frontendRef:
 *                 type: string
 *               description:
 *                 type: string
 *               bonusPoints:
 *                 type: number
 *     responses:
 *       201:
 *         description: Bài tập được tạo thành công
 */
router.post('/', createExerciseController);

/**
 * @swagger
 * /exercises/{exerciseId}:
 *   patch:
 *     summary: Cập nhật bài tập
 *     tags: [Exercises]
 *     parameters:
 *       - in: path
 *         name: exerciseId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.patch('/:exerciseId', updateExerciseController);

/**
 * @swagger
 * /exercises/{exerciseId}:
 *   delete:
 *     summary: Xóa bài tập
 *     tags: [Exercises]
 *     parameters:
 *       - in: path
 *         name: exerciseId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa thành công
 */
router.delete('/:exerciseId', deleteExerciseController);

export default router;
