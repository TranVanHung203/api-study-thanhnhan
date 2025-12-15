import express from 'express';
import { getContentByProgressId } from '../controllers/progressContentController.js';
import {
  startQuizSession,
  getSessionQuestions,
  submitQuizSession
} from '../controllers/quizSessionController.js';
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



/**
 * @swagger
 * /progress/{id}/content:
 *   get:
 *     summary: Lấy nội dung video theo `progressId`.
 *     tags: [Progress]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Progress ID cần lấy nội dung
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Nội dung theo progress
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     content:
 *                       type: object
 *                       description: Trả về một document video khi contentType === 'video'
 *                 - type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     perPage:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     content:
 *                       type: array
 *                       items:
 *                         type: object
 *                       description: Trả về danh sách exercise khi contentType === 'exercise'
 *                 - type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     perPage:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     quiz:
 *                       type: object
 *                     questions:
 *                       type: array
 *                       items:
 *                         type: object
 *                       description: Trả về quiz metadata và câu hỏi (ẩn đáp án) khi contentType === 'quiz'
 *       404:
 *         description: Progress/Content not found
 *       500:
 *         description: Lỗi server
 */
router.get('/:id/content', getContentByProgressId);



/**
 * @swagger
 * /progress/{id}/quiz/start:
 *   post:
 *     summary: Bắt đầu một phiên làm quiz (server chọn random `count` câu từ quiz liên kết với progress)
 *     tags: [Progress]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Progress ID cần bắt đầu quiz
 *         schema:
 *           type: string
 *       - in: query
 *         name: count
 *         required: false
 *         description: Số câu hỏi cần lấy (ví dụ ?count=10). Mặc định là `quiz.totalQuestions`.
 *         schema:
 *           type: integer
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Phiên quiz đã được tạo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 quizId:
 *                   type: string
 *                 total:
 *                   type: integer
 */
router.post('/:id/quiz/start', startQuizSession);


/**
 * @swagger
 * /progress/{id}/quiz:
 *   get:
 *     summary: Lấy câu hỏi phân trang từ session đã tạo (phải truyền `sessionId` sau khi start)
 *     tags: [Progress]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách câu hỏi cho session (phân trang)
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
 *                 questions:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/:id/quiz', getSessionQuestions);





/**
 * @swagger
 * /progress/{id}/quiz/submit:
 *   post:
 *     summary: Nộp bài quiz, đánh giá đáp án và xóa session tạm
 *     tags: [Progress]
 *     parameters:
 *       - in: path
 *         name: id
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
 *               sessionId:
 *                 type: string
 *                 description: ID phiên quiz trả về từ /quiz/start
 *               answers:
 *                 type: array
 *                 description: Danh sách đáp án do học sinh gửi. Mỗi phần tử chứa `questionId` và `userAnswer`.
 *                 items:
 *                   type: object
 *                   properties:
 *                     questionId:
 *                       type: string
 *                     userAnswer:
 *                       oneOf:
 *                         - type: integer
 *                         - type: string
 *                         - type: object
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kết quả nộp bài
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalQuestions:
 *                   type: integer
 *                 attempted:
 *                   type: integer
 *                 correct:
 *                   type: integer
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       questionId:
 *                         type: string
 *                       isCorrect:
 *                         type: boolean
 *                       correctAnswer:
 *                         description: Stored correct answer (index or object)
 *                         type: object
 */
router.post('/:id/quiz/submit', submitQuizSession);


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
