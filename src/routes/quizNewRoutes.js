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

// /**
//  * @swagger
//  * /quizzes:
//  *   get:
//  *     summary: Lấy danh sách bài quiz
//  *     tags: [Quizzes]
//  *     responses:
//  *       200:
//  *         description: Danh sách bài quiz
//  */
// router.get('/', getQuizzesController);

// /**
//  * @swagger
//  * /quizzes:
//  *   post:
//  *     summary: Tạo bài quiz mới
//  *     tags: [Quizzes]
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               title:
//  *                 type: string
//  *               description:
//  *                 type: string
//  *               totalQuestions:
//  *                 type: number
//  *               bonusPoints:
//  *                 type: number
//  *               voiceDescription:
//  *                 type: string
//  *     responses:
//  *       201:
//  *         description: Bài quiz được tạo thành công
//  */
// router.post('/', createQuizController);

// /**
//  * @swagger
//  * /quizzes/{quizId}:
//  *   get:
//  *     summary: Lấy chi tiết bài quiz (kèm theo câu hỏi)
//  *     tags: [Quizzes]
//  *     parameters:
//  *       - in: path
//  *         name: quizId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Chi tiết bài quiz và câu hỏi
//  */
// router.get('/:quizId', getQuizDetailController);

// /**
//  * @swagger
//  * /quizzes/{quizId}:
//  *   patch:
//  *     summary: Cập nhật bài quiz
//  *     tags: [Quizzes]
//  *     parameters:
//  *       - in: path
//  *         name: quizId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     requestBody:
//  *       required: false
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               title:
//  *                 type: string
//  *               description:
//  *                 type: string
//  *               totalQuestions:
//  *                 type: number
//  *               bonusPoints:
//  *                 type: number
//  *               voiceDescription:
//  *                 type: string
//  *     responses:
//  *       200:
//  *         description: Cập nhật thành công
//  */
// router.patch('/:quizId', updateQuizController);

// /**
//  * @swagger
//  * /quizzes/{quizId}:
//  *   delete:
//  *     summary: Xóa bài quiz
//  *     tags: [Quizzes]
//  *     parameters:
//  *       - in: path
//  *         name: quizId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Xóa thành công
//  */
// router.delete('/:quizId', deleteQuizController);







export default router;
