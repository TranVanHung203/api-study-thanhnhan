import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { Server } from 'socket.io';
import DatabaseConfig from './src/config/databaseConfig.js';
import { errorHandler } from './src/errors/errorHandler.js';
//tranvanhung-demo.taochimuc
// Import models để đảm bảo tất cả schemas được register
import User from './src/models/user.schema.js';
import Class from './src/models/class.schema.js';
import SchoolClass from './src/models/schoolClass.schema.js';
import UserSchoolClass from './src/models/userSchoolClass.schema.js';
import Chapter from './src/models/chapter.schema.js';
import Lesson from './src/models/lesson.schema.js';
import Progress from './src/models/progress.schema.js';
import Video from './src/models/video.schema.js';
import Quiz from './src/models/quiz.schema.js';
import Question from './src/models/question.schema.js';
import UserActivity from './src/models/userActivity.schema.js';
import Reward from './src/models/reward.schema.js';
import RefreshToken from './src/models/refreshToken.schema.js';
import Character from './src/models/character.schema.js';
import RealtimeBattle from './src/models/realtimeBattle.schema.js';
import Topic from './src/models/topic.schema.js';
import PreferenceQuestion from './src/models/preferenceQuestion.schema.js';
//nhanhmoi
// Import routes mới
import authRoutes from './src/routes/authRoutes.js';
import classRoutes from './src/routes/classRoutes.js';
import schoolClassRoutes from './src/routes/schoolClassRoutes.js';
import chapterRoutes from './src/routes/chapterRoutes.js';
import lessonRoutes from './src/routes/lessonRoutes.js';
import progressRoutes from './src/routes/progressRoutes.js';
import videoRoutes from './src/routes/videoRoutes.js';
import quizNewRoutes from './src/routes/quizNewRoutes.js';
import questionRoutes from './src/routes/questionRoutes.js';
import quizAttemptRoutes from './src/routes/quizAttemptRoutes.js';
import activityRoutes from './src/routes/activityRoutes.js';
import rewardRoutes from './src/routes/rewardRoutes.js';
import characterRoutes from './src/routes/characterRoutes.js';
import ratingRoutes from './src/routes/ratingRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import quizAssignmentRoutes from './src/routes/quizAssignmentRoutes.js';
import chatbotRoutes from './src/chatbot/routes.js';
import realtimeBattleRoutes from './src/routes/realtimeBattleRoutes.js';
import { initBattleSocket } from './src/ws/battleSocket.js';
import { initAuthSocket } from './src/ws/authSocket.js';

// Import Swagger
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import expressStatic from 'express';
import os from 'os';

// Lấy IP LAN thật — loại bỏ adapter ảo theo tên VÀ dải IP VPN đã biết
function getLocalIP() {
  const interfaces = os.networkInterfaces();

  const VIRTUAL_NAME = /vmware|virtualbox|vbox|vethernet|ldplayer|hamachi|radmin|nordvpn|docker|loopback|pseudo|tap|tunnel|teredo|isatap/i;
  const REAL_NAME    = /^wi-fi|^ethernet|^local area connection|^wlan|^eth/i;

  // Dải IP của VPN/adapter ảo đã biết — loại bỏ tuyệt đối
  const BLOCKED_RANGES = [
    /^25\./,           // Radmin VPN / Hamachi
    /^26\./,           // Radmin VPN
    /^192\.168\.56\./, // VirtualBox Host-Only
    /^192\.168\.99\./, // VirtualBox alternate
    /^192\.168\.233\./, // VMware NAT
    /^172\.(1[6-9]|2\d|3[01])\./, // Docker bridge
  ];

  const realIPs     = [];
  const fallbackIPs = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const iface of addrs) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      if (VIRTUAL_NAME.test(name)) continue;
      const ip = iface.address;
      if (BLOCKED_RANGES.some(re => re.test(ip))) continue;
      if (REAL_NAME.test(name)) {
        realIPs.push(ip);
      } else {
        fallbackIPs.push(ip);
      }
    }
  }

  return realIPs[0] || fallbackIPs[0] || 'localhost';
}

// Import cleanup jobs
import { startCleanupJob, startExpiredGuestCleanup } from './src/jobs/cleanupJob.js';
import { startDailyDatabaseBackupOverwriteJob } from './src/jobs/databaseBackupJob.js';

const app = express();
const databaseConfig = new DatabaseConfig();

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: '*',  // Cho phép tất cả origin truy cập
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Kết nối đến cơ sở dữ liệu
databaseConfig.connect();

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const LOCAL_IP = getLocalIP();
const ZALO_CALLBACK_SCHEME = (process.env.ZALO_CALLBACK_SCHEME || 'easymathzalo').trim();
const ZALO_CALLBACK_PATH = (process.env.ZALO_CALLBACK_PATH || 'zalo-callback').trim().replace(/^\/+/, '');
const ZALO_MOBILE_DEEP_LINK =
  (process.env.ZALO_MOBILE_DEEP_LINK || '').trim() ||
  `${ZALO_CALLBACK_SCHEME}://${ZALO_CALLBACK_PATH}`;
const ZALO_WEB_REDIRECT_URL = (process.env.ZALO_WEB_REDIRECT_URL || '').trim();
const ZALO_CALLBACK_DEFAULT_TARGET = (process.env.ZALO_CALLBACK_DEFAULT_TARGET || 'auto').trim();

const normalizeZaloCallbackTarget = (value) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'auto') return '';

  if (['web', 'browser', 'desktop', 'flutter-web'].includes(normalized)) {
    return 'web';
  }
  if (['mobile', 'android', 'app', 'native', 'flutter-android'].includes(normalized)) {
    return 'mobile';
  }
  return '';
};

const extractZaloCallbackTargetFromState = (stateValue) => {
  if (typeof stateValue !== 'string') return '';
  const state = stateValue.trim();
  if (!state) return '';

  const lowered = state.toLowerCase();
  const prefixToTarget = [
    ['web_', 'web'],
    ['web-', 'web'],
    ['web:', 'web'],
    ['mobile_', 'mobile'],
    ['mobile-', 'mobile'],
    ['mobile:', 'mobile'],
    ['android_', 'mobile'],
    ['android-', 'mobile'],
    ['android:', 'mobile']
  ];
  for (const [prefix, target] of prefixToTarget) {
    if (lowered.startsWith(prefix)) return target;
  }

  const fromParams = (text) => {
    const params = new URLSearchParams(text);
    return normalizeZaloCallbackTarget(
      params.get('platform') || params.get('target') || params.get('client') || ''
    );
  };

  if (state.includes('=')) {
    const stateTarget = fromParams(state);
    if (stateTarget) return stateTarget;
  }

  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    if (decoded && decoded !== state) {
      const decodedTarget = fromParams(decoded);
      if (decodedTarget) return decodedTarget;
    }
  } catch (err) {
    // Ignore invalid base64url state.
  }

  return '';
};

const isMobileUserAgent = (userAgentValue) => {
  const userAgent = typeof userAgentValue === 'string' ? userAgentValue : '';
  return /android|iphone|ipad|ipod|mobile|iemobile|opera mini/i.test(userAgent);
};

const appendQueryToUrl = (baseUrl, query) => {
  if (!baseUrl) return '';
  try {
    const nextUrl = new URL(baseUrl);
    for (const [key, value] of query.entries()) {
      nextUrl.searchParams.set(key, value);
    }
    return nextUrl.toString();
  } catch (error) {
    return '';
  }
};

// Swagger configuration
// Không khai báo servers cố định — Swagger UI tự dùng host hiện tại
// => laptop/điện thoại/máy server đều gọi đúng IP mà không bị CORS
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'api-backend',
      version: '1.0.0',
      description: 'API dạy học online: quản lý khoá học, bài học, người dùng, quiz, thông báo...'
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Access Token - Lấy từ /auth/login'
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
          description: 'JWT stored in httpOnly cookie'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  // Chỉ định file routes nào sẽ hiển thị trên Swagger
  // Thêm/bớt file tùy ý
  apis: [
    './src/routes/authRoutes.js',
    './src/routes/userRoutes.js',
    //'./src/routes/chapterRoutes.js',
    './src/routes/classRoutes.js',
    './src/routes/schoolClassRoutes.js',
    // './src/routes/skillRoutes.js',
    './src/routes/progressRoutes.js',
    './src/routes/quizAttemptRoutes.js',
    // './src/routes/videoRoutes.js',
    './src/routes/quizNewRoutes.js',
    './src/routes/questionRoutes.js',
    './src/routes/characterRoutes.js',
      //'./src/routes/activityRoutes.js',
      './src/routes/ratingRoutes.js',
    // './src/routes/rewardRoutes.js',
    './src/routes/quizAssignmentRoutes.js',
    './src/routes/realtimeBattleRoutes.js'
  ],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger UI với filter
const swaggerUiOptions = {
  filter: true,                    // Bật thanh filter để tìm kiếm
  docExpansion: 'none',            // Thu gọn tất cả mặc định
  defaultModelsExpandDepth: -1,    // Ẩn phần Models
  operationsSorter: 'method'       // Sắp xếp: GET → POST → PUT → DELETE
};

// Serve static files (for swagger custom script)
app.use('/public', express.static(path.join(process.cwd(), 'public')));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.get('/battle-test', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'battle-test.html'));
});
app.get('/facebook-test', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'facebook-test.html'));
});
app.get('/zalo-test', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'zalo-test.html'));
});
app.get('/zalo-callback', (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const error = typeof req.query.error === 'string' ? req.query.error : '';
  const errorDescription =
    typeof req.query.error_description === 'string'
      ? req.query.error_description
      : (typeof req.query.message === 'string' ? req.query.message : '');

  const callbackQuery = new URLSearchParams();
  if (code) callbackQuery.set('code', code);
  if (state) callbackQuery.set('state', state);
  if (error) callbackQuery.set('error', error);
  if (errorDescription) callbackQuery.set('error_description', errorDescription);

  const queryTarget = normalizeZaloCallbackTarget(
    (typeof req.query.platform === 'string' && req.query.platform) ||
    (typeof req.query.target === 'string' && req.query.target) ||
    (typeof req.query.client === 'string' && req.query.client) ||
    ''
  );
  const stateTarget = extractZaloCallbackTargetFromState(state);
  const defaultTarget = normalizeZaloCallbackTarget(ZALO_CALLBACK_DEFAULT_TARGET);
  const callbackTarget =
    queryTarget ||
    stateTarget ||
    defaultTarget ||
    (isMobileUserAgent(req.headers['user-agent']) ? 'mobile' : 'web');

  const fallbackWebRedirect = `${req.protocol}://${req.get('host')}/zalo-test`;
  const webRedirectBase = ZALO_WEB_REDIRECT_URL || fallbackWebRedirect;
  const webRedirect = appendQueryToUrl(webRedirectBase, callbackQuery);
  const deepLink = appendQueryToUrl(ZALO_MOBILE_DEEP_LINK, callbackQuery);

  res.set('Cache-Control', 'no-store');
  if (callbackTarget === 'web' && webRedirect) {
    return res.redirect(302, webRedirect);
  }
  if (!deepLink) {
    return res.status(500).json({ message: 'Invalid Zalo callback redirect configuration' });
  }

  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Zalo Callback</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; background: #f6f9ff; color: #0f172a; }
    .card { max-width: 560px; margin: 24px auto; background: #fff; border: 1px solid #dbe4f2; border-radius: 12px; padding: 20px; }
    h1 { margin: 0 0 12px; font-size: 20px; }
    p { margin: 8px 0; line-height: 1.45; }
    .btn { display: inline-block; margin-top: 14px; padding: 10px 14px; border-radius: 8px; background: #0d74ff; color: #fff; text-decoration: none; }
    .hint { color: #475569; font-size: 13px; }
    code { word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Returning to mobile app...</h1>
    <p>If your app does not open automatically, click the button below.</p>
    <a id="openAppLink" class="btn" href="${deepLink}">Open app</a>
    <p class="hint">Deep link: <code id="deepLinkText"></code></p>
  </div>
  <script>
    (function () {
      const deepLink = ${JSON.stringify(deepLink)};
      const link = document.getElementById('openAppLink');
      const label = document.getElementById('deepLinkText');
      if (label) label.textContent = deepLink;
      if (link) link.href = deepLink;
      window.location.replace(deepLink);
    })();
  </script>
</body>
</html>`);
});

// Inject custom JS into Swagger UI to auto-attach access token
const swaggerUiOptionsWithCustom = Object.assign({}, swaggerUiOptions, {
  swaggerOptions: {
    // Add our custom script for swagger UI
    plugins: [],
    // Allow submit methods so endpoints are executable
    supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
    // This customJs will be loaded by swagger-ui-express when provided as an option
    // Note: swagger-ui-express supports `customJs` pointing to a path under the served static
    // We'll pass a relative URL so swagger-ui can load it.
  },
  customJs: '/public/swagger-custom.js'
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptionsWithCustom));

// Routes mới
app.use('/auth', authRoutes);
app.use('/classes', classRoutes);
app.use('/school-classes', schoolClassRoutes);
app.use('/chapters', chapterRoutes);
app.use('/lessons', lessonRoutes);
app.use('/progress', progressRoutes);
app.use('/videos', videoRoutes);
app.use('/quizzes', quizNewRoutes);
app.use('/questions', questionRoutes);
app.use('/quiz-attempts', quizAttemptRoutes);
app.use('/activities', activityRoutes);
app.use('/rewards', rewardRoutes);
app.use('/characters', characterRoutes);
app.use('/ratings', ratingRoutes);
app.use('/users', userRoutes);
app.use('/assignments', quizAssignmentRoutes);
app.use('/chatbot', chatbotRoutes);
app.use('/battle', realtimeBattleRoutes);

app.use(errorHandler);

// // Start cleanup jobs
// startCleanupJob();        // Xóa dữ liệu orphan mỗi giờ
// startExpiredGuestCleanup(); // Xóa guest hết hạn mỗi ngày lúc 3:00 AM

startDailyDatabaseBackupOverwriteJob();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

initBattleSocket(io);
initAuthSocket(io);

server.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`  Local (same machine) : http://127.0.0.1:${PORT}`);
  console.log(`  LDPlayer / Emulator  : http://10.0.2.2:${PORT}`);
  console.log(`  LAN (other devices)  : http://${LOCAL_IP}:${PORT}`);
  console.log(`  Swagger              : http://localhost:${PORT}/api-docs`);
  console.log(`  Battle Socket        : ws://localhost:${PORT}/battle`);
});
