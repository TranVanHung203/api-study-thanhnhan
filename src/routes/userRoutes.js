import express from 'express';
import {
  getStudentsController,
  createStudentByTeacherController,
  getTeacherManagedStudentsController,
  updateTeacherManagedStudentController,
  resetTeacherStudentPasswordController,
  exportStudentsByClassController,
  downloadStudentTemplateController,
  uploadBulkStudentsController
} from '../controllers/userController.js';
import { authToken } from '../middlewares/authMiddleware.js';
import upload from '../middlewares/upload.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /users/students:
 *   get:
 *     summary: Lay danh sach user co role student/researchobject (phan trang)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Danh sach student/researchobject (chi gom fullName, email)
 *       401:
 *         description: Khong co token hoac token khong hop le
 */
router.get('/students', getStudentsController);

/**
 * @swagger
 * /users/teacher/students:
 *   post:
 *     summary: Giao vien tao tai khoan hoc sinh trong lop minh quan ly
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - fullName
 *               - schoolClassId
 *             properties:
 *               username:
 *                 type: string
 *                 example: student_a01
 *               password:
 *                 type: string
 *                 example: 123456
 *               fullName:
 *                 type: string
 *                 example: Nguyen Van A
 *               gender:
 *                 type: integer
 *                 nullable: true
 *                 enum: [0, 1]
 *                 example: 1
 *               schoolClassId:
 *                 type: string
 *                 example: 680627760d7f1dc29b04c1da
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 example: 2010-09-15
 *               address:
 *                 type: string
 *                 nullable: true
 *                 example: 12 Nguyen Trai, Ha Noi
 *     responses:
 *       201:
 *         description: Tao tai khoan hoc sinh thanh cong
 *       400:
 *         description: Du lieu dau vao khong hop le hoac giao vien chua duoc gan lop quan ly
 *       403:
 *         description: Giao vien khong duoc quan ly lop duoc chon
 *       409:
 *         description: Username da ton tai
 *       401:
 *         description: Chua xac thuc
 */
router.post('/teacher/students', createStudentByTeacherController);

/**
 * @swagger
 * /users/teacher/students:
 *   get:
 *     summary: Giao vien xem danh sach hoc sinh do minh tao trong cac lop minh quan ly
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: schoolClassId
 *         required: false
 *         schema:
 *           type: string
 *         description: Loc theo mot lop cu the ma giao vien dang quan ly
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Tim theo fullName, username hoac email
 *     responses:
 *       200:
 *         description: Lay danh sach hoc sinh thanh cong
 *       400:
 *         description: Query khong hop le
 *       403:
 *         description: Giao vien khong co quyen xem lop duoc chi dinh
 *       401:
 *         description: Chua xac thuc
 */
router.get('/teacher/students', getTeacherManagedStudentsController);

/**
 * @swagger
 * /users/teacher/students/{studentId}:
 *   patch:
 *     summary: Giao vien cap nhat tung truong hoc sinh do minh tao trong lop minh quan ly
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID cua hoc sinh
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: student_a01_new
 *               password:
 *                 type: string
 *                 example: 12345678
 *               fullName:
 *                 type: string
 *                 example: Nguyen Van A Update
 *               gender:
 *                 type: integer
 *                 nullable: true
 *                 enum: [0, 1]
 *                 example: 0
 *               schoolClassId:
 *                 type: string
 *                 example: 680627760d7f1dc29b04c1da
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 example: 2010-10-10
 *               address:
 *                 type: string
 *                 nullable: true
 *                 example: 99 Le Loi, Da Nang
 *     responses:
 *       200:
 *         description: Cap nhat hoc sinh thanh cong
 *       400:
 *         description: Du lieu dau vao khong hop le
 *       403:
 *         description: Giao vien khong co quyen voi hoc sinh hoac lop duoc chi dinh
 *       404:
 *         description: Khong tim thay hoc sinh
 *       409:
 *         description: Username da ton tai
 *       401:
 *         description: Chua xac thuc
 */
router.patch('/teacher/students/:studentId', updateTeacherManagedStudentController);

/**
 * @swagger
 * /users/teacher/students/{studentId}/reset-password:
 *   patch:
 *     summary: Giao vien reset mat khau hoc sinh ve mac dinh
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID cua hoc sinh
 *     responses:
 *       200:
 *         description: Reset mat khau thanh cong
 *       400:
 *         description: studentId khong hop le
 *       403:
 *         description: Giao vien khong quan ly hoc sinh
 *       404:
 *         description: Khong tim thay hoc sinh
 *       401:
 *         description: Chua xac thuc
 */
router.patch('/teacher/students/:studentId/reset-password', resetTeacherStudentPasswordController);

/**
 * @swagger
 * /users/teacher/students/export:
 *   get:
 *     summary: Xuất Excel danh sách học sinh theo lớp
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: schoolClassId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID lớp học mà giáo viên đang quản lý
 *     responses:
 *       200:
 *         description: File Excel danh sách học sinh
 *       400:
 *         description: schoolClassId không hợp lệ
 *       403:
 *         description: Giáo viên không được quản lý lớp
 *       401:
 *         description: Chua xac thuc
 */
router.get('/teacher/students/export', exportStudentsByClassController);

/**
 * @swagger
 * /users/teacher/students/template/download:
 *   get:
 *     summary: Tải file mẫu Excel để import học sinh
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: File Excel mẫu
 *       401:
 *         description: Chua xac thuc
 */
router.get('/teacher/students/template/download', downloadStudentTemplateController);

/**
 * @swagger
 * /users/teacher/students/bulk/upload/{schoolClassId}:
 *   post:
 *     summary: Upload file Excel để tạo/cập nhật học sinh hàng loạt
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolClassId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lớp học để gán học sinh
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import thành công, trả về kết quả chi tiết
 *       400:
 *         description: File không hợp lệ hoặc dữ liệu không hợp lệ
 *       403:
 *         description: Giáo viên không được quản lý lớp được chỉ định
 *       401:
 *         description: Chua xac thuc
 */
router.post('/teacher/students/bulk/upload/:schoolClassId', upload.single('file'), uploadBulkStudentsController);

export default router;
