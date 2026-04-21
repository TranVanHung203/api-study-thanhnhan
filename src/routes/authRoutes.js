import express from 'express';
import {
  loginController,
  refreshTokenController,
  forgotPasswordController,
  resetPasswordController,
  changePasswordController,
  getUserController,
  logoutController,
  guestLoginController,
  deleteGuestController,
  sendOTPForConvertController,
  verifyOTPAndConvertController
  , googleTokenController
  , facebookTokenController
  , zaloTokenController
  , zaloCodeController
  , changeFullNameController
  , changeFullNameAndAttachCharacterController
  , sendOTPForRegisterController
  , verifyOTPAndRegisterController
  , setShowCaseViewController
} from '../controllers/authController.js';
import { authToken, requireGuest } from '../middlewares/authMiddleware.js';

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
 * /auth/forgot-password:
 *   post:
 *     summary: Gui OTP de quen mat khau
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "student1@example.com"
 *     responses:
 *       200:
 *         description: Tra ve thanh cong va gui OTP neu email ton tai
 *       400:
 *         description: Email khong hop le
 */
router.post('/forgot-password', forgotPasswordController);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Dat lai mat khau bang OTP
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               email:
 *                 type: string
 *                 example: "student1@example.com"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               newPassword:
 *                 type: string
 *                 example: "newPassword123"
 *               confirmPassword:
 *                 type: string
 *                 example: "newPassword123"
 *     responses:
 *       200:
 *         description: Dat lai mat khau thanh cong
 *       400:
 *         description: OTP khong hop le, het han, hoac validation that bai
 */
router.post('/reset-password', resetPasswordController);

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
 *               gender:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: Gioi tinh (0 hoặc 1), khong bat buoc
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

/**
 * @swagger
 * /auth/facebook/token:
 *   post:
 *     summary: Sign in with Facebook access token (Web/Android)
 *     tags: [Auth]
 *     description: >-
 *       Exchange a Facebook access token for the application's `accessToken` and `refreshToken`.
 *       Use this endpoint for both Web Facebook Login and Android Facebook SDK Login.
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
 *                 description: Facebook User Access Token
 *               fullName:
 *                 type: string
 *                 description: Optional fallback fullName when Facebook payload omits name
 *           examples:
 *             webExample:
 *               summary: Web request
 *               value:
 *                 token: "EAABsbCS1iHgBO..."
 *             androidExample:
 *               summary: Android request
 *               value:
 *                 token: "EAAaYpo6N7f8BO..."
 *     responses:
 *       200:
 *         description: Sign-in successful, returns application tokens and user info
 *       400:
 *         description: Missing token
 *       401:
 *         description: Invalid or expired Facebook token
 */
router.post('/facebook/token', facebookTokenController);

/**
 * @swagger
 * /auth/zalo/token:
 *   post:
 *     summary: Sign in with Zalo access token (Web/Android/Flutter)
 *     tags: [Auth]
 *     description: >-
 *       Exchange a Zalo user access token for the application's `accessToken` and `refreshToken`.
 *       Use this endpoint for Web/Android/Flutter Zalo Login after the client obtains Zalo access token.
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
 *                 description: Zalo User Access Token
 *               fullName:
 *                 type: string
 *                 description: Optional fallback fullName when Zalo payload omits name
 *           examples:
 *             mobileExample:
 *               summary: Android / Flutter request
 *               value:
 *                 token: "M3x2f...zalo_access_token..."
 *     responses:
 *       200:
 *         description: Sign-in successful, returns application tokens and user info
 *       400:
 *         description: Missing token
 *       401:
 *         description: Invalid or expired Zalo token
 */
router.post('/zalo/token', zaloTokenController);

/**
 * @swagger
 * /auth/zalo/code:
 *   post:
 *     summary: Sign in with Zalo OAuth code (Web redirect flow)
 *     tags: [Auth]
 *     description: >-
 *       Exchange Zalo OAuth authorization code to Zalo access token, then issue application tokens.
 *       This endpoint is recommended for Web redirect flow.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: OAuth authorization code from Zalo redirect callback
 *               redirectUri:
 *                 type: string
 *                 description: Redirect URI used in OAuth request (optional but recommended)
 *               fullName:
 *                 type: string
 *                 description: Optional fallback fullName if Zalo profile omits name
 *           examples:
 *             webExample:
 *               summary: Web callback exchange
 *               value:
 *                 code: "2vQf3..."
 *                 redirectUri: "https://your-domain.com/zalo-test"
 *     responses:
 *       200:
 *         description: Sign-in successful, returns application tokens and user info
 *       400:
 *         description: Missing code or server Zalo config
 *       401:
 *         description: Invalid or expired Zalo OAuth code
 */
router.post('/zalo/code', zaloCodeController);

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

/**
 * @swagger
 * /auth/guest/convert:
 *   post:
 *     summary: Gửi OTP để chuyển tài khoản khách thành user thường
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
 *               - username
 *               - email
 *               - password
 *               - fullName
 *             properties:
 *               username:
 *                 type: string
 *                 example: "newuser123"
 *               email:
 *                 type: string
 *                 example: "newuser@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *               fullName:
 *                 type: string
 *                 example: "Nguyễn Văn A"
 *     responses:
 *       200:
 *         description: OTP đã được gửi đến email
 *       400:
 *         description: Thiếu thông tin, mật khẩu ngắn, email không hợp lệ, hoặc username/email đã tồn tại
 *       401:
 *         description: Chưa xác thực
 */
router.post('/guest/convert', authToken, requireGuest, sendOTPForConvertController);

/**
 * @swagger
 * /auth/guest/convert/verify:
 *   post:
 *     summary: Xác thực OTP và hoàn tất chuyển đổi tài khoản khách thành user thường
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
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 example: "newuser@example.com"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Chuyển đổi thành công, dữ liệu học tập được giữ nguyên
 *       400:
 *         description: OTP không hợp lệ hoặc đã hết hạn
 *       401:
 *         description: Chưa xác thực
 */
router.post('/guest/convert/verify', authToken, requireGuest, verifyOTPAndConvertController);

/**
 * @swagger
 * /auth/set-showcase-view:
 *   post:
 *     summary: Bật chế độ xem showcase cho user
 *     description: Đánh dấu isShowCaseView = true cho user hiện tại. Tạo field nếu chưa có, cập nhật nếu đã có.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Cập nhật isShowCaseView thành công"
 *                 isShowCaseView:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Chưa xác thực
 */
router.post('/set-showcase-view', authToken, setShowCaseViewController);

export default router;
