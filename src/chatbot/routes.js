import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {
  uploadDocumentsController,
  listDocumentsController,
  sendChatMessageController,
  listConversationsController,
  getConversationMessagesController
} from './controller.js';

const CHATBOT_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'chatbot-documents');
const ALLOWED_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.log',
  '.pdf',
  '.docx'
]);

fs.mkdirSync(CHATBOT_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, CHATBOT_UPLOAD_DIR);
  },
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const safeBaseName = path
      .basename(file.originalname || 'document', extension)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 50);
    callback(null, `${Date.now()}-${safeBaseName}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_EXTENSIONS.has(extension)) {
      callback(null, true);
      return;
    }

    const error = new Error(`Unsupported file extension: ${extension || 'unknown'}`);
    error.statusCode = 400;
    callback(error);
  }
});

const router = express.Router();

router.post('/documents/upload', upload.array('files', 20), uploadDocumentsController);
router.get('/documents', listDocumentsController);
router.get('/conversations', listConversationsController);
router.get('/conversations/:conversationId/messages', getConversationMessagesController);
router.post('/chat/send', sendChatMessageController);

export default router;
