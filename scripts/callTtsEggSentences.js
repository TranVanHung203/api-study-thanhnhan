import axios from 'axios';

const TTS_BASE = 'https://api-voice-crack.onrender.com/tts';
const TTS_PARAMS = {
  voice: 'vi-VN-HoaiMyNeural',
  rate: '-10%',
  volume: '+0%',
  pitch: '+0Hz'
};

const TEMPLATES = [
  'Đúng rồi, đủ {n} quả trứng rồi.'
];

let countOk = 0, countErr = 0;

function buildUrl(text) {
  // Build URL theo đúng cách client gửi để cache key khớp nhau
  // Nếu client encode khác thì sửa lại phần này cho khớp
  const q = new URLSearchParams({
    text,
    voice: 'vi-VN-HoaiMyNeural',
    rate: '-10%',
    volume: '+0%',
    pitch: '+0Hz'
  });
  return `${TTS_BASE}?${q.toString()}`;
}

async function callTts(text, label, retries = 3) {
  const url = buildUrl(text);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, { timeout: 15000 });
      console.log(`  [OK] ${label} | "${text}": status=${res.status}`);
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
  const sentences = [];
  for (let n = 100; n <= 999; n++) {
    for (const tpl of TEMPLATES) {
      const text = tpl.replace('{n}', n);
      sentences.push({ text, label: `n=${n} | ${tpl.substring(0, 20)}…` });
    }
  }

  console.log(`Tổng số câu cần gọi TTS: ${sentences.length}`);

  const CONCURRENCY = 30;
  for (let i = 0; i < sentences.length; i += CONCURRENCY) {
    const batch = sentences.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    const totalBatches = Math.ceil(sentences.length / CONCURRENCY);
    console.log(`Batch ${batchNum}/${totalBatches} (${i + 1}–${Math.min(i + CONCURRENCY, sentences.length)}/${sentences.length})`);
    await Promise.all(batch.map(s => callTts(s.text, s.label)));
    if (i + CONCURRENCY < sentences.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\nDone.');
  console.log(`Tổng kết: OK=${countOk}  ERR=${countErr}`);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
