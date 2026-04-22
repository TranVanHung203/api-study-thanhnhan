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
import { uploadImage } from '../middlewares/uploadMiddleware.js';

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

/**
 * @swagger
 * /questions/quiz/{quizId}:
 *   get:
 *     summary: Lay danh sach cau hoi theo quizId (chi chu quiz moi xem duoc)
 *     tags: [Questions]
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Danh sach cau hoi
 *       403:
 *         description: Khong co quyen xem quiz nay
 *       404:
 *         description: Quiz khong ton tai
 */
router.get('/quiz/:quizId', getQuestionsByQuizController);


/**
 * @swagger
 * /questions:
 *   post:
 *     summary: Tao cau hoi moi
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
 *                 description: Index (so) cho single, mang index cho multiple
 *               questionType:
 *                 type: string
 *               detailType:
 *                 type: string
 *               hintVoice:
 *                 type: string
 *         multipart/form-data:
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
 *                 description: Link anh truc tiep
 *               imageQuestionFile:
 *                 type: string
 *                 format: binary
 *                 description: File anh de upload len Cloudinary
 *               choices:
 *                 type: string
 *                 description: JSON string mang lua chon, vi du ["A","B"]
 *               answer:
 *                 type: string
 *                 description: JSON string dap an hoac so cho single
 *               questionType:
 *                 type: string
 *               detailType:
 *                 type: string
 *               hintVoice:
 *                 type: string
 *     responses:
 *       201:
 *         description: Cau hoi duoc tao thanh cong
 *       404:
 *         description: Quiz khong tim thay hoac khong co quyen
 */
router.post('/', uploadImage.single('imageQuestionFile'), createQuestionController);


/**
 * @swagger
 * /questions/{questionId}:
 *   patch:
 *     summary: Cap nhat cau hoi
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
 *                 description: Index (so) cho single, mang index cho multiple
 *               questionType:
 *                 type: string
 *               detailType:
 *                 type: string
 *               hintVoice:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cap nhat thanh cong
 *       403:
 *         description: Khong co quyen chinh sua
 *       404:
 *         description: Cau hoi khong tim thay
 */
router.patch('/:questionId', updateQuestionController);


/**
 * @swagger
 * /questions/{questionId}:
 *   delete:
 *     summary: Xoa cau hoi
 *     tags: [Questions]
 *     parameters:
 *       - in: path
 *         name: questionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xoa thanh cong
 *       400:
 *         description: Khong the xoa vi da co hoc sinh lam bai lien quan
 *       403:
 *         description: Khong co quyen xoa
 *       404:
 *         description: Cau hoi khong tim thay
 */
router.delete('/:questionId', deleteQuestionController);

/**
 * @swagger
 * /questions/check-answer:
 *   post:
 *     summary: Kiem tra dap an
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
 *         description: Ket qua kiem tra
 */
router.post('/check-answer', checkAnswerController);

export default router;
