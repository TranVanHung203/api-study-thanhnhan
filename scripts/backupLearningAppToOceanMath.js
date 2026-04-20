#!/usr/bin/env node
import dotenv from 'dotenv';
import DatabaseConfig from '../src/config/databaseConfig.js';
import { overwriteBackupDatabase } from '../src/jobs/databaseBackupJob.js';

dotenv.config();

const DEFAULT_SOURCE_DB = 'learning_app_29_01_2026';
const DEFAULT_TARGET_DB = 'ocean_math';
const DEFAULT_BATCH_SIZE = 1000;

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    sourceDbName: DEFAULT_SOURCE_DB,
    targetDbName: DEFAULT_TARGET_DB,
    batchSize: DEFAULT_BATCH_SIZE
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node scripts/backupLearningAppToOceanMath.js [--source=<db>] [--target=<db>] [--batch-size=<n>]

Default:
  --source=${DEFAULT_SOURCE_DB}
  --target=${DEFAULT_TARGET_DB}
  --batch-size=${DEFAULT_BATCH_SIZE}
`);
      process.exit(0);
    }

    if (arg.startsWith('--source=')) {
      options.sourceDbName = arg.split('=')[1] || DEFAULT_SOURCE_DB;
      continue;
    }

    if (arg.startsWith('--target=')) {
      options.targetDbName = arg.split('=')[1] || DEFAULT_TARGET_DB;
      continue;
    }

    if (arg.startsWith('--batch-size=')) {
      const raw = arg.split('=')[1];
      options.batchSize = toPositiveInt(raw, DEFAULT_BATCH_SIZE);
      continue;
    }
  }

  return options;
};

const db = new DatabaseConfig();

(async () => {
  const options = parseArgs();

  try {
    await db.connect();

    console.log(
      `[DB Backup] Start copy "${options.sourceDbName}" -> "${options.targetDbName}" (batchSize=${options.batchSize})`
    );

    const summary = await overwriteBackupDatabase({
      sourceDbName: options.sourceDbName,
      targetDbName: options.targetDbName,
      batchSize: options.batchSize
    });

    console.log('[DB Backup] Completed successfully.');
    console.log(
      `[DB Backup] Collections copied: ${summary.copiedCollections}, dropped extra collections: ${summary.droppedExtraCollections}`
    );
    for (const item of summary.details) {
      console.log(
        ` - ${item.collectionName}: ${item.copiedCount} docs, ${item.indexCount} custom indexes`
      );
    }
  } catch (error) {
    console.error('[DB Backup] Failed:', error);
    process.exitCode = 1;
  } finally {
    await db.disconnect();
  }
})();
