import express from 'express';
import {
  getOnlineUsersController,
  getStudentsController,
  createStudentByTeacherController,
  getTeacherManagedStudentsController,
  updateTeacherManagedStudentController,
  resetTeacherStudentPasswordController,
  removeStudentFromManagedClassController,
  exportStudentsByClassController,
  downloadStudentTemplateController,
  uploadBulkStudentsController,
  getBulkUploadAvatarJobStatusController
} from '../controllers/userController.js';
import { authToken } from '../middlewares/authMiddleware.js';
import upload from '../middlewares/upload.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /users/online:
 *   get:
 *     summary: Lay danh sach user dang online
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sach user dang online kem so phut dang online
 *       401:
 *         description: Chua xac thuc
 */
router.get('/online', getOnlineUsersController);

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
 *         multipart/form-data:
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
 *               fatherName:
 *                 type: string
 *                 nullable: true
 *                 example: Nguyen Van B
 *               fatherPhone:
 *                 type: string
 *                 nullable: true
 *                 example: 0901234567
 *               motherName:
 *                 type: string
 *                 nullable: true
 *                 example: Tran Thi C
 *               motherPhone:
 *                 type: string
 *                 nullable: true
 *                 example: 0912345678
 *               imageFile:
 *                 type: string
 *                 format: binary
 *                 description: Anh dai dien (optional), ho tro jpg/jpeg/png/webp/gif
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
router.post('/teacher/students', upload.single('imageFile'), createStudentByTeacherController);

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
 *         description: Tim theo userCode, fullName, username hoac email
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
 *               fatherName:
 *                 type: string
 *                 nullable: true
 *                 example: Nguyen Van B
 *               fatherPhone:
 *                 type: string
 *                 nullable: true
 *                 example: 0901234567
 *               motherName:
 *                 type: string
 *                 nullable: true
 *                 example: Tran Thi C
 *               motherPhone:
 *                 type: string
 *                 nullable: true
 *                 example: 0912345678
 *         multipart/form-data:
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
 *               fatherName:
 *                 type: string
 *                 nullable: true
 *                 example: Nguyen Van B
 *               fatherPhone:
 *                 type: string
 *                 nullable: true
 *                 example: 0901234567
 *               motherName:
 *                 type: string
 *                 nullable: true
 *                 example: Tran Thi C
 *               motherPhone:
 *                 type: string
 *                 nullable: true
 *                 example: 0912345678
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Anh dai dien moi (optional), ho tro jpg/jpeg/png/webp/gif
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
router.patch('/teacher/students/:studentId', upload.single('avatar'), updateTeacherManagedStudentController);

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
 * /users/teacher/students/{studentId}/school-classes/{schoolClassId}:
 *   delete:
 *     summary: Giao vien xoa hoc sinh khoi lop do minh quan ly
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
 *       - in: path
 *         name: schoolClassId
 *         required: true
 *         schema:
 *           type: string
 *         description: SchoolClass ID
 *     responses:
 *       200:
 *         description: Xoa hoc sinh khoi lop thanh cong
 *       400:
 *         description: studentId hoac schoolClassId khong hop le, hoac hoc sinh khong thuoc lop
 *       403:
 *         description: Giao vien khong duoc quan ly lop hoc nay
 *       404:
 *         description: Khong tim thay hoc sinh
 *       401:
 *         description: Chua xac thuc
 */
router.delete(
  '/teacher/students/:studentId/school-classes/:schoolClassId',
  removeStudentFromManagedClassController
);

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
 *     summary: Tai file mau Excel de import hoc sinh (co cot avatarCode)
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
 *     summary: Upload Excel + (tuy chon) ZIP avatar de tao/cap nhat hoc sinh hang loat
 *     tags: [Users]
 *     description: |
 *       Excel co the khai bao cot `avatarCode` (vi du `001`).
 *       Neu upload them `avatarZip`, he thong se tim anh theo ten file trung ma (vi du `001.jpg`, `001.png`),
 *       upload len Cloudinary va luu vao `avatarUrl`.
 *       Neu khong co `avatarZip` hoac khong tim thay anh tuong ung, `avatarUrl` se duoc dat `null`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolClassId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID cua lop hoc de gan hoc sinh
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
 *                 description: File Excel danh sach hoc sinh
 *               avatarZip:
 *                 type: string
 *                 format: binary
 *                 description: File archive anh dai dien (optional, ho tro .zip/.rar), ten file trung ma anh trong Excel (vi du 001.jpg)
 *     responses:
 *       200:
 *         description: Import thanh cong, tra ve ket qua chi tiet va thong ke avatar
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 total:
 *                   type: integer
 *                 created:
 *                   type: integer
 *                 updated:
 *                   type: integer
 *                 skipped:
 *                   type: integer
 *                 avatarUploaded:
 *                   type: integer
 *                 avatarMissing:
 *                   type: integer
 *                 avatarCleared:
 *                   type: integer
 *       400:
 *         description: File khong hop le hoac du lieu khong hop le
 *       403:
 *         description: Giao vien khong duoc quan ly lop duoc chi dinh
 *       401:
 *         description: Chua xac thuc
 */
router.post(
  '/teacher/students/bulk/upload/:schoolClassId',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'avatarZip', maxCount: 1 }
  ]),
  uploadBulkStudentsController
);

/**
 * @swagger
 * /users/teacher/students/bulk/upload/jobs/{jobId}:
 *   get:
 *     summary: Lay trang thai xu ly avatar job cua import bulk hoc sinh
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trang thai job hien tai
 *       404:
 *         description: Khong tim thay job
 *       401:
 *         description: Chua xac thuc
 */
router.get('/teacher/students/bulk/upload/jobs/:jobId', getBulkUploadAvatarJobStatusController);

export default router;
