import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import Topic from '../src/models/topic.schema.js';
import PreferenceQuestion from '../src/models/preferenceQuestion.schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SEED_FILE = path.join(__dirname, 'data', 'onboarding.seed.json');

const normalizeSlug = (value) => String(value || '').trim().toLowerCase();

const loadSeedData = async (seedFilePath) => {
  const raw = await fs.readFile(seedFilePath, 'utf8');
  const parsed = JSON.parse(raw);

  const topics = Array.isArray(parsed?.topics) ? parsed.topics : [];
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];

  if (topics.length === 0) {
    throw new Error('File seed không chứa dữ liệu chủ đề (topics)');
  }
  if (questions.length === 0) {
    throw new Error('File seed không chứa dữ liệu câu hỏi (questions)');
  }

  return { topics, questions };
};

const normalizeTopicScores = (topicScores) => {
  if (!Array.isArray(topicScores)) return [];

  const normalized = [];
  for (const row of topicScores) {
    const topicSlug = normalizeSlug(row?.topicSlug);
    const score = Number(row?.score);
    if (!topicSlug || !Number.isFinite(score)) continue;
    normalized.push({ topicSlug, score });
  }
  return normalized;
};

const main = async () => {
  const seedFilePath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : DEFAULT_SEED_FILE;

  if (!process.env.MONGO_URI) {
    throw new Error('Thiếu MONGO_URI trong biến môi trường');
  }

  const { topics, questions } = await loadSeedData(seedFilePath);
  const activeTopicSlugs = new Set();

  await mongoose.connect(process.env.MONGO_URI);

  try {
    for (const topic of topics) {
      const slug = normalizeSlug(topic.slug);
      if (!slug) continue;

      activeTopicSlugs.add(slug);

      await Topic.updateOne(
        { slug },
        {
          $set: {
            slug,
            name: String(topic.name || slug).trim(),
            description: String(topic.description || '').trim(),
            keywords: Array.isArray(topic.keywords)
              ? topic.keywords.map((item) => String(item || '').trim()).filter(Boolean)
              : [],
            isActive: topic.isActive !== false
          }
        },
        { upsert: true }
      );
    }

    for (const question of questions) {
      const code = String(question.code || '').trim();
      if (!code) continue;

      const options = Array.isArray(question.options)
        ? question.options
          .map((option) => {
            const value = String(option?.value || '').trim();
            if (!value) return null;
            const label = String(option?.label || value).trim();

            const topicScores = normalizeTopicScores(option?.topicScores).filter((scoreItem) =>
              activeTopicSlugs.has(scoreItem.topicSlug)
            );

            return { value, label, topicScores };
          })
          .filter(Boolean)
        : [];

      await PreferenceQuestion.updateOne(
        { code },
        {
          $set: {
            code,
            questionText: String(question.questionText || '').trim(),
            questionType: String(question.questionType || 'single').trim(),
            options,
            order: Number.isFinite(Number(question.order)) ? Number(question.order) : 0,
            isActive: question.isActive !== false
          }
        },
        { upsert: true }
      );
    }

    console.log(`Đã seed cấu hình onboarding từ: ${seedFilePath}`);
    console.log(`Số chủ đề: ${topics.length}`);
    console.log(`Số câu hỏi: ${questions.length}`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error('Seed cấu hình onboarding thất bại:', error);
  process.exit(1);
});
