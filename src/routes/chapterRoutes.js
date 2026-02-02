import express from 'express';
import { authToken } from '../middlewares/authMiddleware.js';
import {
  createChapterController,
  getChaptersByClassController,
  getChapterByIdController,
  updateChapterController,
  deleteChapterController,
  getChapterMapController,
  insertLessonController,
  insertProgressController
} from '../controllers/chapterController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Chapters
 *   description: Quản lý chương học
 */

// /**
//  * @swagger
//  * /chapters:
//  *   post:
//  *     summary: Tạo chapter mới
//  *     tags: [Chapters]
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - classId
//  *               - chapterName
//  *             properties:
//  *               classId:
//  *                 type: string
//  *               chapterName:
//  *                 type: string
//  *               description:
//  *                 type: string
//  *               order:
//  *                 type: number
//  *                 description: Nếu không truyền sẽ tự động lấy order cao nhất + 1
//  *     responses:
//  *       201:
//  *         description: Tạo thành công
//  */
// router.post('/', authToken, createChapterController);

// /**
//  * @swagger
//  * /chapters/class/{classId}:
//  *   get:
//  *     summary: Lấy tất cả chapters của một class
//  *     tags: [Chapters]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: classId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Danh sách chapters
//  */
// router.get('/class/:classId', authToken, getChaptersByClassController);

// /**
//  * @swagger
//  * /chapters/{id}:
//  *   get:
//  *     summary: Lấy chi tiết chapter
//  *     tags: [Chapters]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Thông tin chapter
//  */
// router.get('/:id', authToken, getChapterByIdController);

// /**
//  * @swagger
//  * /chapters/{id}:
//  *   put:
//  *     summary: Cập nhật chapter
//  *     tags: [Chapters]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *     requestBody:
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               chapterName:
//  *                 type: string
//  *               description:
//  *                 type: string
//  *               order:
//  *                 type: number
//  *     responses:
//  *       200:
//  *         description: Cập nhật thành công
//  */
// router.put('/:id', authToken, updateChapterController);

// /**
//  * @swagger
//  * /chapters/{id}:
//  *   delete:
//  *     summary: Xóa chapter (và tất cả Lessons trong chapter)
//  *     tags: [Chapters]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Xóa thành công
//  */
// router.delete('/:id', authToken, deleteChapterController);

/**
 * @swagger
 * /chapters/class/{classId}/map:
 *   get:
 *     summary: Lấy tất cả chapters của lớp với lessons và trạng thái học
 *     description: |
 *       Trả về tất cả chapters của lớp, mỗi chapter bọc danh sách lessons bên trong.
 *       Kèm theo trạng thái học của user cho mỗi lesson:
 *       - isCompleted: Lesson đã hoàn thành chưa
 *       - isCurrent: Lesson hiện tại (lesson đầu tiên chưa hoàn thành trong chapter)
 *     tags: [Chapters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lớp học
 *     responses:
 *       200:
 *         description: Danh sách chapters với lessons và trạng thái
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chapters:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       chapterName:
 *                         type: string
 *                       description:
 *                         type: string
 *                       order:
 *                         type: number
 *                       lessons:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                             lessonName:
 *                               type: string
 *                             description:
 *                               type: string
 *                             order:
 *                               type: number
 *                             isCompleted:
 *                               type: boolean
 *                             isCurrent:
 *                               type: boolean
 *       404:
 *         description: Không tìm thấy chapter nào cho lớp này
 */
router.get('/class/:classId/map', authToken, getChapterMapController);

// /**
//  * @swagger
//  * /chapters/insert-Lesson:
//  *   post:
//  *     summary: Chèn Lesson mới vào giữa (auto reorder)
//  *     description: |
//  *       Chèn Lesson mới vào vị trí sau Lesson có order = afterOrder.
//  *       Các Lesson phía sau sẽ tự động tăng order lên 1.
//  *     tags: [Chapters]
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - chapterId
//  *               - LessonName
//  *             properties:
//  *               chapterId:
//  *                 type: string
//  *               LessonName:
//  *                 type: string
//  *               description:
//  *                 type: string
//  *               afterOrder:
//  *                 type: number
//  *                 description: Order của Lesson mà Lesson mới sẽ đứng sau. Mặc định 0 (đầu tiên)
//  *     responses:
//  *       201:
//  *         description: Chèn thành công
//  */
// router.post('/insert-Lesson', authToken, insertLessonController);

// /**
//  * @swagger
//  * /chapters/insert-progress:
//  *   post:
//  *     summary: Chèn progress mới vào giữa (auto reorder)
//  *     description: |
//  *       Chèn progress mới vào vị trí sau progress có stepNumber = afterStepNumber.
//  *       Các progress phía sau sẽ tự động tăng stepNumber lên 1.
//  *     tags: [Chapters]
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - LessonId
//  *               - contentType
//  *               - contentId
//  *             properties:
//  *               LessonId:
//  *                 type: string
//  *               contentType:
//  *                 type: string
//  *                 enum: [video, exercise, quiz]
//  *               contentId:
//  *                 type: string
//  *               afterStepNumber:
//  *                 type: number
//  *                 description: StepNumber của progress mà progress mới sẽ đứng sau. Mặc định 0 (đầu tiên)
//  *     responses:
//  *       201:
//  *         description: Chèn thành công
//  */
// router.post('/insert-progress', authToken, insertProgressController);

export default router;
