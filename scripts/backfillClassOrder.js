import 'dotenv/config';
import mongoose from 'mongoose';
import Class from '../src/models/class.schema.js';

const parseArgs = (argv) => {
  const args = {
    dryRun: false,
    startOrder: 1
  };

  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '--dryRun') {
      args.dryRun = true;
    } else if (arg.startsWith('--startOrder=')) {
      const value = Number(arg.slice('--startOrder='.length));
      if (!Number.isNaN(value) && Number.isFinite(value)) {
        args.startOrder = value;
      }
    }
  }

  return args;
};

const main = async () => {
  const { dryRun, startOrder } = parseArgs(process.argv.slice(2));

  if (!process.env.MONGO_URI) {
    throw new Error('Missing MONGO_URI in environment variables');
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const classes = await Class.find().sort({ createdAt: 1, _id: 1 });

    if (classes.length === 0) {
      console.log('No classes found, nothing to update');
      return;
    }

    let currentOrder = startOrder;

    for (const classDoc of classes) {
      const nextOrder = currentOrder;
      currentOrder += 1;

      if (classDoc.order === nextOrder) {
        console.log(`Class ${classDoc._id} already has order ${nextOrder}`);
        continue;
      }

      console.log(`Class ${classDoc._id}: ${classDoc.order ?? 'null'} -> ${nextOrder}`);

      if (!dryRun) {
        classDoc.order = nextOrder;
        await classDoc.save();
      }
    }

    console.log(dryRun ? 'Dry run completed' : 'Backfill completed');
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error('Backfill class order failed:', error.message || error);
  process.exit(1);
});