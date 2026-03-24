import 'dotenv/config';
import mongoose from 'mongoose';
import Question from '../src/models/question.schema.js';

// Usage: node ./scripts/convertChoicesToStrings.js
// Set DRY_RUN=true to preview changes without writing.

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

async function main() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to DB', MONGO);

  const collection = mongoose.connection.collection('questions');
  const match = { choices: { $elemMatch: { $type: 'object' } } };

  const toStringsPipeline = [
    {
      $set: {
        choices: {
          $map: {
            input: '$choices',
            as: 'c',
            in: {
              $cond: [
                { $eq: [{ $type: '$$c' }, 'string'] },
                '$$c',
                {
                  $cond: [
                    { $ne: ['$$c.text', null] },
                    '$$c.text',
                    { $toString: '$$c' }
                  ]
                }
              ]
            }
          }
        }
      }
    }
  ];

  const matched = await collection.countDocuments(match);
  if (DRY_RUN) {
    console.log('Dry run. Documents to update:', matched);
    await mongoose.disconnect();
    return;
  }

  const result = await collection.updateMany(match, toStringsPipeline);
  console.log('Done. Matched:', result.matchedCount, 'Modified:', result.modifiedCount);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
