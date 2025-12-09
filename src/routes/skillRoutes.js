import express from 'express';
import {
  getSkillsByChapterController,
  createSkillController,
  updateSkillController,
  deleteSkillController
} from '../controllers/skillController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /skills/chapter/{chapterId}:
 *   get:
 *     summary: Lấy danh sách kỹ năng của một chapter
 *     tags: [Skills]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Danh sách kỹ năng
 *       401:
 *         description: Không có token hoặc token không hợp lệ
 */
router.get('/chapter/:chapterId', getSkillsByChapterController);

/**
 * @swagger
 * /skills:
 *   post:
 *     summary: Tạo kỹ năng mới
 *     tags: [Skills]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chapterId
 *               - skillName
 *             properties:
 *               chapterId:
 *                 type: string
 *               skillName:
 *                 type: string
 *               description:
 *                 type: string
 *               order:
 *                 type: number
 *                 description: Nếu không truyền sẽ tự động lấy order cao nhất + 1
 *     responses:
 *       201:
 *         description: Kỹ năng được tạo thành công
 */
router.post('/', createSkillController);

/**
 * @swagger
 * /skills/{skillId}:
 *   patch:
 *     summary: Cập nhật kỹ năng
 *     tags: [Skills]
 *     parameters:
 *       - in: path
 *         name: skillId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.patch('/:skillId', updateSkillController);

/**
 * @swagger
 * /skills/{skillId}:
 *   delete:
 *     summary: Xóa kỹ năng
 *     tags: [Skills]
 *     parameters:
 *       - in: path
 *         name: skillId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa thành công
 */
router.delete('/:skillId', deleteSkillController);

export default router;
