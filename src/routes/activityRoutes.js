import express from 'express';
import {
  recordUserActivityController,
  getUserActivityHistoryController,
  getProgressActivityHistoryController,
  getSkillProgressController,
  getClassProgressController
} from '../controllers/userActivityController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);





// /**
//  * @swagger
//  * /activities:
//  *   post:
//  *     summary: Ghi nhận hoạt động của user (video, exercise, quiz)
//  *     description: |
//  *       Endpoint này nhận dữ liệu tương ứng với `contentType` của `Progress`.
//  *       - Video: gửi `progressId` và `isCompleted: true`.
//  *       - Exercise: gửi `progressId` và `exerciseAnswers` (mảng các object { exerciseId, userAnswer }).
//  *       - Quiz: nếu progress chứa một quiz thì gửi `quizAnswers` là mảng { questionId, userAnswer }.
//  *         Nếu progress chứa nhiều quiz thì gửi `quizAnswers` là mảng { quizId, answers: [{ questionId, userAnswer }] }.
//  *     tags: [Activities]
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - progressId
//  *             properties:
//  *               progressId:
//  *                 type: string
//  *                 description: ID của progress
//  *               isCompleted:
//  *                 type: boolean
//  *                 description: Dùng cho Video/Quiz khi client muốn báo hoàn thành trực tiếp
//  *               exerciseAnswers:
//  *                 type: array
//  *                 description: Mảng đáp án cho các Exercise thuộc progress
//  *                 items:
//  *                   type: object
//  *                   required: [exerciseId, userAnswer]
//  *                   properties:
//  *                     exerciseId:
//  *                       type: string
//  *                     userAnswer:
//  *                       type: object
//  *               quizAnswers:
//  *                 type: array
//  *                 description: |
//  *                   Khi progress có 1 quiz: gửi mảng { questionId, userAnswer }.
//  *                   Khi progress có nhiều quiz: gửi mảng object { quizId, answers }.
//  *                 items:
//  *                   type: object
//  *                   properties:
//  *                     quizId:
//  *                       type: string
//  *                     questionId:
//  *                       type: string
//  *                     answers:
//  *                       type: array
//  *                       items:
//  *                         type: object
//  *                         required: [questionId, userAnswer]
//  *                         properties:
//  *                           questionId:
//  *                             type: string
//  *                           userAnswer:
//  *                             type: object
//  *                     userAnswer:
//  *                       type: object
//  *           examples:
//  *             video:
//  *               summary: Ghi nhận VIDEO
//  *               value: {"progressId":"<id>","isCompleted":true}
//  *             exercise:
//  *               summary: Ghi nhận EXERCISE (nhiều exercise trong 1 progress)
//  *               value: {"progressId":"<id>","exerciseAnswers":[{"exerciseId":"<id>","userAnswer":["a","b"]}]}
//  *             quiz_single:
//  *               summary: Ghi nhận QUIZ (1 quiz trong progress)
//  *               value: {"progressId":"<id>","quizAnswers":[{"questionId":"<id>","userAnswer":"a"}]}
//  *             quiz_multiple:
//  *               summary: Ghi nhận QUIZ (nhiều quiz trong progress)
//  *               value: {"progressId":"<id>","quizAnswers":[{"quizId":"<id>","answers":[{"questionId":"<id>","userAnswer":"a"}]}]}
//  *     responses:
//  *       '201':
//  *         description: Ghi nhận thành công — lưu UserActivity và cập nhật reward (nếu có bonus)
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 message:
//  *                   type: string
//  *                 userActivity:
//  *                   type: object
//  *                 bonusEarned:
//  *                   type: number
//  *                 nextStep:
//  *                   type: integer
//  *       '200':
//  *         description: Có đáp án sai — trả về chi tiết, không lưu activity
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 isCorrect:
//  *                   type: boolean
//  *                 message:
//  *                   type: string
//  *                 details:
//  *                   type: array
//  *                 quizzes:
//  *                   type: array
//  */
// router.post('/', recordUserActivityController);
// /**
//  * @swagger
//  * /activities/history:
//  *   get:
//  *     summary: Lấy lịch sử hoạt động của user
//  *     tags: [Activities]
//  *     responses:
//  *       200:
//  *         description: Lịch sử hoạt động
//  */
// router.get('/history', getUserActivityHistoryController);

/**
 * @swagger
 * /activities/progress/{progressId}/history:
 *   get:
 *     summary: Lấy lịch sử hoạt động cho một progress cụ thể (phân trang)
 *     tags: [Activities]
 *     parameters:
 *       - in: path
 *         name: progressId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Số trang (mặc định 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Số item mỗi trang (mặc định 20, tối đa 100)
 *     responses:
 *       200:
 *         description: Lịch sử hoạt động của progress
 */
router.get('/progress/:progressId/history', getProgressActivityHistoryController);

// /**
//  * @swagger
//  * /activities/skill/{skillId}/progress:
//  *   get:
//  *     summary: Lấy tiến độ hoàn thành của một kỹ năng
//  *     tags: [Activities]
//  *     parameters:
//  *       - in: path
//  *         name: skillId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Tiến độ hoàn thành
//  */
// router.get('/skill/:skillId/progress', getSkillProgressController);

// /**
//  * @swagger
//  * /activities/class/{classId}/progress:
//  *   get:
//  *     summary: Lấy tiến độ hoàn thành của cả lớp
//  *     tags: [Activities]
//  *     parameters:
//  *       - in: path
//  *         name: classId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Tiến độ lớp
//  */
// router.get('/class/:classId/progress', getClassProgressController);

export default router;
