import express from 'express';
import {
  registerController,
  loginController,
  refreshTokenController,
  changePasswordController,
  getUserController,
  logoutController
} from '../controllers/authController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Đăng ký tài khoản
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - fullName
 *             properties:
 *               username:
 *                 type: string
 *                 example: "student1"
 *               email:
 *                 type: string
 *                 example: "student1@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *               fullName:
 *                 type: string
 *                 example: "Nguyễn Văn A"
 *               classId:
 *                 type: string
 *                 description: "(Tùy chọn) Có thể được thiết lập sau bởi giáo viên hoặc tự động nâng cấp giống Duolingo"
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *       400:
 *         description: Thiếu thông tin hoặc username/email đã tồn tại
 */
router.post('/register', registerController);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Đăng nhập
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: "user123"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Đăng nhập thành công, trả về accessToken và refreshToken
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 accessToken:
 *                   type: string
 *                   description: Bearer token dùng cho các request tiếp theo
 *                 refreshToken:
 *                   type: string
 *                   description: Dùng để làm mới accessToken
 *                 user:
 *                   type: object
 */
router.post('/login', loginController);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Làm mới access token bằng refresh token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token nhận từ login
 *     responses:
 *       200:
 *         description: Access token mới
 */
router.post('/refresh', refreshTokenController);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Lấy thông tin user hiện tại
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin user
 *       401:
 *         description: Không có token hoặc token không hợp lệ
 */
router.get('/me', authToken, getUserController);

/**
 * @swagger
 * /auth/logout:
 *   get:
 *     summary: Đăng xuất
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 */
router.get('/logout', authToken, logoutController);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Đổi mật khẩu
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 example: "user123"
 *               newPassword:
 *                 type: string
 *                 example: "newPassword123"
 *               confirmPassword:
 *                 type: string
 *                 example: "newPassword123"
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Đổi mật khẩu thành công"
 *       400:
 *         description: Lỗi - mật khẩu không đúng hoặc không khớp
 *       401:
 *         description: Không có token hoặc token không hợp lệ
 */
router.post('/change-password', authToken, changePasswordController);

export default router;
