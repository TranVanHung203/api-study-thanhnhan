import express from 'express';
import {
  createCharacterController,
  updateCharacterController,
  deleteCharacterController,
  listCharactersController,
  attachCharacterToUserController,
  detachCharacterFromUserController
} from '../controllers/characterController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// /**
//  * @swagger
//  * /characters:
//  *   post:
//  *     summary: Tạo một character mới
//  *     tags: [Characters]
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - name
//  *               - url
//  *             properties:
//  *               name:
//  *                 type: string
//  *                 example: "Mascot A"
//  *               url:
//  *                 type: string
//  *                 example: "https://cdn.example.com/mascot-a.png"
//  *     responses:
//  *       201:
//  *         description: Created
//  */
// router.post('/', authToken, createCharacterController);

/**
 * @swagger
 * /characters:
 *   get:
 *     summary: Lấy danh sách tất cả characters
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách characters
 */
router.get('/', authToken, listCharactersController);

// /**
//  * @swagger
//  * /characters/{id}:
//  *   put:
//  *     summary: Cập nhật character (chỉ owner)
//  *     tags: [Characters]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *     requestBody:
//  *       required: false
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               name:
//  *                 type: string
//  *               url:
//  *                 type: string
//  *     responses:
//  *       200:
//  *         description: Updated
//  */
// router.put('/:id', authToken, updateCharacterController);

// /**
//  * @swagger
//  * /characters/{id}:
//  *   delete:
//  *     summary: Xóa character (chỉ owner)
//  *     tags: [Characters]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Deleted
//  */
// router.delete('/:id', authToken, deleteCharacterController);

/**
 * @swagger
 * /characters/attach:
 *   post:
 *     summary: Gắn character vào user hiện tại (lưu giá trị vào `characterUrl`)
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - characterId
 *             properties:
 *               characterId:
 *                 type: string
 *                 example: "63f1a2b4e1d2f3a4b5c6d7e8"
 *     responses:
 *       200:
 *         description: Attached
 */
router.post('/attach', authToken, attachCharacterToUserController);

/**
 * @swagger
 * /characters/detach:
 *   post:
 *     summary: Bỏ gắn character khỏi user hiện tại (xóa nếu `characterUrl` trùng khớp)
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 example: "https://cdn.example.com/mascot-a.png"
 *     responses:
 *       200:
 *         description: Detached
 */
router.post('/detach', authToken, detachCharacterFromUserController);

export default router;
