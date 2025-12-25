import express from 'express';
import {
  getQuestionsByQuizController,
  createQuestionController,
  getQuestionForStudentController,
  updateQuestionController,
  deleteQuestionController,
  checkAnswerController
} from '../controllers/questionController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

// /**
//  * @swagger
//  * /questions/quiz/{quizId}:
//  *   get:
//  *     summary: Lấy danh sách câu hỏi của một bài quiz
//  *     tags: [Questions]
//  *     parameters:
//  *       - in: path
//  *         name: quizId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Danh sách câu hỏi
//  */
router.get('/quiz/:quizId', getQuestionsByQuizController);

// /**
//  * @swagger
//  * /questions:
//  *   post:
//  *     summary: Tạo câu hỏi mới
//  *     tags: [Questions]
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               quizId:
//  *                 type: string
//  *               questionText:
//  *                 type: string
//  *               options:
//  *                 type: array
//  *                 items:
//  *                   type: string
//  *               correctAnswer:
//  *                 type: string
//  *               hintText:
//  *                 type: string
//  *               order:
//  *                 type: number
//  *     responses:
//  *       201:
//  *         description: Câu hỏi được tạo thành công
//  */
router.post('/', createQuestionController);

// /**
//  * @swagger
//  * /questions/{questionId}/student:
//  *   get:
//  *     summary: Lấy câu hỏi (ẩn đáp án đúng) cho học sinh
//  *     tags: [Questions]
//  *     parameters:
//   *             properties:
//   *               quizId:
//   *                 type: string
//   *               questionText:
//   *                 type: string
//   *               rawQuestion:
//   *                 type: string
//   *                 description: Original/raw question content before parsing
//   *               options:
//   *                 type: array
//   *                 items:
//   *                   type: string
//   *               correctAnswer:
//   *                 type: string
//   *               hintText:
//   *                 type: string
//   *               order:
//   *                 type: number
// //  *       - in: path
// //  *         name: questionId
// //  *         required: true
// //  *         schema:
// //  *           type: string
// //  *     responses:
//   *     parameters:
//   *       - in: path
//   *         name: questionId
//   *         required: true
//   *         schema:
//   *           type: string
//   *     requestBody:
//   *       required: true
//   *       content:
//   *         application/json:
//   *           schema:
//   *             type: object
//   *             properties:
//   *               questionText:
//   *                 type: string
//   *               rawQuestion:
//   *                 type: string
//   *                 description: Original/raw question content before parsing
//  *       200:
//  *         description: Câu hỏi (không có đáp án đúng)
//  */
router.get('/:questionId/student', getQuestionForStudentController);

// /**
//  * @swagger
//  * /questions/{questionId}:
//  *   patch:
//  *     summary: Cập nhật câu hỏi
//  *     tags: [Questions]
//  *     parameters:
//  *       - in: path
//  *         name: questionId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Cập nhật thành công
//  */
router.patch('/:questionId', updateQuestionController);

// /**
//  * @swagger
//  * /questions/{questionId}:
//  *   delete:
//  *     summary: Xóa câu hỏi
//  *     tags: [Questions]
//  *     parameters:
//  *       - in: path
//  *         name: questionId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Xóa thành công
//  */
router.delete('/:questionId', deleteQuestionController);

/**
 * @swagger
 * /questions/check-answer:
 *   post:
 *     summary: Kiểm tra đáp án
 *     tags: [Questions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               questionId:
 *                 type: string
 *               userAnswer:
 *                 type: string
 *     responses:
 *       200:
 *         description: Kết quả kiểm tra
 */
router.post('/check-answer', checkAnswerController);

export default router;
