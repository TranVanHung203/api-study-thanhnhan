import axios from 'axios';
import DatabaseConfig from '../src/config/databaseConfig.js';
import Question from '../src/models/question.schema.js';

const TTS_BASE = 'https://api-voice-crack-ifq7.onrender.com/tts';
const TTS_PARAMS = {
  voice: 'vi-VN-HoaiMyNeural',
  rate: '-10%',
  volume: '+0%',
  pitch: '+0Hz'
};

let countOk = 0, countErr = 0, countSkip = 0;

async function callTts(text, label, retries = 3) {
  if (!text || text.trim() === '') {
    console.log(`  [SKIP] ${label}: (empty)`);
    countSkip++;
    return;
  }
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(TTS_BASE, {
        params: { text, ...TTS_PARAMS },
        timeout: 15000
      });
      console.log(`  [OK] ${label} | "${text.substring(0, 60)}${text.length > 60 ? '…' : ''}": status=${res.status}`);
      countOk++;
      return;
    } catch (err) {
      const status = err.response ? err.response.status : err.code;
      if (attempt < retries) {
        console.warn(`  [RETRY ${attempt}/${retries}] ${label}: ${status} — ${err.message}`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } else {
        console.error(`  [ERR] ${label}: ${status} — ${err.message}`);
        countErr++;
      }
    }
  }
}

async function main() {
  const db = new DatabaseConfig();
  await db.connect();

  try {
    const questions = await Question.find(
      {},
      { questionText: 1, hintVoice: 1 }
    ).limit(0).lean();

    console.log(`Found ${questions.length} questions`);
    const withText = questions.filter(q => q.questionText && q.questionText.trim()).length;
    const withHint = questions.filter(q => q.hintVoice && q.hintVoice.trim()).length;
    console.log(`  - có questionText: ${withText}`);
    console.log(`  - có hintVoice:    ${withHint}\n`);

    const CONCURRENCY = 100;
    for (let i = 0; i < questions.length; i += CONCURRENCY) {
      const batch = questions.slice(i, i + CONCURRENCY);
      console.log(`Batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(questions.length / CONCURRENCY)} (${i + 1}–${Math.min(i + CONCURRENCY, questions.length)}/${questions.length})`);
      await Promise.all(
        batch.flatMap(q => [
          callTts(q.questionText, `${q._id} questionText`),
          callTts(q.hintVoice,   `${q._id} hintVoice`)
        ])
      );
      // Nghỉ 500ms giữa các batch để tránh quá tải TTS server
      if (i + CONCURRENCY < questions.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log('\nDone.');
    console.log(`Tổng kết: OK=${countOk}  ERR=${countErr}  SKIP=${countSkip}`);
  } finally {
    await db.disconnect();
  }
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
