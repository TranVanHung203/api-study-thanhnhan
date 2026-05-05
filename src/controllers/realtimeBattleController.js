import Question from '../models/question.schema.js';
import RealtimeBattle from '../models/realtimeBattle.schema.js';
import { getBattleSnapshot } from '../ws/battleSocket.js';

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const sanitizeQuestion = (question) => ({
  _id: question._id,
  quizId: question.quizId,
  questionText: question.questionText || null,
  rawQuestion: question.rawQuestion ?? null,
  imageQuestion: question.imageQuestion || null,
  choices: Array.isArray(question.choices) ? question.choices : [],
  questionType: question.questionType || 'single',
  detailType: question.detailType || null,
  hintVoice: question.hintVoice || null
});

export const getRandomBattleQuestionsController = async (req, res, next) => {
  try {
    const limit = Math.min(toPositiveInt(req.query.limit, 10),20);
    const questions = await Question.aggregate([{ $sample: { size: limit } }]);

    return res.status(200).json({
      limit,
      count: questions.length,
      questions: questions.map(sanitizeQuestion)
    });
  } catch (error) {
    next(error);
  }
};

export const getBattleResultController = async (req, res, next) => {
  try {
    const { battleId } = req.params;

    const persistedBattle = await RealtimeBattle.findOne({ battleId }).lean();
    if (persistedBattle) {
      return res.status(200).json({
        source: 'database',
        battle: persistedBattle
      });
    }

    const liveSnapshot = getBattleSnapshot(battleId);
    if (liveSnapshot) {
      return res.status(200).json({
        source: 'memory',
        battle: liveSnapshot
      });
    }

    return res.status(404).json({ message: 'Không tìm thấy trận đấu' });
  } catch (error) {
    next(error);
  }
};
