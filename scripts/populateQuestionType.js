import 'dotenv/config';
import mongoose from 'mongoose';
import Question from '../src/models/question.schema.js';

// Usage:
// DRY_RUN=1 MONGO_URI='<uri>' node scripts/populateQuestionType.js
// or to apply: MONGO_URI='<uri>' node scripts/populateQuestionType.js

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

async function inferTypeForQuestion(q) {
  // If question already has questionType, skip
  if (q.questionType) return null;

  const ans = q.answer;
  // If answer is an array -> multiple
  if (Array.isArray(ans)) return 'multiple';
  // If answer is a number -> single
  if (typeof ans === 'number') return 'single';
  // If answer is object with text -> treat as single/text based on choices
  if (typeof ans === 'object' && ans !== null) {
    // If choices exist and answer.text matches a choice -> single
    if (Array.isArray(q.choices) && q.choices.some(c => (c.text || c) === ans.text)) return 'single';
    return 'text';
  }
  // If answer is string -> if matches one of choices -> single, else text
  if (typeof ans === 'string') {
    if (Array.isArray(q.choices) && q.choices.some(c => (c.text || c) === ans)) return 'single';
    // could be an image url too, keep as single
    return 'single';
  }
  // default
  return 'single';
}

async function main() {
  await mongoose.connect(MONGO, { /* no deprecated options */ });
  console.log('Connected to DB', MONGO);

  const cursor = Question.find().cursor();
  let changed = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const q = doc;
    if (q.questionType) continue;
    const inferred = await inferTypeForQuestion(q);
    console.log(`Question ${q._id}: inferred questionType = ${inferred}`);
    if (!DRY_RUN) {
      q.questionType = inferred;
      await q.save();
      changed += 1;
    }
  }

  console.log('Done. Updated:', changed);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
