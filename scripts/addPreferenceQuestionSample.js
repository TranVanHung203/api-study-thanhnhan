import mongoose from 'mongoose';
import 'dotenv/config';

import Topic from '../src/models/topic.schema.js';
import PreferenceQuestion from '../src/models/preferenceQuestion.schema.js';

const sampleTopics = [
  {
    slug: 'ocean',
    name: 'Dai duong',
    description: 'Nguoi hoc thich khong gian bien, song, dao va trai nghiem tren nuoc.',
    keywords: ['dai duong', 'bien', 'song', 'dao', 'nuoc', 'ocean', 'sea', 'beach', 'wave'],
    isActive: true
  },
  {
    slug: 'desert',
    name: 'Sa mac',
    description: 'Nguoi hoc thich khong gian sa mac, doi cat va hanh trinh kho han.',
    keywords: ['sa mac', 'cat', 'doi cat', 'nang', 'nong', 'desert', 'sand', 'dune', 'sun'],
    isActive: true
  }
];

const samplePreferenceQuestions = [
  {
    code: 'scene_preference',
    questionText: 'Ban thich khung canh nao hon?',
    questionType: 'single',
    order: 1,
    isActive: true,
    options: [
      {
        value: 'blue_ocean',
        label: 'Bien xanh, gio mat, song nhe',
        imageCode: 'ocean_scene',
        topicScores: [{ topicSlug: 'ocean', score: 5 }]
      },
      {
        value: 'golden_dunes',
        label: 'Doi cat vang, nang nong',
        imageCode: 'desert_scene',
        topicScores: [{ topicSlug: 'desert', score: 5 }]
      }
    ]
  },
  {
    code: 'weekend_activity',
    questionText: 'Neu di choi cuoi tuan, ban chon hoat dong nao?',
    questionType: 'single',
    order: 2,
    isActive: true,
    options: [
      {
        value: 'snorkeling',
        label: 'Lan ngam sinh vat bien',
        imageCode: 'snorkeling',
        topicScores: [{ topicSlug: 'ocean', score: 4 }]
      },
      {
        value: 'sailing',
        label: 'Di thuyen ngam hoang hon',
        imageCode: 'sailing',
        topicScores: [{ topicSlug: 'ocean', score: 4 }]
      },
      {
        value: 'camel_ride',
        label: 'Cuoi lac da qua doi cat',
        imageCode: 'camel_ride',
        topicScores: [{ topicSlug: 'desert', score: 4 }]
      },
      {
        value: 'dune_buggy',
        label: 'Lai xe vuot doi cat',
        imageCode: 'dune_buggy',
        topicScores: [{ topicSlug: 'desert', score: 4 }]
      }
    ]
  },
  {
    code: 'travel_items',
    questionText: 'Ban uu tien mang theo gi?',
    questionType: 'multiple',
    order: 3,
    isActive: true,
    options: [
      {
        value: 'swim_goggles',
        label: 'Kinh boi/lan',
        imageCode: 'swim_goggles',
        topicScores: [{ topicSlug: 'ocean', score: 3 }]
      },
      {
        value: 'waterproof_bag',
        label: 'Tui chong nuoc',
        imageCode: 'waterproof_bag',
        topicScores: [{ topicSlug: 'ocean', score: 3 }]
      },
      {
        value: 'sand_boots',
        label: 'Giay di cat',
        imageCode: 'sand_boots',
        topicScores: [{ topicSlug: 'desert', score: 3 }]
      },
      {
        value: 'sun_hat',
        label: 'Mu rong vanh',
        imageCode: 'sun_hat',
        topicScores: [
          { topicSlug: 'desert', score: 2 },
          { topicSlug: 'ocean', score: 1 }
        ]
      }
    ]
  },
  {
    code: 'extra_note',
    questionText: 'Mo ta ngan gon ve loai khung canh ban thay thu vi nhat',
    questionType: 'text',
    order: 4,
    isActive: true,
    options: []
  }
];

const main = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('Missing MONGO_URI in environment variables');
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    for (const topic of sampleTopics) {
      await Topic.updateOne(
        { slug: topic.slug },
        { $set: topic },
        { upsert: true }
      );
    }

    for (const question of samplePreferenceQuestions) {
      await PreferenceQuestion.updateOne(
        { code: question.code },
        { $set: question },
        { upsert: true }
      );
    }

    console.log('Added sample preference question data');
    console.log(`Topics: ${sampleTopics.length}`);
    console.log(`Preference questions: ${samplePreferenceQuestions.length}`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error('Failed to add sample preference question data:', error);
  process.exit(1);
});
