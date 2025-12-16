import 'dotenv/config';
import mongoose from 'mongoose';
import Question from '../src/models/question.schema.js';

// Usage:
// DRY_RUN=1 MONGO_URI='...' node scripts/forceSetQuestionType.js
// or to apply:
// MONGO_URI='...' node scripts/forceSetQuestionType.js

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

async function main() {
  await mongoose.connect(MONGO);
  console.log('Connected to DB', MONGO);

  const missingCount = await Question.countDocuments({ questionType: { $exists: false } });
  console.log('Questions missing questionType:', missingCount);

  if (missingCount === 0) {
    console.log('No documents to update.');
    await mongoose.disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log('DRY_RUN enabled - not applying changes.');
    await mongoose.disconnect();
    return;
  }

  const res = await Question.updateMany({ questionType: { $exists: false } }, { $set: { questionType: 'single' } });
  console.log('Matched:', res.matchedCount || res.nModified || res.modifiedCount, 'Modified:', res.modifiedCount || res.nModified);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
