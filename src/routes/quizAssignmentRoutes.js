import express from 'express';
import {
  getAssignmentsController,
  getAssignmentsByQuizController,
  createAssignmentController,
  updateAssignmentController,
  updateAssignmentStatusController,
  deleteAssignmentController,
  getAssignmentResultsController,
  getStudentAttemptsController,
  getMyAssignmentsController,
  getMyGlobalAssignmentsController,
  getAssignmentQuestionsController,
  getAssignmentSessionQuestionsController,
  saveAssignmentSessionAnswersController,
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
 * /assignments/quiz/{quizId}:
 *   get:
 *     summary: Lay danh sach assignment theo quizId
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID cua quiz can lay assignment
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *         description: So trang
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *         description: So ban ghi moi trang
 *       - in: query
 *         name: schoolClassId
 *         required: false
 *         schema:
 *           type: string
 *         description: Loc theo schoolClassId. Truyen null de lay tat ca assignment cua giao vien cho quiz nay
 *     responses:
 *       200:
 *         description: Danh sach assignment theo quizId
 *       404:
 *         description: Quiz khong tim thay hoac khong co quyen
 */
router.get('/quiz/:quizId', getAssignmentsByQuizController);

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
 *               name:
 *                 type: string
 *                 description: Ten hien thi cua assignment
 *               description:
 *                 type: string
 *                 description: Mo ta ngan cho assignment
 *               classId:
 *                 type: string
 *                 nullable: true
 *                 description: ID khoi lop. Neu null thi bo lien ket khoi lop
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
 *               durationMinutes:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 1440
 *                 description: Thoi gian lam bai (phut). Mac dinh 120 phut neu khong truyen
 *               attemptLimit:
 *                 type: integer
 *                 nullable: true
 *                 minimum: 1
 *                 maximum: 20
 *                 description: So lan lam bai toi da cua moi hoc sinh cho assignment nay. Dat null de khong gioi han
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
 *               quizId:
 *                 type: string
 *                 description: Doi quiz cho assignment (phai la quiz do chinh giao vien tao)
 *               name:
 *                 type: string
 *                 description: Cap nhat ten assignment
 *               description:
 *                 type: string
 *                 description: Cap nhat mo ta assignment
 *               classId:
 *                 type: string
 *                 nullable: true
 *                 description: Cap nhat khoi lop cho assignment. Dat null de bo lien ket
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
 *               durationMinutes:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 1440
 *                 description: Thoi gian lam bai (phut)
 *               attemptLimit:
 *                 type: integer
 *                 nullable: true
 *                 minimum: 1
 *                 maximum: 20
 *                 description: So lan lam bai toi da cua moi hoc sinh cho assignment nay. Dat null de khong gioi han
 *               status:
 *                 type: string
 *                 enum: [draft, open, closed]
 *     responses:
 *       200:
 *         description: Cap nhat thanh cong
 *       400:
 *         description: Du lieu cap nhat khong hop le
 *       403:
 *         description: Chi admin moi duoc dat schoolClassId=null
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

/**
 * @swagger
 * /assignments/{assignmentId}/questions:
 *   get:
 *     summary: Hoc sinh bat dau lam bai, tao session va lay cau hoi (an dap an)
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
 *       201:
 *         description: Tao session thanh cong va tra ve danh sach cau hoi kem thong tin countdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 serverNow:
 *                   type: string
 *                   format: date-time
 *                 endsAt:
 *                   type: string
 *                   format: date-time
 *                 durationMinutes:
 *                   type: integer
 *                 attemptLimit:
 *                   type: integer
 *                 completedAttempts:
 *                   type: integer
 *                 remainingAttempts:
 *                   type: integer
 *                 questions:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Assignment khong tim thay hoac chua mo
 *       409:
 *         description: Chua den gio lam bai, da qua gio nop bai, assignment chua open, hoac da het so lan lam bai
 */
router.get('/:assignmentId/questions', getAssignmentQuestionsController);

/**
 * @swagger
 * /assignments/{assignmentId}/sessions/{sessionId}/questions:
 *   get:
 *     summary: Hoc sinh lay lai cau hoi va dap an da chon theo session
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Danh sach cau hoi va dap an da luu tam kem thong tin countdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 serverNow:
 *                   type: string
 *                   format: date-time
 *                 endsAt:
 *                   type: string
 *                   format: date-time
 *                 durationMinutes:
 *                   type: integer
 *                 selectedAnswers:
 *                   type: array
 *                   items:
 *                     type: object
 *                 questions:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Session khong ton tai hoac het han
 *       409:
 *         description: Chua den gio lam bai, da qua gio nop bai, assignment chua open, hoac session het han
 */
router.get('/:assignmentId/sessions/:sessionId/questions', getAssignmentSessionQuestionsController);

/**
 * @swagger
 * /assignments/{assignmentId}/sessions/{sessionId}/answers:
 *   put:
 *     summary: Luu dap an da chon tam thoi theo session
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: sessionId
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
 *               - answers
 *             properties:
 *               answers:
 *                 type: array
 *                 description: Danh sach dap an tam can luu cho session hien tai
 *                 items:
 *                   type: object
 *                   required:
 *                     - questionId
 *                     - userAnswer
 *                   properties:
 *                     questionId:
 *                       type: string
 *                       description: _id cua cau hoi trong `questions` response khi start/resume session
 *                     userAnswer:
 *                       oneOf:
 *                         - type: integer
 *                         - type: string
 *                         - type: array
 *                         - type: object
 *                       description: Gia tri dap an hoc sinh chon (index hoac text tuy question type)
 *           example:
 *             answers:
 *               - questionId: "69ead343616cda740b792768"
 *                 userAnswer: 1
 *     responses:
 *       200:
 *         description: Luu dap an tam thanh cong
 *       400:
 *         description: answers khong hop le hoac co questionId khong thuoc session
 *       404:
 *         description: Assignment/session khong ton tai hoac da het han
 */
router.put('/:assignmentId/sessions/:sessionId/answers', saveAssignmentSessionAnswersController);

/**
 * @swagger
 * /assignments/{assignmentId}/sessions/{sessionId}/submit:
 *   post:
 *     summary: Hoc sinh nop bai theo session
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: sessionId
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
 *               answers:
 *                 type: array
 *                 description: |
 *                   Danh sach dap an gui len khi nop bai.
 *                   Neu khong gui `answers`, he thong se dung `selectedAnswers` da luu trong session.
 *                 items:
 *                   type: object
 *                   required:
 *                     - questionId
 *                     - userAnswer
 *                   properties:
 *                     questionId:
 *                       type: string
 *                     userAnswer:
 *                       oneOf:
 *                         - type: integer
 *                         - type: string
 *                         - type: array
 *                         - type: object
 *           examples:
 *             submit_with_answers:
 *               summary: Nop bai kem answers trong request
 *               value:
 *                 answers:
 *                   - questionId: "69ead343616cda740b792768"
 *                     userAnswer: 1
 *             submit_from_saved_answers:
 *               summary: Nop bai bang answers da luu truoc do trong session
 *               value: {}
 *     responses:
 *       201:
 *         description: Nop bai thanh cong
 *       400:
 *         description: answers khong hop le hoac rong
 *       404:
 *         description: Assignment hoac session khong hop le
 *       409:
 *         description: Da het so lan lam bai cho phep
 */
router.post('/:assignmentId/sessions/:sessionId/submit', submitAssignmentController);

/**
 * @swagger
 * /assignments/{assignmentId}/my-attempt:
 *   get:
 *     summary: Hoc sinh xem lai tat ca lan lam bai cua minh
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
 *         description: Danh sach cac lan lam bai (moi lan co createdAt)
 *       404:
 *         description: Chua lam bai nay
 */
router.get('/:assignmentId/my-attempt', getMyAttemptController);

export default router;
