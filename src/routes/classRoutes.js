import express from 'express';
import {
  getAllClassesController,
  getClassByIdController,
  createClassController,
  updateClassController,
  deleteClassController,
  addStudentToClassController,
  removeStudentFromClassController
} from '../controllers/classController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Tất cả routes đều cần authentication
router.all('*', authToken);

/**
 * @swagger
 * /classes:
 *   get:
 *     summary: Lấy danh sách tất cả lớp
 *     tags: [Class]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách lớp
 */
router.get('/', getAllClassesController);

/**
 * @swagger
 * /classes/{id}:
 *   get:
 *     summary: Lấy chi tiết lớp và danh sách học viên
 *     tags: [Class]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thông tin lớp
 *       404:
 *         description: Lớp không tồn tại
 */
router.get('/:id', getClassByIdController);

/**
 * @swagger
 * /classes:
 *   post:
 *     summary: Tạo lớp mới
 *     tags: [Class]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Lớp Tiếng Anh A1"
 *               description:
 *                 type: string
 *                 example: "Lớp học tiếng Anh cho người mới bắt đầu"
 *               level:
 *                 type: string
 *                 example: "A1"
 *     responses:
 *       201:
 *         description: Tạo lớp thành công
 */
router.post('/', createClassController);

/**
 * @swagger
 * /classes/{id}:
 *   put:
 *     summary: Cập nhật thông tin lớp
 *     tags: [Class]
 *     security:
 *       - bearerAuth: []
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               level:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật lớp thành công
 */
router.put('/:id', updateClassController);

/**
 * @swagger
 * /classes/{id}:
 *   delete:
 *     summary: Xóa lớp
 *     tags: [Class]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa lớp thành công
 */
router.delete('/:id', deleteClassController);

/**
 * @swagger
 * /classes/add-student:
 *   post:
 *     summary: Thêm học viên vào lớp
 *     tags: [Class]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - classId
 *               - userId
 *             properties:
 *               classId:
 *                 type: string
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thêm học viên thành công
 */
router.post('/add-student', addStudentToClassController);

/**
 * @swagger
 * /classes/remove-student:
 *   post:
 *     summary: Xóa học viên khỏi lớp
 *     tags: [Class]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Xóa học viên thành công
 */
router.post('/remove-student', removeStudentFromClassController);

export default router;
