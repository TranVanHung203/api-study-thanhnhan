import DatabaseConfig from '../src/config/databaseConfig.js';
import Question from '../src/models/question.schema.js';

async function main() {
  const db = new DatabaseConfig();
  await db.connect();

  try {
    const update = { $set: { hintText: 'Chúc mừng năm mới chúc các bạn vạn sự bình an 2026' } };
    const result = await Question.updateMany({}, update);
    console.log('Update result:', result);
  } catch (err) {
    console.error('Error updating questions:', err);
  } finally {
    await db.disconnect();
  }
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
