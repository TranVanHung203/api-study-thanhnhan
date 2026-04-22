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
  getMyGlobalAssignmentsController,
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
 *     summary: Lay danh sach assignment cua giao vien
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: schoolClassId
 *         required: false
 *         schema:
 *           type: string
 *         description: Loc theo schoolClassId. Truyen "null" de loc assignment global
 *     responses:
 *       200:
 *         description: Danh sach assignment
 */
router.get('/', getAssignmentsController);

/**
 * @swagger
 * /assignments:
 *   post:
 *     summary: Tao assignment moi
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
 *               schoolClassId:
 *                 type: string
 *                 nullable: true
 *                 description: Lop duoc giao bai. Neu null thi assignment global, tat ca user deu thay
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
 *         description: Tao thanh cong
 *       400:
 *         description: Body khong hop le hoac giao vien khong duoc gan schoolClass
 *       404:
 *         description: Quiz khong tim thay hoac khong co quyen
 */
router.post('/', createAssignmentController);

/**
 * @swagger
 * /assignments/{assignmentId}:
 *   patch:
 *     summary: Cap nhat assignment
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
 *               schoolClassId:
 *                 type: string
 *                 nullable: true
 *                 description: Doi assignment sang schoolClass khac. Neu null thi thanh assignment global
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
 *         description: Cap nhat thanh cong
 *       404:
 *         description: Assignment khong tim thay hoac khong co quyen
 */
router.patch('/:assignmentId', updateAssignmentController);

/**
 * @swagger
 * /assignments/{assignmentId}:
 *   delete:
 *     summary: Xoa assignment (chi khi chua co hoc sinh lam bai)
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
 *         description: Xoa thanh cong
 *       400:
 *         description: Da co hoc sinh lam bai
 *       404:
 *         description: Assignment khong tim thay hoac khong co quyen
 */
router.delete('/:assignmentId', deleteAssignmentController);

/**
 * @swagger
 * /assignments/{assignmentId}/status:
 *   patch:
 *     summary: Giao vien thay doi trang thai assignment
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
 *         description: Cap nhat trang thai thanh cong
 *       400:
 *         description: Trang thai khong hop le
 *       404:
 *         description: Assignment khong tim thay hoac khong co quyen
 */
router.patch('/:assignmentId/status', updateAssignmentStatusController);

/**
 * @swagger
 * /assignments/{assignmentId}/results:
 *   get:
 *     summary: Lay ket qua lam bai cua hoc sinh theo assignment
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
 *         description: Danh sach ket qua lam bai
 *       404:
 *         description: Assignment khong tim thay hoac khong co quyen
 */
router.get('/:assignmentId/results', getAssignmentResultsController);

/**
 * @swagger
 * /assignments/{assignmentId}/students/{studentId}/attempts:
 *   get:
 *     summary: Giao vien xem tat ca cac lan lam bai cua mot hoc sinh trong assignment
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID cua assignment
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID cua hoc sinh
 *     responses:
 *       200:
 *         description: Danh sach cac lan lam bai cua hoc sinh
 *       404:
 *         description: Assignment khong tim thay hoac khong co quyen
 */
router.get('/:assignmentId/students/:studentId/attempts', getStudentAttemptsController);

// ============ PHIA HOC SINH ============

/**
 * @swagger
 * /assignments/my:
 *   get:
 *     summary: Hoc sinh lay assignment cua lop hien tai
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sach assignment cua lop hien tai kem trang thai da lam chua
 */
router.get('/my', getMyAssignmentsController);

/**
 * @swagger
 * /assignments/my-global:
 *   get:
 *     summary: Hoc sinh lay danh sach assignment global (khong theo lop)
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sach assignment global kem trang thai da lam chua
 */
router.get('/my-global', getMyGlobalAssignmentsController);

// /**
//  * @swagger
//  * /assignments/{assignmentId}/questions:
//  *   get:
//  *     summary: Hoc sinh lay cau hoi de lam bai (an dap an)
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
//  *         description: Danh sach cau hoi
//  *       404:
//  *         description: Assignment khong tim thay hoac chua mo
//  */
// router.get('/:assignmentId/questions', getAssignmentQuestionsController);

// /**
//  * @swagger
//  * /assignments/{assignmentId}/submit:
//  *   post:
//  *     summary: Hoc sinh nop bai
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
//  *                       description: Index (so) hoac string
//  *     responses:
//  *       201:
//  *         description: Nop bai thanh cong, tra ve diem va chi tiet
//  *       404:
//  *         description: Assignment khong tim thay hoac chua mo
//  */
// router.post('/:assignmentId/submit', submitAssignmentController);

/**
 * @swagger
 * /assignments/{assignmentId}/my-attempt:
 *   get:
 *     summary: Hoc sinh xem lai bai lam cua minh
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
 *         description: Chi tiet bai lam
 *       404:
 *         description: Chua lam bai nay
 */
router.get('/:assignmentId/my-attempt', getMyAttemptController);

export default router;
