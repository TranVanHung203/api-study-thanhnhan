import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

import Video from '../src/models/video.schema.js';
import Quiz from '../src/models/quiz.schema.js';

const argv = process.argv.slice(2);
const parseArg = (name) => {
  const p = argv.find(a => a.startsWith(`--${name}=`));
  if (!p) return null;
  return p.split('=')[1];
};

const mode = parseArg('mode') || 'generate'; // assign | generate | file
const value = parseArg('value') || null; // used for assign
const base = parseArg('base') || 'https://example.com/voices/'; // used for generate
const file = parseArg('file') || null; // path to mapping json { videos: {id:desc}, quizzes: {id:desc} }
const dry = argv.includes('--dry');
const mongoUri = parseArg('mongoUri') || process.env.MONGO_URI || 'mongodb://localhost:27017/online_learning';

const isValidObjectId = (s) => {
  try {
    return mongoose.Types.ObjectId.isValid(s);
  } catch (e) {
    return false;
  }
};

const run = async () => {
  console.log(`Connecting to ${mongoUri}`);
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    if (mode === 'assign') {
      if (!value) throw new Error('Missing --value for assign mode');
      console.log(`Assigning same voiceDescription to all videos and quizzes: ${value}`);
      if (!dry) {
        await Video.updateMany({}, { $set: { voiceDescription: value } });
        await Quiz.updateMany({}, { $set: { voiceDescription: value } });
      } else {
        const vcount = await Video.countDocuments();
        const qcount = await Quiz.countDocuments();
        console.log(`[dry] Would update ${vcount} videos and ${qcount} quizzes`);
      }
      console.log('Done');
      return;
    }

    if (mode === 'generate') {
      console.log(`Generating voiceDescription using base: ${base}`);
      const videos = await Video.find().select('_id title');
      const quizzes = await Quiz.find().select('_id title');

      const videoOps = videos.map((v, idx) => ({
        updateOne: {
          filter: { _id: v._id },
          update: { $set: { voiceDescription: `${base}video-${v._id}.mp3` } }
        }
      }));
      const quizOps = quizzes.map((q, idx) => ({
        updateOne: {
          filter: { _id: q._id },
          update: { $set: { voiceDescription: `${base}quiz-${q._id}.mp3` } }
        }
      }));

      if (!dry) {
        if (videoOps.length) await Video.bulkWrite(videoOps);
        if (quizOps.length) await Quiz.bulkWrite(quizOps);
        console.log(`Updated ${videoOps.length} videos and ${quizOps.length} quizzes`);
      } else {
        console.log(`[dry] Would update ${videoOps.length} videos and ${quizOps.length} quizzes`);
      }
      return;
    }

    if (mode === 'file') {
      if (!file) throw new Error('Missing --file=path.json for file mode');
      const filePath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
      const raw = fs.readFileSync(filePath, 'utf8');
      const map = JSON.parse(raw);
      const videoMap = map.videos || {};
      const quizMap = map.quizzes || {};

      const videoOps = Object.entries(videoMap).map(([id, desc]) => {
        if (!isValidObjectId(id)) throw new Error(`Invalid ObjectId in videos map: ${id}`);
        return { updateOne: { filter: { _id: id }, update: { $set: { voiceDescription: desc } } } };
      });
      const quizOps = Object.entries(quizMap).map(([id, desc]) => {
        if (!isValidObjectId(id)) throw new Error(`Invalid ObjectId in quizzes map: ${id}`);
        return { updateOne: { filter: { _id: id }, update: { $set: { voiceDescription: desc } } } };
      });

      if (!dry) {
        if (videoOps.length) await Video.bulkWrite(videoOps);
        if (quizOps.length) await Quiz.bulkWrite(quizOps);
        console.log(`Applied ${videoOps.length} video updates and ${quizOps.length} quiz updates from file`);
      } else {
        console.log(`[dry] Would apply ${videoOps.length} video updates and ${quizOps.length} quiz updates from file`);
      }

      return;
    }

    throw new Error(`Unknown mode: ${mode}`);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
