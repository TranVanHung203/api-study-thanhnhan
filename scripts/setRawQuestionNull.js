import DatabaseConfig from '../src/config/databaseConfig.js';
import Question from '../src/models/question.schema.js';

(async () => {
  const db = new DatabaseConfig();
  try {
    await db.connect();

    // Update documents that don't have rawQuestion or where it's undefined
    const result = await Question.updateMany(
      { $or: [ { rawQuestion: { $exists: false } }, { rawQuestion: undefined } ] },
      { $set: { rawQuestion: null } }
    );

    console.log('Matched:', result.matchedCount || result.n || 0);
    console.log('Modified:', result.modifiedCount || result.nModified || 0);
  } catch (err) {
    console.error('Error updating questions:', err);
  } finally {
    await db.disconnect();
    process.exit(0);
  }
})();
