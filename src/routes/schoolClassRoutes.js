import express from 'express';
import {
  getAllSchoolClassesController,
  getSchoolClassByIdController,
  createSchoolClassController,
  updateSchoolClassController,
  deleteSchoolClassController,
  addStudentToSchoolClassController,
  assignSchoolClassToUserController,
  removeStudentFromSchoolClassController
} from '../controllers/schoolClassController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /school-classes:
 *   get:
 *     summary: Lay danh sach lop thuc
 *     tags: [SchoolClass]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lay danh sach lop thuc thanh cong
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lay danh sach lop thuc thanh cong
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 680627760d7f1dc29b04c1da
 *                       className:
 *                         type: string
 *                         example: Lop 10A1
 *       401:
 *         description: Chua xac thuc
 */
router.get('/', getAllSchoolClassesController);

/**
 * @swagger
 * /school-classes/assign-user:
 *   post:
 *     summary: Gan schoolClassId cho user theo userId
 *     description: Luu quan he vao bang rieng UserSchoolClass. Truyen schoolClassId = null de go bo toan bo quan he lop cua user
 *     tags: [SchoolClass]
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
 *                 example: 680627760d7f1dc29b04c200
 *               schoolClassId:
 *                 type: string
 *                 nullable: true
 *                 example: 680627760d7f1dc29b04c1da
 *     responses:
 *       200:
 *         description: Gan hoac go bo quan he user-lop thanh cong
 *       400:
 *         description: userId hoac schoolClassId khong hop le
 *       404:
 *         description: User hoac lop thuc khong ton tai
 *       401:
 *         description: Chua xac thuc
 */
router.post('/assign-user', assignSchoolClassToUserController);

/**
 * @swagger
 * /school-classes/{id}:
 *   get:
 *     summary: Lay chi tiet lop thuc
 *     tags: [SchoolClass]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: SchoolClass ID
 *     responses:
 *       200:
 *         description: Lay chi tiet lop thuc thanh cong
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lay chi tiet lop thuc thanh cong
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 680627760d7f1dc29b04c1da
 *                     className:
 *                       type: string
 *                       example: Lop 10A1
 *                     students:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 680627760d7f1dc29b04c200
 *                           fullName:
 *                             type: string
 *                             example: Nguyen Van A
 *                           email:
 *                             type: string
 *                             nullable: true
 *                             example: student1@example.com
 *                           roles:
 *                             type: array
 *                             items:
 *                               type: string
 *                           classId:
 *                             type: string
 *                             nullable: true
 *       400:
 *         description: id khong hop le
 *       404:
 *         description: Lop thuc khong ton tai
 *       401:
 *         description: Chua xac thuc
 */
router.get('/:id', getSchoolClassByIdController);

/**
 * @swagger
 * /school-classes:
 *   post:
 *     summary: Tao lop thuc moi (vi du 10A1, 11B2)
 *     tags: [SchoolClass]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - className
 *             properties:
 *               className:
 *                 type: string
 *                 example: Lop 10A1
 *     responses:
 *       201:
 *         description: Tao lop thuc thanh cong
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tao lop thuc thanh cong
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 680627760d7f1dc29b04c1da
 *                     className:
 *                       type: string
 *                       example: Lop 10A1
 *       400:
 *         description: className la bat buoc
 *       401:
 *         description: Chua xac thuc
 */
router.post('/', createSchoolClassController);

/**
 * @swagger
 * /school-classes/{id}:
 *   put:
 *     summary: Cap nhat lop thuc
 *     tags: [SchoolClass]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: SchoolClass ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               className:
 *                 type: string
 *                 example: Lop 10A2
 *     responses:
 *       200:
 *         description: Cap nhat lop thuc thanh cong
 *       400:
 *         description: id khong hop le
 *       404:
 *         description: Lop thuc khong ton tai
 *       401:
 *         description: Chua xac thuc
 */
router.put('/:id', updateSchoolClassController);

/**
 * @swagger
 * /school-classes/{id}:
 *   delete:
 *     summary: Xoa lop thuc
 *     tags: [SchoolClass]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: SchoolClass ID
 *     responses:
 *       200:
 *         description: Xoa lop thuc thanh cong
 *       400:
 *         description: id khong hop le
 *       404:
 *         description: Lop thuc khong ton tai
 *       401:
 *         description: Chua xac thuc
 */
router.delete('/:id', deleteSchoolClassController);

/**
 * @swagger
 * /school-classes/{id}/students:
 *   post:
 *     summary: Them user vao lop thuc (luu bang UserSchoolClass)
 *     tags: [SchoolClass]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: SchoolClass ID
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
 *                 example: 680627760d7f1dc29b04c200
 *     responses:
 *       200:
 *         description: Them user vao lop thuc thanh cong hoac da ton tai
 *       400:
 *         description: id hoac userId khong hop le
 *       404:
 *         description: Lop thuc hoac user khong ton tai
 *       401:
 *         description: Chua xac thuc
 */
router.post('/:id/students', addStudentToSchoolClassController);

/**
 * @swagger
 * /school-classes/{id}/students/{userId}:
 *   delete:
 *     summary: Xoa user khoi lop thuc (xoa quan he trong UserSchoolClass)
 *     tags: [SchoolClass]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: SchoolClass ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Xoa hoc sinh khoi lop thuc thanh cong
 *       400:
 *         description: id hoac userId khong hop le, hoac hoc sinh khong thuoc lop nay
 *       404:
 *         description: User khong ton tai
 *       401:
 *         description: Chua xac thuc
 */
router.delete('/:id/students/:userId', removeStudentFromSchoolClassController);

export default router;
