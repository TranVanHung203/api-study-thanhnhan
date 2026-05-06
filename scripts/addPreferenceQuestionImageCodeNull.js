import mongoose from 'mongoose';
import 'dotenv/config';

import PreferenceQuestion from '../src/models/preferenceQuestion.schema.js';

const main = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('Missing MONGO_URI in environment variables');
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const result = await PreferenceQuestion.updateMany(
      { 'options.imageCode': { $exists: false } },
      { $set: { 'options.$[option].imageCode': null } },
      {
        arrayFilters: [
          { 'option.imageCode': { $exists: false } }
        ]
      }
    );

    console.log('Added imageCode: null to preference question options');
    console.log(`Matched documents: ${result.matchedCount}`);
    console.log(`Modified documents: ${result.modifiedCount}`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error('Failed to add imageCode field:', error);
  process.exit(1);
});
