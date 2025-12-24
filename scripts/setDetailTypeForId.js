#!/usr/bin/env node
import DatabaseConfig from '../src/config/databaseConfig.js';
import Question from '../src/models/question.schema.js';
import dotenv from 'dotenv';

dotenv.config();
const db = new DatabaseConfig();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { id: null, copy: false, value: undefined, dryRun: false, all: false, limit: 0 };
  for (const a of args) {
    if (a === '--copy') opts.copy = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--all') opts.all = true;
    else if (a.startsWith('--limit=')) opts.limit = parseInt(a.split('=')[1], 10) || 0;
    else if (a.startsWith('--id=')) opts.id = a.split('=')[1];
    else if (a.startsWith('--value=')) opts.value = a.split('=')[1];
    else if (a === '--help') {
      console.log('Usage: node setDetailTypeForId.js --id=<id> | --all [--copy | --value=VAL] [--dry-run] [--limit=N]\n  --all    : operate on all questions missing detailType\n  --copy   : copy from questionType into detailType\n  --value  : set detailType to VAL\n  --limit  : limit number of docs to process when using --all (0 = all)\n  --dry-run: do not write to DB, just show what would change');
      process.exit(0);
    }
  }
  return opts;
}

(async () => {
  const opts = parseArgs();
  if (!opts.all && !opts.id) {
    console.error('Error: --id or --all is required');
    process.exit(1);
  }
  if (!opts.copy && typeof opts.value === 'undefined') {
    console.error('Error: either --copy or --value must be provided');
    process.exit(1);
  }

  await db.connect();
  try {
    if (opts.all) {
      // Bulk mode: iterate over questions missing detailType
      const query = { $or: [ { detailType: { $exists: false } }, { detailType: null } ] };
      const cursor = Question.find(query).cursor();
      let processed = 0;
      for await (const q of cursor) {
        if (opts.limit && processed >= opts.limit) break;
        const newVal = opts.copy ? (q.questionType || null) : opts.value;
        if (newVal == null) continue;
        console.log(`Would update ${q._id}: detailType -> ${newVal}`);
        if (!opts.dryRun) {
          await Question.updateOne({ _id: q._id }, { $set: { detailType: newVal } });
        }
        processed += 1;
      }
      console.log(`Processed ${processed} documents.`);
    } else {
      // Single-id mode
      const q = await Question.findById(opts.id).lean();
      if (!q) {
        console.error('Question not found:', opts.id);
        process.exit(1);
      }
      const current = q.detailType;
      const newVal = opts.copy ? (q.questionType || null) : opts.value;
      console.log('Question:', q._id);
      console.log('Current detailType:', current);
      console.log('New detailType:', newVal);
      if (opts.dryRun) {
        console.log('Dry-run: no changes written.');
        process.exit(0);
      }
      if (newVal == null) {
        console.log('New value is null/undefined, skipping update.');
        process.exit(0);
      }
      const updated = await Question.findByIdAndUpdate(opts.id, { $set: { detailType: newVal } }, { new: true });
      console.log('Updated document detailType:', updated.detailType);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await db.disconnect();
    process.exit(0);
  }
})();
