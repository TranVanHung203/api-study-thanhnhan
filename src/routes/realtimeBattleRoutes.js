import express from 'express';
import { authToken } from '../middlewares/authMiddleware.js';
import {
  getRandomBattleQuestionsController,
  getBattleResultController
} from '../controllers/realtimeBattleController.js';

const router = express.Router();

router.all('*', authToken);

router.get('/questions/random', getRandomBattleQuestionsController);
router.get('/:battleId/result', getBattleResultController);

export default router;
