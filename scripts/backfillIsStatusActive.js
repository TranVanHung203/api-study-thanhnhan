import mongoose from 'mongoose';
import 'dotenv/config';

import User from '../src/models/user.schema.js';

const main = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('Missing MONGO_URI in environment variables');
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const result = await User.updateMany(
      {
        $or: [
          { isStatus: { $exists: false } },
          { isStatus: null },
          { isStatus: '' }
        ]
      },
      { $set: { isStatus: 'active' } }
    );

    console.log('Backfill isStatus complete:', {
      matched: result.matchedCount ?? result.n ?? 0,
      modified: result.modifiedCount ?? result.nModified ?? 0
    });
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error('Backfill isStatus failed:', error.message || error);
  process.exit(1);
});
