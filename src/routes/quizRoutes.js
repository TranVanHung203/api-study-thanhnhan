import express from 'express';
import {
  getQuizzesController,
  createQuizController,
  getQuizDetailController,
  updateQuizController,
  deleteQuizController
} from '../controllers/quizNewController.js';
import {
  getAdvancedLearningQuestionsController,
  submitAdvancedLearningController
} from '../controllers/advancedLearningController.js';
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

/**
 * @swagger
 * /quizzes/overstudy/questions:
 *   get:
 *     summary: Lay toan bo cau hoi hoc vuot theo classId hoac chapterId
 *     description: Tim cac quiz theo classId hoac chapterId duoc truyen vao, sau do tra ve toan bo cau hoi thuoc cac quiz do.
 *     tags: [Quizzes]
 *     parameters:
 *       - in: query
 *         name: classId
 *         required: false
 *         description: Class ID can lay bo cau hoi hoc vuot
 *         schema:
 *           type: string
 *       - in: query
 *         name: chapterId
 *         required: false
 *         description: Chapter ID can lay bo cau hoi hoc vuot
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sach quiz va cau hoi hoc vuot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 classId:
 *                   type: string
 *                 classInfo:
 *                   type: object
 *                 totalQuizzes:
 *                   type: integer
 *                 totalQuestions:
 *                   type: integer
 *                 quizzes:
 *                   type: array
 *                   items:
 *                     type: object
 *                 questions:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Missing classId/chapterId hoac tham so khong hop le
 *       404:
 *         description: Lop khong ton tai
 */
router.get('/overstudy/questions', getAdvancedLearningQuestionsController);

/**
 * @swagger
 * /quizzes/overstudy/submit:
 *   post:
 *     summary: Nop bai hoc vuot va tu dong gan class khi dat >= 80%
 *     description: Cham diem tren toan bo cau hoi cua class. Neu truyen chapterId, he thong se gan classId va danh dau hoan thanh tat ca progress cua cac lesson truoc chapter do.
 *     tags: [Quizzes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answers
 *             properties:
 *               classId:
 *                 type: string
 *               chapterId:
 *                 type: string
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - questionId
 *                   properties:
 *                     questionId:
 *                       type: string
 *                     userAnswer:
 *                       description: Dap an cua hoc sinh (number/string/array tuy loai cau hoi)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ket qua cham bai hoc vuot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 classId:
 *                   type: string
 *                 totalQuestions:
 *                   type: integer
 *                 correctCount:
 *                   type: integer
 *                 percentCorrect:
 *                   type: number
 *                 passPercent:
 *                   type: number
 *                 passed:
 *                   type: boolean
 *                 classSelected:
 *                   type: boolean
 *                 selectClassResult:
 *                   type: object
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Du lieu khong hop le hoac khong the gan class
 *       404:
 *         description: Lop khong ton tai
 */
router.post('/overstudy/submit', submitAdvancedLearningController);







export default router;

