import express from 'express';
import { getContentByProgressId } from '../controllers/progressContentController.js';
import {
  startQuizSession,
  getSessionQuestions,
  submitQuizSession
} from '../controllers/quizSessionController.js';
import {
  getProgressByLessonController,
  createProgressController,
  updateProgressController,
  deleteProgressController,
  completeProgressController
} from '../controllers/progressController.js';
import { authToken } from '../middlewares/authMiddleware.js';
import { getQuizConfigByProgress, upsertQuizConfigForProgress,createQuizConfigForProgress } from '../controllers/quizConfigController.js';

const router = express.Router();



// Protected endpoints
router.all('*', authToken);


/**
 * @swagger
 * /progress/lesson/{lessonId}:
 *   get:
 *     summary: Lấy danh sách progress của một lesson
 *     tags: [Progress]
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         description: Lesson ID
 *         schema:
 *           type: string
 *         example: "693f88ca3320266f98d13f41"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách progress của lesson
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 progresses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         description: Progress ID
 *                       lessonId:
 *                         type: string
 *                         description: Lesson ID
 *                       stepNumber:
 *                         type: number
 *                         description: Số thứ tự bước (1, 2, 3, ...)
 *                       contentId:
 *                         type: string
 *                         description: ID của nội dung (Video/Exercise/Quiz)
 *                       progressName:
 *                         type: string
 *                         nullable: true
 *                         description: Tên của progress (nếu có)
 *                       isLock:
 *                         type: boolean
 *                         description: |
 *                           True nếu progress bị khóa (step trước chưa hoàn thành)
 *                           False nếu progress mở khóa (step đầu tiên hoặc step trước đã completed)

 *       404:
 *         description: Lesson không tìm thấy
 */
router.get('/lesson/:lessonId', getProgressByLessonController);


/**
 * @swagger
 * /progress/{progressId}/complete:
 *   patch:
 *     summary: Đánh dấu hoàn thành một progress
 *     tags: [Progress]
 *     parameters:
 *       - in: path
 *         name: progressId
 *         required: true
 *         description: Progress ID
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đánh dấu hoàn thành thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 activity:
 *                   type: object
 *       404:
 *         description: Progress không tìm thấy
 */
router.patch('/:progressId/complete', completeProgressController);


// /**
//  * @swagger
//  * /progress/{id}/content:
//  *   get:
//  *     summary: Lấy nội dung video theo `progressId`.
//  *     tags: [Progress]
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         description: Progress ID cần lấy nội dung
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Nội dung theo progress
//  *         content:
//  *           application/json:
//  *             schema:
//  *               oneOf:
//  *                 - type: object
//  *                   properties:
//  *                     content:
//  *                       type: object
//  *                       description: Trả về một document video khi contentType === 'video'
//  *                 - type: object
//  *                   properties:
//  *                     page:
//  *                       type: integer
//  *                     perPage:
//  *                       type: integer
//  *                     total:
//  *                       type: integer
//  *                     totalPages:
//  *                       type: integer
//  *                     content:
//  *                       type: array
//  *                       items:
//  *                         type: object
//  *                       description: Trả về danh sách exercise khi contentType === 'exercise'
//  *                 - type: object
//  *                   properties:
//  *                     page:
//  *                       type: integer
//  *                     perPage:
//  *                       type: integer
//  *                     total:
//  *                       type: integer
//  *                     totalPages:
//  *                       type: integer
//  *                     quiz:
//  *                       type: object
//  *                     questions:
//  *                       type: array
//  *                       items:
//  *                         type: object
//  *                       description: Trả về quiz metadata và câu hỏi (ẩn đáp án) khi contentType === 'quiz'
//  *       404:
//  *         description: Progress/Content not found
//  *       500:
//  *         description: Lỗi server
//  */
// router.get('/:id/content', getContentByProgressId);





// /**
//  * @swagger
//  * /progress/{id}/quiz/start:
//  *   post:
//  *     summary: Tạo session quiz mới cho progress (hoặc dùng cấu hình đã lưu)
//  *     tags: [Progress]
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         description: Progress ID
//  *         schema:
//  *           type: string
//  *     description: Creates a new quiz session for the progress using the stored QuizConfig for this progress. No request body required.
//  *     security:
//  *       - bearerAuth: []
//  *     responses:
//  *       201:
//  *         description: Session created
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 sessionId:
//  *                   type: string
//  *                 total:
//  *                   type: integer
//  *       400:
//  *         description: Bad request (missing total/parts and no config)
//  */
// router.post('/:id/quiz/start', startQuizSession);


// // /**
// //  * @swagger
// //  * /progress/{id}/quiz/config:
// //  *   get:
// //  *     summary: Lấy cấu hình chọn câu cho quiz của một progress
// //  *     tags: [Progress]
// //  *     parameters:
// //  *       - in: path
// //  *         name: id
// //  *         required: true
// //  *         description: Progress ID cần lấy cấu hình
// //  *         schema:
// //  *           type: string
// //  *     security:
// //  *       - bearerAuth: []
// //  *     responses:
// //  *       200:
// //  *         description: Quiz config
// //  *       404:
// //  *         description: Không tìm thấy cấu hình
// //  */
// // router.get('/:id/quiz/config', getQuizConfigByProgress);


// // /**
// //  * @swagger
// //  * /progress/{id}/quiz/config:
// //  *   put:
// //  *     summary: Tạo hoặc cập nhật cấu hình chọn câu cho quiz của một progress
// //  *     tags: [Progress]
// //  *     parameters:
// //  *       - in: path
// //  *         name: id
// //  *         required: true
// //  *         description: Progress ID
// //  *         schema:
// //  *           type: string
// //  *     requestBody:
// //  *       required: true
// //  *       content:
// //  *         application/json:
// //  *           schema:
// //  *             type: object
// //  *             properties:
// //  *               total:
// //  *                 type: integer
// //  *               parts:
// //  *                 type: array
// //  *                 items:
// //  *                   type: object
// //  *                   properties:
// //  *                     type:
// //  *                       type: string
// //  *                     count:
// //  *                       type: integer
// //  *                     order:
// //  *                       type: integer
// //  *           example:
// //  *             total: 15
// //  *             parts:
// //  *               - type: single
// //  *                 count: 10
// //  *                 order: 1
// //  *               - type: multiple
// //  *                 count: 5
// //  *                 order: 2
// //  *     security:
// //  *       - bearerAuth: []
// //  *     responses:
// //  *       200:
// //  *         description: Saved
// //  */
// // router.put('/:id/quiz/config', upsertQuizConfigForProgress);


// // /**
// //  * @swagger
// //  * /progress/{id}/quiz/config:
// //  *   post:
// //  *     summary: Tạo mới cấu hình chọn câu cho quiz của một progress (lỗi nếu đã tồn tại)
// //  *     tags: [Progress]
// //  *     parameters:
// //  *       - in: path
// //  *         name: id
// //  *         required: true
// //  *         description: Progress ID
// //  *         schema:
// //  *           type: string
// //  *     requestBody:
// //  *       required: true
// //  *       content:
// //  *         application/json:
// //  *           schema:
// //  *             type: object
// //  *             properties:
// //  *               total:
// //  *                 type: integer
// //  *               parts:
// //  *                 type: array
// //  *                 items:
// //  *                   type: object
// //  *                   properties:
// //  *                     type:
// //  *                       type: string
// //  *                     count:
// //  *                       type: integer
// //  *                     order:
// //  *                       type: integer
// //  *     security:
// //  *       - bearerAuth: []
// //  *     responses:
// //  *       201:
// //  *         description: Created
// //  */
// // router.post('/:id/quiz/config', createQuizConfigForProgress);


// /**
//  * @swagger
//  * /progress/{id}/quiz:
//  *   get:
//  *     summary: Lấy câu hỏi phân trang từ session đã tạo (phải truyền `sessionId` sau khi start)
//  *     tags: [Progress]
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *       - in: query
//  *         name: sessionId
//  *         required: true
//  *         schema:
//  *           type: string
//  *       - in: query
//  *         name: page
//  *         required: false
//  *         schema:
//  *           type: integer
//  *     security:
//  *       - bearerAuth: []
//  *     responses:
//  *       200:
//  *         description: Danh sách câu hỏi cho session (phân trang)
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 page:
//  *                   type: integer
//  *                 perPage:
//  *                   type: integer
//  *                 total:
//  *                   type: integer
//  *                 totalPages:
//  *                   type: integer
//  *                 questions:
//  *                   type: array
//  *                   items:
//  *                     type: object
//  */
// router.get('/:id/quiz', getSessionQuestions);





// /**
//  * @swagger
//  * /progress/{id}/quiz/submit:
//  *   post:
//  *     summary: Nộp bài quiz, đánh giá đáp án và xóa session tạm
//  *     tags: [Progress]
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               sessionId:
//  *                 type: string
//  *                 description: ID phiên quiz trả về từ /quiz/start
//  *               answers:
//  *                 type: array
//  *                 description: Danh sách đáp án do học sinh gửi. Mỗi phần tử chứa `questionId` và `userAnswer`.
//  *                 items:
//  *                   type: object
//  *                   properties:
//  *                     questionId:
//  *                       type: string
//  *                     userAnswer:
//  *                       oneOf:
//  *                         - type: integer
//  *                         - type: string
//  *                         - type: object
//  *     security:
//  *       - bearerAuth: []
//  *     responses:
//  *       200:
//  *         description: Kết quả nộp bài
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 totalQuestions:
//  *                   type: integer
//  *                 attempted:
//  *                   type: integer
//  *                 correct:
//  *                   type: integer
//  *                 details:
//  *                   type: array
//  *                   items:
//  *                     type: object
//  *                     properties:
//  *                       questionId:
//  *                         type: string
//  *                       isCorrect:
//  *                         type: boolean
//  *                       correctAnswer:
//  *                         description: Stored correct answer (index or object)
//  *                         type: object
//  */
// router.post('/:id/quiz/submit', submitQuizSession);


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

// /**
//  * @swagger
//  * /progress:
//  *   post:
//  *     summary: Tạo bước tiến trình mới (video, exercise, quiz)
//  *     tags: [Progress]
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               skillId:
//  *                 type: string
//  *               stepNumber:
//  *                 type: number
//  *               contentType:
//  *                 type: string
//  *                 enum: [video, exercise, quiz]
//  *               contentId:
//  *                 type: string
//  *     responses:
//  *       201:
//  *         description: Bước tiến trình được tạo thành công
//  */
// router.post('/', createProgressController);

// /**
//  * @swagger
//  * /progress/{progressId}:
//  *   patch:
//  *     summary: Cập nhật bước tiến trình
//  *     tags: [Progress]
//  *     parameters:
//  *       - in: path
//  *         name: progressId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Cập nhật thành công
//  */
// router.patch('/:progressId', updateProgressController);

// /**
//  * @swagger
//  * /progress/{progressId}:
//  *   delete:
//  *     summary: Xóa bước tiến trình
//  *     tags: [Progress]
//  *     parameters:
//  *       - in: path
//  *         name: progressId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Xóa thành công
//  */
// router.delete('/:progressId', deleteProgressController);

export default router;
