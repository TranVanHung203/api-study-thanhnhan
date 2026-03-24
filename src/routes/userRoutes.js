import express from 'express';
import { getStudentsController } from '../controllers/userController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /users/students:
 *   get:
 *     summary: Lay danh sach user co role student (phan trang)
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
 *         description: Danh sach student (chi gom fullName, email)
 *       401:
 *         description: Khong co token hoac token khong hop le
 */
router.get('/students', getStudentsController);

export default router;
