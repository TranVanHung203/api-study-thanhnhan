import mongoose from 'mongoose';
import 'dotenv/config';

import User from '../src/models/user.schema.js';

const USER_CODE_REGEX = /^(HS|U)(\d{4})_(\d+)$/;

const parseArgs = (argv) => {
  const args = {
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
};

const getUserPrefix = (roles) => {
  if (!Array.isArray(roles)) return 'U';
  return roles.some((role) => String(role).toLowerCase() === 'student') ? 'HS' : 'U';
};

const getYearFromCreatedAt = (createdAt) => {
  const date = createdAt ? new Date(createdAt) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().getFullYear();
  return date.getFullYear();
};

const main = async () => {
  const { dryRun } = parseArgs(process.argv.slice(2));

  if (!process.env.MONGO_URI) {
    throw new Error('Missing MONGO_URI in environment variables');
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const existingUsers = await User.find({
      userCode: { $exists: true, $ne: null }
    })
      .select('_id userCode')
      .lean();

    const sequenceByKey = new Map();

    for (const user of existingUsers) {
      const code = String(user.userCode || '').trim();
      const match = USER_CODE_REGEX.exec(code);
      if (!match) continue;

      const [, prefix, year, orderStr] = match;
      const key = `${prefix}${year}`;
      const order = Number.parseInt(orderStr, 10);
      if (!Number.isFinite(order)) continue;

      const currentMax = sequenceByKey.get(key) || 0;
      if (order > currentMax) {
        sequenceByKey.set(key, order);
      }
    }

    const usersToBackfill = await User.find({
      $or: [
        { userCode: { $exists: false } },
        { userCode: null },
        { userCode: '' }
      ]
    })
      .select('_id roles createdAt userCode')
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    if (!usersToBackfill.length) {
      console.log('No users need backfill.');
      return;
    }

    const operations = [];
    const preview = [];

    for (const user of usersToBackfill) {
      const prefix = getUserPrefix(user.roles);
      const year = getYearFromCreatedAt(user.createdAt);
      const key = `${prefix}${year}`;
      const nextOrder = (sequenceByKey.get(key) || 0) + 1;
      sequenceByKey.set(key, nextOrder);

      const generatedUserCode = `${prefix}${year}_${nextOrder}`;
      preview.push({ userId: String(user._id), userCode: generatedUserCode });

      operations.push({
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { userCode: generatedUserCode } }
        }
      });
    }

    if (dryRun) {
      console.log(`[DRY RUN] Total users to update: ${operations.length}`);
      console.log('[DRY RUN] First 20 generated userCodes:');
      preview.slice(0, 20).forEach((item) => {
        console.log(`- ${item.userId}: ${item.userCode}`);
      });
      return;
    }

    const result = await User.bulkWrite(operations, { ordered: true });

    console.log('Backfill userCode complete:', {
      matched: result.matchedCount ?? 0,
      modified: result.modifiedCount ?? 0
    });
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error('Backfill userCode failed:', error.message || error);
  process.exit(1);
});

