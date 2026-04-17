#!/usr/bin/env node
import dotenv from 'dotenv';
import { isDeepStrictEqual } from 'node:util';
import DatabaseConfig from '../../src/config/databaseConfig.js';
import Question from '../../src/models/question.schema.js';

dotenv.config();

function printHelp() {
  console.log(`
Usage:
  node scripts/add-database/sync-dien-so-answer.js [--detailType=dien_so] [--limit=0] [--dry-run]

Options:
  --detailType  Value to match in detailType/detailtype. Default: dien_so
  --limit       Max number of matched docs to scan (0 = all). Default: 0
  --dry-run     Preview only, no write to database
  --help, -h    Show this help
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    detailType: 'dien_so',
    limit: 0,
    dryRun: false
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg.startsWith('--detailType=')) {
      options.detailType = arg.split('=')[1]?.trim() || 'dien_so';
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const parsed = Number.parseInt(arg.split('=')[1], 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error('--limit must be an integer >= 0');
      }
      options.limit = parsed;
    }
  }

  return options;
}

async function main() {
  const { detailType, limit, dryRun } = parseArgs();
  const db = new DatabaseConfig();

  await db.connect();

  try {
    const collection = Question.collection;
    const filter = {
      $or: [{ detailType }, { detailtype: detailType }],
      rawQuestion: { $exists: true, $ne: null }
    };

    const cursor = collection.find(filter, {
      projection: { _id: 1, answer: 1, rawQuestion: 1, detailType: 1, detailtype: 1 }
    });

    if (limit > 0) {
      cursor.limit(limit);
    }

    let scanned = 0;
    let needUpdate = 0;
    let skippedSame = 0;
    let updated = 0;
    const preview = [];
    const bulkOps = [];

    for await (const doc of cursor) {
      scanned += 1;

      if (isDeepStrictEqual(doc.answer, doc.rawQuestion)) {
        skippedSame += 1;
        continue;
      }

      needUpdate += 1;

      if (preview.length < 5) {
        preview.push({
          _id: doc._id,
          detailType: doc.detailType || doc.detailtype || null,
          oldAnswer: doc.answer,
          rawQuestion: doc.rawQuestion
        });
      }

      if (dryRun) {
        continue;
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { answer: doc.rawQuestion } }
        }
      });

      if (bulkOps.length >= 500) {
        const result = await collection.bulkWrite(bulkOps, { ordered: false });
        updated += result.modifiedCount || 0;
        bulkOps.length = 0;
      }
    }

    if (!dryRun && bulkOps.length > 0) {
      const result = await collection.bulkWrite(bulkOps, { ordered: false });
      updated += result.modifiedCount || 0;
    }

    console.log(`detailType target: ${detailType}`);
    console.log(`Scanned: ${scanned}`);
    console.log(`Already correct (answer === rawQuestion): ${skippedSame}`);
    console.log(`Need update: ${needUpdate}`);
    console.log(`Modified: ${dryRun ? 0 : updated}`);
    console.log(`Mode: ${dryRun ? 'DRY RUN (no changes written)' : 'WRITE'}`);

    if (preview.length > 0) {
      console.log('Preview (first 5 docs that need update):');
      console.log(JSON.stringify(preview, null, 2));
    }
  } finally {
    await db.disconnect();
  }
}

main().catch((error) => {
  console.error('sync-dien-so-answer failed:', error.message);
  process.exit(1);
});
