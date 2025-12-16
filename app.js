import express from 'express';
import cors from 'cors';
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import DatabaseConfig from './src/config/databaseConfig.js';
import { errorHandler } from './src/errors/errorHandler.js';
//tranvanhung-demo
// Import models để đảm bảo tất cả schemas được register
import User from './src/models/user.schema.js';
import Class from './src/models/class.schema.js';
import Chapter from './src/models/chapter.schema.js';
import Skill from './src/models/skill.schema.js';
import Progress from './src/models/progress.schema.js';
import Video from './src/models/video.schema.js';
import Exercise from './src/models/exercise.schema.js';
import Quiz from './src/models/quiz.schema.js';
import Question from './src/models/question.schema.js';
import UserActivity from './src/models/userActivity.schema.js';
import Reward from './src/models/reward.schema.js';
import RefreshToken from './src/models/refreshToken.schema.js';

// Import routes mới
import authRoutes from './src/routes/authRoutes.js';
import classRoutes from './src/routes/classRoutes.js';
import chapterRoutes from './src/routes/chapterRoutes.js';
import skillRoutes from './src/routes/skillRoutes.js';
import progressRoutes from './src/routes/progressRoutes.js';
import videoRoutes from './src/routes/videoRoutes.js';
import exerciseRoutes from './src/routes/exerciseRoutes.js';
import quizNewRoutes from './src/routes/quizNewRoutes.js';
import questionRoutes from './src/routes/questionRoutes.js';
import activityRoutes from './src/routes/activityRoutes.js';
import rewardRoutes from './src/routes/rewardRoutes.js';

// Import Swagger
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import expressStatic from 'express';

// Import cleanup jobs
import { startCleanupJob, startExpiredGuestCleanup } from './src/jobs/cleanupJob.js';

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

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'api-backend',
      version: '1.0.0',
      description: 'API dạy học online: quản lý khoá học, bài học, người dùng, quiz, thông báo...'
    },
    // Dynamically select the server shown in Swagger UI.
    // - In production set NODE_ENV=production (or set SWAGGER_SERVER_URL to an explicit URL).
    // - Locally the default will be http://localhost:5000.
    servers: [
      {
        url: process.env.SWAGGER_SERVER_URL || (process.env.NODE_ENV === 'production' ? 'https://api-study-thanhnhan.onrender.com' : 'http://localhost:5000'),
        description: process.env.SWAGGER_SERVER_URL ? 'Configured server' : (process.env.NODE_ENV === 'production' ? 'Production server' : 'Local server')
      }
    ],
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
    './src/routes/chapterRoutes.js',
    // './src/routes/classRoutes.js',
    // './src/routes/skillRoutes.js',
    './src/routes/progressRoutes.js',
    // './src/routes/videoRoutes.js',
    // './src/routes/exerciseRoutes.js',
    // './src/routes/quizNewRoutes.js',
     './src/routes/questionRoutes.js',
    //  './src/routes/activityRoutes.js',
    // './src/routes/rewardRoutes.js',
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
app.use('/chapters', chapterRoutes);
app.use('/skills', skillRoutes);
app.use('/progress', progressRoutes);
app.use('/videos', videoRoutes);
app.use('/exercises', exerciseRoutes);
app.use('/quizzes', quizNewRoutes);
app.use('/questions', questionRoutes);
app.use('/activities', activityRoutes);
app.use('/rewards', rewardRoutes);

app.use(errorHandler);

// Start cleanup jobs
startCleanupJob();        // Xóa dữ liệu orphan mỗi giờ
startExpiredGuestCleanup(); // Xóa guest hết hạn mỗi ngày lúc 3:00 AM

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
