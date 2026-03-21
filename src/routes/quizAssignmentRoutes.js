import express from 'express';
import {
  getAssignmentsController,
  createAssignmentController,
  updateAssignmentController,
  updateAssignmentStatusController,
  deleteAssignmentController,
  getAssignmentResultsController,
  getStudentAttemptsController,
  getMyAssignmentsController,
  getAssignmentQuestionsController,
  submitAssignmentController,
  getMyAttemptController
} from '../controllers/quizAssignmentController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /assignments:
 *   get:
 *     summary: Lấy danh sách assignment của giáo viên
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách assignment
 */
router.get('/', getAssignmentsController);

/**
 * @swagger
 * /assignments:
 *   post:
 *     summary: Tạo assignment mới
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quizId
 *             properties:
 *               quizId:
 *                 type: string
 *               startAt:
 *                 type: string
 *                 format: date-time
 *               endAt:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [draft, open, closed]
 *     responses:
 *       201:
 *         description: Tạo thành công (classId lấy tự động từ lớp của giáo viên)
 *       400:
 *         description: Giáo viên chưa được gán lớp
 *       404:
 *         description: Quiz không tìm thấy hoặc không có quyền
 */
router.post('/', createAssignmentController);

/**
 * @swagger
 * /assignments/{assignmentId}:
 *   patch:
 *     summary: Cập nhật assignment
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startAt:
 *                 type: string
 *                 format: date-time
 *               endAt:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [draft, open, closed]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Assignment không tìm thấy hoặc không có quyền
 */
router.patch('/:assignmentId', updateAssignmentController);

/**
 * @swagger
 * /assignments/{assignmentId}:
 *   delete:
 *     summary: Xóa assignment (chỉ khi chưa có học sinh làm bài)
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       400:
 *         description: Đã có học sinh làm bài
 *       404:
 *         description: Assignment không tìm thấy hoặc không có quyền
 */
router.delete('/:assignmentId', deleteAssignmentController);

/**
 * @swagger
 * /assignments/{assignmentId}/status:
 *   patch:
 *     summary: Giáo viên thay đổi trạng thái assignment
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [draft, open, closed]
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
 *       400:
 *         description: Trạng thái không hợp lệ
 *       404:
 *         description: Assignment không tìm thấy hoặc không có quyền
 */
router.patch('/:assignmentId/status', updateAssignmentStatusController);

/**
 * @swagger
 * /assignments/{assignmentId}/results:
 *   get:
 *     summary: Lấy kết quả làm bài của học sinh theo assignment
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Danh sách kết quả làm bài
 *       404:
 *         description: Assignment không tìm thấy hoặc không có quyền
 */
router.get('/:assignmentId/results', getAssignmentResultsController);

/**
 * @swagger
 * /assignments/{assignmentId}/students/{studentId}/attempts:
 *   get:
 *     summary: Giáo viên xem tất cả các lần làm bài của một học sinh trong assignment
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của assignment
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của học sinh
 *     responses:
 *       200:
 *         description: Danh sách các lần làm bài của học sinh (kèm chi tiết từng câu)
 *       404:
 *         description: Assignment không tìm thấy hoặc không có quyền
 */
router.get('/:assignmentId/students/:studentId/attempts', getStudentAttemptsController);

// ============ PHÍA HỌC SINH ============

/**
 * @swagger
 * /assignments/my:
 *   get:
 *     summary: Học sinh lấy danh sách assignment được giao cho lớp mình
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách assignment kèm trạng thái đã làm chưa
 */
router.get('/my', getMyAssignmentsController);

// /**
//  * @swagger
//  * /assignments/{assignmentId}/questions:
//  *   get:
//  *     summary: Học sinh lấy câu hỏi để làm bài (ẩn đáp án)
//  *     tags: [Assignments]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: assignmentId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Danh sách câu hỏi
//  *       404:
//  *         description: Assignment không tìm thấy hoặc chưa mở
//  */
// router.get('/:assignmentId/questions', getAssignmentQuestionsController);

// /**
//  * @swagger
//  * /assignments/{assignmentId}/submit:
//  *   post:
//  *     summary: Học sinh nộp bài
//  *     tags: [Assignments]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: assignmentId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - answers
//  *             properties:
//  *               answers:
//  *                 type: array
//  *                 items:
//  *                   type: object
//  *                   properties:
//  *                     questionId:
//  *                       type: string
//  *                     userAnswer:
//  *                       description: Index (số) hoặc string
//  *     responses:
//  *       201:
//  *         description: Nộp bài thành công, trả về điểm và chi tiết
//  *       404:
//  *         description: Assignment không tìm thấy hoặc chưa mở
//  */
// router.post('/:assignmentId/submit', submitAssignmentController);

/**
 * @swagger
 * /assignments/{assignmentId}/my-attempt:
 *   get:
 *     summary: Học sinh xem lại bài làm của mình
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chi tiết bài làm
 *       404:
 *         description: Chưa làm bài này
 */
router.get('/:assignmentId/my-attempt', getMyAttemptController);

export default router;
