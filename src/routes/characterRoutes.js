import express from 'express';
import {
  listCharactersController,
  listCharacterStoreController,
  getCharacterByIdController,
  buyCharacterController,
  selectCharacterController,
  attachCharacterToUserController,
  detachCharacterFromUserController
} from '../controllers/characterController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * /characters:
 *   get:
 *     summary: Lay danh sach character mien phi (rewardPoints = 0)
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sach character mien phi
 */
router.get('/', authToken, listCharactersController);

/**
 * @swagger
 * /characters/store:
 *   get:
 *     summary: Lay danh sach tat ca character trong cua hang kem trang thai mua
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sach character store
 */
router.get('/store', authToken, listCharacterStoreController);

/**
 * @swagger
 * /characters/purchase/{characterId}:
 *   post:
 *     summary: Mua character bang reward points va gan luon character do cho user
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: characterId
 *         required: true
 *         schema:
 *           type: string
 *         description: Character id
 *     responses:
 *       200:
 *         description: Mua thanh cong
 *       400:
 *         description: Khong du diem hoac du lieu khong hop le
 */
router.post('/purchase/:characterId', authToken, buyCharacterController);

/**
 * @swagger
 * /characters/select/{characterId}:
 *   post:
 *     summary: Chon (doi) character cho user, chi duoc chon character da mua
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: characterId
 *         required: true
 *         schema:
 *           type: string
 *         description: Character id
 *     responses:
 *       200:
 *         description: Chon character thanh cong
 *       403:
 *         description: Chua mua character nen khong duoc chon
 */
router.post('/select/:characterId', authToken, selectCharacterController);

/**
 * @swagger
 * /characters/attach:
 *   post:
 *     summary: Route tuong thich cu, hanh vi nhu /characters/select (yeu cau da mua)
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
 *     responses:
 *       200:
 *         description: Gan character thanh cong
 */
router.post('/attach', authToken, attachCharacterToUserController);

/**
 * @swagger
 * /characters/detach:
 *   post:
 *     summary: Bo character dang gan khoi user hien tai
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
 *     responses:
 *       200:
 *         description: Bo gan character thanh cong
 */
router.post('/detach', authToken, detachCharacterFromUserController);

/**
 * @swagger
 * /characters/{id}:
 *   get:
 *     summary: Lay chi tiet mot character theo id
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Character id
 *     responses:
 *       200:
 *         description: Thong tin character
 *       404:
 *         description: Khong tim thay character
 */
router.get('/:id', authToken, getCharacterByIdController);

export default router;
