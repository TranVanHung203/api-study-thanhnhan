import express from 'express';
import {
  getProgressBySkillController,
  createProgressController,
  updateProgressController,
  deleteProgressController
} from '../controllers/progressController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /progress/skill/{skillId}:
 *   get:
 *     summary: Lấy danh sách các bước tiến trình của một kỹ năng
 *     tags: [Progress]
 *     parameters:
 *       - in: path
 *         name: skillId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Danh sách bước tiến trình
 */
router.get('/skill/:skillId', getProgressBySkillController);

/**
 * @swagger
 * /progress:
 *   post:
 *     summary: Tạo bước tiến trình mới (video, exercise, quiz)
 *     tags: [Progress]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               skillId:
 *                 type: string
 *               stepNumber:
 *                 type: number
 *               contentType:
 *                 type: string
 *                 enum: [video, exercise, quiz]
 *               contentId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Bước tiến trình được tạo thành công
 */
router.post('/', createProgressController);

/**
 * @swagger
 * /progress/{progressId}:
 *   patch:
 *     summary: Cập nhật bước tiến trình
 *     tags: [Progress]
 *     parameters:
 *       - in: path
 *         name: progressId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.patch('/:progressId', updateProgressController);

/**
 * @swagger
 * /progress/{progressId}:
 *   delete:
 *     summary: Xóa bước tiến trình
 *     tags: [Progress]
 *     parameters:
 *       - in: path
 *         name: progressId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa thành công
 */
router.delete('/:progressId', deleteProgressController);

export default router;
