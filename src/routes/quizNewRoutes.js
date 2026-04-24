import express from 'express';
import {
  getQuizzesController,
  createQuizController,
  getQuizDetailController,
  updateQuizController,
  deleteQuizController
} from '../controllers/quizNewController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);


/**
 * @swagger
 * /quizzes:
 *   get:
 *     summary: Lấy danh sách bài quiz
 *     tags: [Quizzes]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Trang hiện tại (bắt đầu từ 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Số lượng quiz mỗi trang (tối đa 100)
 *     responses:
 *       200:
 *         description: Danh sách bài quiz (có phân trang)
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
 *                 quizzes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Quiz'
 */
router.get('/', getQuizzesController);

/**
 * @swagger
 * /quizzes:
 *   post:
 *     description: totalQuestions duoc he thong tu dong tinh theo so cau hoi thuoc quiz
 *     summary: Tạo bài quiz mới
 *     tags: [Quizzes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               bonusPoints:
 *                 type: number
 *     responses:
 *       201:
 *         description: Bài quiz được tạo thành công
 */
router.post('/', createQuizController);



/**
 * @swagger
 * /quizzes/{quizId}:
 *   patch:
 *     summary: Cập nhật bài quiz
 *     tags: [Quizzes]
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               totalQuestions:
 *                 type: number
 *               bonusPoints:
 *                 type: number
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.patch('/:quizId', updateQuizController);

/**
 * @swagger
 * /quizzes/{quizId}:
 *   delete:
 *     summary: Xóa bài quiz
 *     tags: [Quizzes]
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa thành công
 */
router.delete('/:quizId', deleteQuizController);







export default router;

