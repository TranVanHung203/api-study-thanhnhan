import express from 'express';
import {
  getQuestionsByQuizController,
  createQuestionController,
  getQuestionForStudentController,
  updateQuestionController,
  deleteQuestionController,
  checkAnswerController,
  getAllQuestionsController,
  getQuestionFilterOptionsController
} from '../controllers/questionController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /questions/filter-options:
 *   get:
 *     summary: Lay cac gia tri questionType/detailType de loc
 *     tags: [Questions]
 *     parameters:
 *       - in: query
 *         name: questionType
 *         schema:
 *           type: string
 *         required: false
 *         description: Neu co, tra ve detailType theo questionType nay
 *     responses:
 *       200:
 *         description: Danh sach options bo loc
 */
router.get('/filter-options', getQuestionFilterOptionsController);

/**
 * @swagger
 * /questions:
 *   get:
 *     summary: Lay danh sach question co phan trang va bo loc tuy chinh
 *     tags: [Questions]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         required: false
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         required: false
 *       - in: query
 *         name: questionId
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: quizId
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: questionType
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: detailType
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: hasImage
 *         schema:
 *           type: boolean
 *         required: false
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         required: false
 *       - in: query
 *         name: createdFrom
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: createdTo
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: filters
 *         schema:
 *           type: string
 *         required: false
 *         description: JSON string cho custom filters
 *     responses:
 *       200:
 *         description: Danh sach question da phan trang
 *       400:
 *         description: Du lieu query khong hop le
 */
router.get('/', getAllQuestionsController);

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
