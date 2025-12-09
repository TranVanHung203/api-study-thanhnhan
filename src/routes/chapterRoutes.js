import express from 'express';
import { authToken } from '../middlewares/authMiddleware.js';
import {
  createChapterController,
  getChaptersByClassController,
  getChapterByIdController,
  updateChapterController,
  deleteChapterController,
  getChapterMapController,
  insertSkillController,
  insertProgressController
} from '../controllers/chapterController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Chapters
 *   description: Quản lý chương học
 */

/**
 * @swagger
 * /chapters:
 *   post:
 *     summary: Tạo chapter mới
 *     tags: [Chapters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - classId
 *               - chapterName
 *             properties:
 *               classId:
 *                 type: string
 *               chapterName:
 *                 type: string
 *               description:
 *                 type: string
 *               order:
 *                 type: number
 *                 description: Nếu không truyền sẽ tự động lấy order cao nhất + 1
 *     responses:
 *       201:
 *         description: Tạo thành công
 */
router.post('/', authToken, createChapterController);

/**
 * @swagger
 * /chapters/class/{classId}:
 *   get:
 *     summary: Lấy tất cả chapters của một class
 *     tags: [Chapters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Danh sách chapters
 */
router.get('/class/:classId', authToken, getChaptersByClassController);

/**
 * @swagger
 * /chapters/{id}:
 *   get:
 *     summary: Lấy chi tiết chapter
 *     tags: [Chapters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thông tin chapter
 */
router.get('/:id', authToken, getChapterByIdController);

/**
 * @swagger
 * /chapters/{id}:
 *   put:
 *     summary: Cập nhật chapter
 *     tags: [Chapters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chapterName:
 *                 type: string
 *               description:
 *                 type: string
 *               order:
 *                 type: number
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.put('/:id', authToken, updateChapterController);

/**
 * @swagger
 * /chapters/{id}:
 *   delete:
 *     summary: Xóa chapter (và tất cả skills trong chapter)
 *     tags: [Chapters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa thành công
 */
router.delete('/:id', authToken, deleteChapterController);

/**
 * @swagger
 * /chapters/{chapterId}/map:
 *   get:
 *     summary: Lấy map chapter với trạng thái học của user
 *     description: |
 *       Trả về tất cả skills và progresses của chapter, kèm theo trạng thái:
 *       - isCompleted: Đã hoàn thành chưa
 *       - isLocked: Có bị khóa không (chưa hoàn thành bước trước)
 *     tags: [Chapters]
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
 *         description: Map chapter với trạng thái
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chapter:
 *                   type: object
 *                 skills:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       skillName:
 *                         type: string
 *                       order:
 *                         type: number
 *                       isCompleted:
 *                         type: boolean
 *                       isLocked:
 *                         type: boolean
 *                       progresses:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                             stepNumber:
 *                               type: number
 *                             contentType:
 *                               type: string
 *                             isCompleted:
 *                               type: boolean
 *                             isLocked:
 *                               type: boolean
 */
router.get('/:chapterId/map', authToken, getChapterMapController);

/**
 * @swagger
 * /chapters/insert-skill:
 *   post:
 *     summary: Chèn skill mới vào giữa (auto reorder)
 *     description: |
 *       Chèn skill mới vào vị trí sau skill có order = afterOrder.
 *       Các skill phía sau sẽ tự động tăng order lên 1.
 *     tags: [Chapters]
 *     security:
 *       - bearerAuth: []
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
 *               afterOrder:
 *                 type: number
 *                 description: Order của skill mà skill mới sẽ đứng sau. Mặc định 0 (đầu tiên)
 *     responses:
 *       201:
 *         description: Chèn thành công
 */
router.post('/insert-skill', authToken, insertSkillController);

/**
 * @swagger
 * /chapters/insert-progress:
 *   post:
 *     summary: Chèn progress mới vào giữa (auto reorder)
 *     description: |
 *       Chèn progress mới vào vị trí sau progress có stepNumber = afterStepNumber.
 *       Các progress phía sau sẽ tự động tăng stepNumber lên 1.
 *     tags: [Chapters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - skillId
 *               - contentType
 *               - contentId
 *             properties:
 *               skillId:
 *                 type: string
 *               contentType:
 *                 type: string
 *                 enum: [video, exercise, quiz]
 *               contentId:
 *                 type: string
 *               afterStepNumber:
 *                 type: number
 *                 description: StepNumber của progress mà progress mới sẽ đứng sau. Mặc định 0 (đầu tiên)
 *     responses:
 *       201:
 *         description: Chèn thành công
 */
router.post('/insert-progress', authToken, insertProgressController);

export default router;
