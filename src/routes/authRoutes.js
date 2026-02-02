import express from 'express';
import {

  loginController,
  refreshTokenController,
  changePasswordController,
  getUserController,
  logoutController,
  guestLoginController,
  deleteGuestController,
  convertGuestToUserController
  , googleTokenController
  , changeFullNameController
  , changeFullNameAndAttachCharacterController
  , sendOTPForRegisterController
  , verifyOTPAndRegisterController
} from '../controllers/authController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();



/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Gửi OTP để đăng ký tài khoản
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
 *                 example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: OTP đã được gửi thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 email:
 *                   type: string
 *       400:
 *         description: Lỗi validation hoặc username/email đã tồn tại
 */
router.post('/register', sendOTPForRegisterController);

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Xác thực OTP và hoàn tất đăng ký
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 example: "student1@example.com"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   type: object
 *       400:
 *         description: Mã OTP không hợp lệ hoặc đã hết hạn
 */
router.post('/verify-otp', verifyOTPAndRegisterController);

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
 *                 example: "admin"
 *               password:
 *                 type: string
 *                 example: "admin"
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
 *     summary: Làm mới access token và refresh token
 *     description: |
 *       Khi refresh token còn hợp lệ, hệ thống sẽ:
 *       1. Kiểm tra refresh token trong database
 *       2. Revoke refresh token cũ
 *       3. Tạo cả access token và refresh token mới
 *       4. Trả về cả 2 token mới
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
 *         description: Access token và refresh token mới
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Refresh token thành công
 *                 accessToken:
 *                   type: string
 *                   description: Access token mới (15 phút)
 *                 refreshToken:
 *                   type: string
 *                   description: Refresh token mới (7 ngày)
 *       401:
 *         description: Refresh token không hợp lệ hoặc đã hết hạn
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

// /**
//  * @swagger
//  * /auth/change-password:
//  *   post:
//  *     summary: Đổi mật khẩu
//  *     tags: [Auth]
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - oldPassword
//  *               - newPassword
//  *               - confirmPassword
//  *             properties:
//  *               oldPassword:
//  *                 type: string
//  *                 example: "user123"
//  *               newPassword:
//  *                 type: string
//  *                 example: "newPassword123"
//  *               confirmPassword:
//  *                 type: string
//  *                 example: "newPassword123"
//  *     responses:
//  *       200:
//  *         description: Đổi mật khẩu thành công
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 message:
//  *                   type: string
//  *                   example: "Đổi mật khẩu thành công"
//  *       400:
//  *         description: Lỗi - mật khẩu không đúng hoặc không khớp
//  *       401:
//  *         description: Không có token hoặc token không hợp lệ
//  */
// router.post('/change-password', authToken, changePasswordController);

// /**
//  * @swagger
//  * /auth/change-fullname:
//  *   post:
//  *     summary: Đổi tên đầy đủ (fullName)
//  *     tags: [Auth]
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - fullName
//  *             properties:
//  *               fullName:
//  *                 type: string
//  *                 example: "Nguyễn Văn B"
//  *     responses:
//  *       200:
//  *         description: Cập nhật tên thành công
//  */
// router.post('/change-fullname', authToken, changeFullNameController);
/**
 * @swagger
 * /auth/change-fullname-and-attach:
 *   post:
 *     summary: Đổi tên và gán character cùng lúc
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
 *               - fullName
 *               - characterId
 *             properties:
 *               fullName:
 *                 type: string
 *               characterId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật tên và gán character thành công
 */
router.post('/change-fullname-and-attach', authToken, changeFullNameAndAttachCharacterController);

/**
 * @swagger
 * /auth/guest:
 *   post:
 *     summary: Đăng nhập khách (không cần username/password)
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Khách Vãng Lai"
 *                 description: Tên hiển thị của khách
 *     responses:
 *       201:
 *         description: Đăng nhập khách thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 accessToken:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     isGuest:
 *                       type: boolean
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       description: Thời gian tài khoản khách hết hạn (7 ngày)
 */
router.post('/guest', guestLoginController);


/**
 * @swagger
 * /auth/google/token:
 *   post:
 *     summary: Sign in with Google token (auto-detect idToken or accessToken)
 *     tags: [Auth]
 *     description: >-
 *       Exchange a Google token for the application's `accessToken` and `refreshToken`.
 *       
 *       Send a single `token` field - the backend will auto-detect the token type:
 *       - **idToken** (JWT format): Used for Android/iOS - verified via Google Auth Library
 *       - **accessToken** (starts with `ya29.`): Used for Web - fetches user info from Google API
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: >-
 *                   Google token from sign-in flow. Can be either:
 *                   - idToken (JWT) from Android/iOS GoogleSignIn
 *                   - accessToken (ya29...) from Web OAuth2 flow
 *           examples:
 *             androidExample:
 *               summary: Android / iOS request (idToken)
 *               value:
 *                 token: "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij..."
 *             webExample:
 *               summary: Web request (accessToken)
 *               value:
 *                 token: "ya29.a0AfH6SMBx..."
 *     responses:
 *       200:
 *         description: Sign-in successful, returns application tokens and user info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 accessToken:
 *                   type: string
 *                   description: Application JWT access token (NOT Google token)
 *                 refreshToken:
 *                   type: string
 *                   description: Application refresh token
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     avatar:
 *                       type: string
 *                     provider:
 *                       type: string
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Missing token
 *       401:
 *         description: Invalid or expired Google token
 */
router.post('/google/token', googleTokenController);

// // Firebase route removed - using Google ID token verification (Google-only flow)

// /**
//  * @swagger
//  * /auth/guest:
//  *   delete:
//  *     summary: Xóa tài khoản khách và tất cả dữ liệu liên quan
//  *     tags: [Auth]
//  *     security:
//  *       - bearerAuth: []
//  *     responses:
//  *       200:
//  *         description: Xóa tài khoản khách thành công
//  *       400:
//  *         description: Chỉ có thể xóa tài khoản khách
//  */
// router.delete('/guest', authToken, deleteGuestController);

// /**
//  * @swagger
//  * /auth/guest/convert:
//  *   post:
//  *     summary: Chuyển tài khoản khách thành user thường (giữ nguyên dữ liệu học tập)
//  *     tags: [Auth]
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - username
//  *               - email
//  *               - password
//  *             properties:
//  *               username:
//  *                 type: string
//  *                 example: "newuser123"
//  *               email:
//  *                 type: string
//  *                 example: "newuser@example.com"
//  *               password:
//  *                 type: string
//  *                 example: "password123"
//  *     responses:
//  *       200:
//  *         description: Chuyển đổi thành công, dữ liệu học tập được giữ nguyên
//  *       400:
//  *         description: Tài khoản đã là user thường hoặc username/email đã tồn tại
//  */
// router.post('/guest/convert', authToken, convertGuestToUserController);

export default router;
