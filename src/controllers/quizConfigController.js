import QuizConfig from '../models/quizConfig.schema.js';
import Progress from '../models/progress.schema.js';
import BadRequestError from '../errors/badRequestError.js';
import NotFoundError from '../errors/notFoundError.js';

export const getQuizConfigByProgress = async (req, res, next) => {
  try {
    const { id } = req.params; // progressId
    const config = await QuizConfig.findOne({ progressId: id });
    if (!config) return res.status(404).json({ message: 'No quiz config found for this progress' });
    // Return only the shape expected by clients: { total, parts }
    return res.status(200).json({ total: config.total, parts: config.parts });
  } catch (err) {
    next(err);
  }
};

export const upsertQuizConfigForProgress = async (req, res, next) => {
  try {
    const { id } = req.params; // progressId
    const { total, parts } = req.body || {};

    // Basic validation
    if (typeof total !== 'number' || !Array.isArray(parts)) {
      throw new BadRequestError('Body must contain `total` (number) and `parts` (array)');
    }
    let sum = 0;
    for (const p of parts) {
      if (!p || typeof p.type !== 'string' || !Number.isInteger(p.count) || p.count <= 0 ) {
        throw new BadRequestError('Each part must have `type`(string), `count`(positive int)');
      }
      sum += p.count;
    }
    if (sum !== Number(total)) {
      throw new BadRequestError('Sum of part counts must equal total');
    }

    // Ensure progress exists
    const progress = await Progress.findById(id);
    if (!progress) throw new NotFoundError('Progress not found');

    const update = { total, parts };
    const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
    const config = await QuizConfig.findOneAndUpdate({ progressId: id }, update, opts);

    return res.status(200).json({ message: 'Quiz config saved', config });
  } catch (err) {
    next(err);
  }
};

export const createQuizConfigForProgress = async (req, res, next) => {
  try {
    const { id } = req.params; // progressId
    const { total, parts } = req.body || {};

    if (typeof total !== 'number' || !Array.isArray(parts)) {
      throw new BadRequestError('Body must contain `total` (number) and `parts` (array)');
    }
    let sum = 0;
    for (const p of parts) {
      if (!p || typeof p.type !== 'string' || !Number.isInteger(p.count) || p.count <= 0 ) {
        throw new BadRequestError('Each part must have `type`(string), `count`(positive int)');
      }
      sum += p.count;
    }
    if (sum !== Number(total)) {
      throw new BadRequestError('Sum of part counts must equal total');
    }

    const progress = await Progress.findById(id);
    if (!progress) throw new NotFoundError('Progress not found');

    // Prevent creating if already exists
    const existing = await QuizConfig.findOne({ progressId: id });
    if (existing) {
      throw new BadRequestError('Quiz config already exists for this progress');
    }

    const config = new QuizConfig({ progressId: id, total, parts });
    await config.save();

    return res.status(201).json({ message: 'Quiz config created', config });
  } catch (err) {
    next(err);
  }
};

export default { getQuizConfigByProgress, upsertQuizConfigForProgress, createQuizConfigForProgress };
