import express from 'express';
import { getQuizAttemptsController } from '../controllers/quizAttemptController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /quiz-attempts/lesson/{lessonId}:
 *   get:
 *     summary: Lay lich su lam quiz theo lessonId cua tai khoan dang dang nhap
 *     tags: [Quiz Attempts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *         description: lessonId de tim progressName "Luyen tap"
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: fromDate
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: toDate
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Danh sach lan lam quiz
 *       400:
 *         description: Du lieu lessonId/ngay khong hop le
 *       401:
 *         description: Chua dang nhap hoac token khong hop le
 */
router.get('/lesson/:lessonId', getQuizAttemptsController);

/**
 * @swagger
 * /quiz-attempts/{userId}/{lessonId}:
 *   get:
 *     summary: Lấy lịch sử làm quiz theo userId và lessonId (progress Luyện tập)
 *     tags: [Quiz Attempts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Số trang hiện tại
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Số bản ghi trên mỗi trang
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: userId của người làm quiz
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *         description: lessonId để tìm progressName "Luyện tập"
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *         description: Lọc đúng 1 ngày (hỗ trợ yyyy-mm-dd hoặc dd/MM/yyyy). Ưu tiên hơn fromDate/toDate nếu truyền cùng lúc
 *       - in: query
 *         name: fromDate
 *         required: false
 *         schema:
 *           type: string
 *         description: Ngày bắt đầu lọc (yyyy-mm-dd, dd/MM/yyyy hoặc ISO date)
 *       - in: query
 *         name: toDate
 *         required: false
 *         schema:
 *           type: string
 *         description: Ngày kết thúc lọc (yyyy-mm-dd, dd/MM/yyyy hoặc ISO date)
 *     responses:
 *       200:
 *         description: Danh sách lần làm quiz
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 attempts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       score:
 *                         type: number
 *                       isCompleted:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       fullName:
 *                         type: string
 *                         nullable: true
 *                       details:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             questionText:
 *                               type: string
 *                               nullable: true
 *                             imageQuestion:
 *                               type: string
 *                               nullable: true
 *                             choice:
 *                               type: array
 *                               items:
 *                                 type: string
 *                             questionType:
 *                               type: string
 *                               enum: [single, multiple, text, image]
 *                             rawQuestion:
 *                               nullable: true
 *                             userAnswer:
 *                               nullable: true
 *                             isCorrect:
 *                               type: boolean
 *                             isCorrectAnswer:
 *                               nullable: true
 *       400:
 *         description: Dữ liệu userId/lessonId/ngày không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc token không hợp lệ
 */
router.get('/:userId/:lessonId', getQuizAttemptsController);

export default router;
