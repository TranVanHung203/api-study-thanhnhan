import cron from 'node-cron';
import mongoose from 'mongoose';

const DEFAULT_SOURCE_DB = 'learning_app_29_01_2026';
const DEFAULT_TARGET_DB = 'learning_app';
const DEFAULT_CRON_EXPRESSION = '15 17 * * *';
const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_BATCH_SIZE = 1000;

const parseProtectedDbNames = () => {
  const raw = process.env.DB_BACKUP_PROTECTED_DBS;
  if (!raw) return new Set([DEFAULT_SOURCE_DB]);

  const values = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!values.length) return new Set([DEFAULT_SOURCE_DB]);
  return new Set(values);
};

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const shouldSkipCollection = (name) => name.startsWith('system.');

const sanitizeIndex = (index) => {
  const { v, ns, background, ...rest } = index;
  return rest;
};

const copyCollection = async (sourceDb, targetDb, collectionName, batchSize) => {
  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);

  try {
    await targetCollection.drop();
  } catch (error) {
    if (error?.codeName !== 'NamespaceNotFound') {
      throw error;
    }
  }

  try {
    await targetDb.createCollection(collectionName);
  } catch (error) {
    if (error?.codeName !== 'NamespaceExists') {
      throw error;
    }
  }

  let copiedCount = 0;
  let batch = [];

  const cursor = sourceCollection.find({});
  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= batchSize) {
      await targetCollection.insertMany(batch, { ordered: false });
      copiedCount += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    await targetCollection.insertMany(batch, { ordered: false });
    copiedCount += batch.length;
  }

  const sourceIndexes = await sourceCollection.indexes();
  const customIndexes = sourceIndexes
    .filter((index) => index.name !== '_id_')
    .map(sanitizeIndex);

  if (customIndexes.length > 0) {
    await targetCollection.createIndexes(customIndexes);
  }

  return {
    collectionName,
    copiedCount,
    indexCount: customIndexes.length
  };
};

export const overwriteBackupDatabase = async ({
  sourceDbName = process.env.DB_BACKUP_SOURCE_DB || DEFAULT_SOURCE_DB,
  targetDbName = process.env.DB_BACKUP_TARGET_DB || DEFAULT_TARGET_DB,
  batchSize = toPositiveInt(process.env.DB_BACKUP_BATCH_SIZE, DEFAULT_BATCH_SIZE)
} = {}) => {
  const protectedDbNames = parseProtectedDbNames();

  if (sourceDbName === targetDbName) {
    throw new Error('Source DB and target DB must be different.');
  }

  if (protectedDbNames.has(targetDbName)) {
    throw new Error(
      `Refusing to overwrite protected database "${targetDbName}". Check DB_BACKUP_TARGET_DB / DB_BACKUP_PROTECTED_DBS.`
    );
  }

  if (!mongoose.connection?.db) {
    throw new Error('MongoDB connection is not ready.');
  }

  const client = mongoose.connection.getClient();
  const sourceDb = client.db(sourceDbName);
  const targetDb = client.db(targetDbName);

  const sourceCollectionsRaw = await sourceDb.listCollections({}, { nameOnly: true }).toArray();
  const targetCollectionsRaw = await targetDb.listCollections({}, { nameOnly: true }).toArray();

  const sourceCollections = sourceCollectionsRaw
    .map((item) => item.name)
    .filter((name) => !shouldSkipCollection(name));

  const targetCollections = targetCollectionsRaw
    .map((item) => item.name)
    .filter((name) => !shouldSkipCollection(name));

  const sourceSet = new Set(sourceCollections);
  const extraTargetCollections = targetCollections.filter((name) => !sourceSet.has(name));

  for (const collectionName of extraTargetCollections) {
    await targetDb.collection(collectionName).drop();
  }

  const copied = [];
  for (const collectionName of sourceCollections) {
    const result = await copyCollection(sourceDb, targetDb, collectionName, batchSize);
    copied.push(result);
  }

  return {
    sourceDbName,
    targetDbName,
    copiedCollections: copied.length,
    droppedExtraCollections: extraTargetCollections.length,
    details: copied
  };
};

export const startDailyDatabaseBackupOverwriteJob = () => {
  const cronExpression = process.env.DB_BACKUP_CRON || DEFAULT_CRON_EXPRESSION;
  const timezone = process.env.DB_BACKUP_TIMEZONE || DEFAULT_TIMEZONE;
  const sourceDbName = process.env.DB_BACKUP_SOURCE_DB || DEFAULT_SOURCE_DB;
  const targetDbName = process.env.DB_BACKUP_TARGET_DB || DEFAULT_TARGET_DB;

  let isRunning = false;

  cron.schedule(
    cronExpression,
    async () => {
      if (isRunning) {
        console.warn('[DB Backup Job] Previous run is still in progress. Skip this cycle.');
        return;
      }

      isRunning = true;
      const startedAt = new Date();
      console.log(
        `[DB Backup Job] Start at ${startedAt.toISOString()} - copying "${sourceDbName}" to "${targetDbName}".`
      );

      try {
        const summary = await overwriteBackupDatabase({ sourceDbName, targetDbName });
        console.log('[DB Backup Job] Completed:', summary);
      } catch (error) {
        console.error('[DB Backup Job] Failed:', error);
      } finally {
        isRunning = false;
      }
    },
    { timezone }
  );

  console.log(
    `[DB Backup Job] Scheduled "${sourceDbName}" => "${targetDbName}" with cron "${cronExpression}" (timezone: ${timezone}).`
  );
};
