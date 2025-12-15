import express from 'express';
import { getContentByProgressId } from '../controllers/progressContentController.js';
import {
  getProgressBySkillController,
  createProgressController,
  updateProgressController,
  deleteProgressController
} from '../controllers/progressController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();



// Protected endpoints
router.all('*', authToken);
// Public content fetch
/**
 * @swagger
 * /progress/{id}/content:
 *   get:
 *     summary: Lấy nội dung (video/exercise/quiz) theo `progressId`. Quiz có thể random hoặc truyền `quizId` để giữ bộ đề.
 *     tags: [Progress]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Progress ID cần lấy nội dung
 *         schema:
 *           type: string
 *       - in: query
 *         name: quizId
 *         required: false
 *         description: (optional) Nếu truyền `quizId`, API sẽ trả câu hỏi của quiz đó; nếu không truyền, server sẽ chọn ngẫu nhiên 1 quiz.
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         required: false
 *         description: Số trang (1-based). Mặc định là 1.
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Nội dung phân trang
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                 perPage:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 quiz:
 *                   type: object
 *                 questions:
 *                   type: array
 *                   items:
 *                     type: object
 *               example:
 *                 page: 1
 *                 perPage: 10
 *                 total: 31
 *                 totalPages: 4
 *                 quiz:
 *                   _id: "693f7801919124df0f179921"
 *                   title: "Quiz A"
 *                 questions:
 *                   - _id: "693f7801919124df0f179924"
 *                     questionText: "Sample question 1 for Quiz A"
 *                     choices:
 *                       - { text: "Red" }
 *                       - { text: "Blue 1" }
 *       404:
 *         description: Progress hoặc nội dung không tìm thấy
 *       500:
 *         description: Lỗi server
 */
router.get('/:id/content', getContentByProgressId);
// /**
//  * @swagger
//  * /progress/skill/{skillId}:
//  *   get:
//  *     summary: Lấy danh sách các bước tiến trình của một kỹ năng
//  *     tags: [Progress]
//  *     parameters:
//  *       - in: path
//  *         name: skillId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Danh sách bước tiến trình
//  */
// router.get('/skill/:skillId', getProgressBySkillController);

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
