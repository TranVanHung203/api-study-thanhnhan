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

// // /**
// //  * @swagger
// //  * /questions/quiz/{quizId}:
// //  *   get:
// //  *     summary: Lấy danh sách câu hỏi của một bài quiz
// //  *     tags: [Questions]
// //  *     parameters:
// //  *       - in: path
// //  *         name: quizId
// //  *         required: true
// //  *         schema:
// //  *           type: string
// //  *     responses:
// //  *       200:
// //  *         description: Danh sách câu hỏi
// //  */
// router.get('/quiz/:quizId', getQuestionsByQuizController);

/**
 * @swagger
 * /questions:
 *   post:
 *     summary: Tạo câu hỏi mới
 *     tags: [Questions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quizId
 *               - choices
 *               - answer
 *             properties:
 *               quizId:
 *                 type: string
 *               questionText:
 *                 type: string
 *               rawQuestion:
 *                 type: string
 *               imageQuestion:
 *                 type: string
 *               choices:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 2
 *               answer:
 *                 description: Index (số) cho single, mảng index cho multiple
 *               questionType:
 *                 type: string
 *               detailType:
 *                 type: string
 *               hintVoice:
 *                 type: string
 *     responses:
 *       201:
 *         description: Câu hỏi được tạo thành công
 *       404:
 *         description: Quiz không tìm thấy hoặc không có quyền
 */
router.post('/', createQuestionController);


/**
 * @swagger
 * /questions/{questionId}:
 *   patch:
 *     summary: Cập nhật câu hỏi
 *     tags: [Questions]
 *     parameters:
 *       - in: path
 *         name: questionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               questionText:
 *                 type: string
 *               rawQuestion:
 *                 type: string
 *               imageQuestion:
 *                 type: string
 *               choices:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 2
 *               answer:
 *                 description: Index (số) cho single, mảng index cho multiple
 *               questionType:
 *                 type: string
 *               detailType:
 *                 type: string
 *               hintVoice:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       403:
 *         description: Không có quyền chỉnh sửa
 *       404:
 *         description: Câu hỏi không tìm thấy
 */
router.patch('/:questionId', updateQuestionController);


/**
 * @swagger
 * /questions/{questionId}:
 *   delete:
 *     summary: Xóa câu hỏi
 *     tags: [Questions]
 *     parameters:
 *       - in: path
 *         name: questionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       400:
 *         description: Không thể xóa vì đã có học sinh làm bài liên quan
 *       403:
 *         description: Không có quyền xóa
 *       404:
 *         description: Câu hỏi không tìm thấy
 */
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
