import 'dotenv/config';
import mongoose from 'mongoose';
import Question from '../src/models/question.schema.js';

// Usage: node ./scripts/normalizeQuestionAnswers.js
// This script will:
// - connect to the DB using MONGO_URI env
// - for each Question, if question.answer is a number, replace it with the corresponding choice text
// - store the original value in `originalAnswer` field
// - for safety, do a dry run first if you set DRY_RUN=true

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

async function main() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to DB', MONGO);

  const cursor = Question.find().cursor();
  let updated = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const q = doc;
    const ans = q.answer;
    if (ans === undefined || ans === null) continue;

    if (typeof ans === 'number') {
      const idx = ans;
      if (Array.isArray(q.choices) && q.choices[idx]) {
        const choiceText = q.choices[idx].text || q.choices[idx];
        console.log(`Question ${q._id}: numeric answer ${idx} -> text: ${choiceText}`);
        if (!DRY_RUN) {
          q.originalAnswer = ans;
          q.answer = choiceText;
          await q.save();
        }
        updated += 1;
      } else {
        console.log(`Question ${q._id}: numeric answer ${idx} but choices missing or index out of range`);
      }
    } else if (typeof ans === 'object' && ans.text) {
      // already in object form, leave it
      continue;
    } else {
      // answer already string or other type, leave it
      continue;
    }
  }

  console.log('Done. Updated:', updated);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
