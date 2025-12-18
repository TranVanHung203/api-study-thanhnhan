#!/usr/bin/env node

/**
 * scripts/updateSkillVoice.js
 *
 * Usage:
 *  node scripts/updateSkillVoice.js --mode=assign --value="https://example.com/voice.mp3"
 *  node scripts/updateSkillVoice.js --mode=generate --baseUrl="https://cdn.example.com/voices/skill-"
 *  node scripts/updateSkillVoice.js --mode=file --file=skills-voices.json
 *
 * Modes:
 *  - assign: set the same `skillVoice` value for all skills
 *  - generate: set `skillVoice` to `${baseUrl}${index}.mp3` for each skill (index starts from 1)
 *  - file: read a JSON object mapping skillId -> skillVoice from the given file
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Skill from '../src/models/skill.schema.js';

// Robust argv parsing: allow --key=value or --key value
function parseArgs(argvList) {
  const out = {};
  for (let i = 0; i < argvList.length; i++) {
    const a = argvList[i];
    if (!a) continue;
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) {
        out[k] = v;
      } else {
        // next arg might be the value
        const next = argvList[i + 1];
        if (next && !next.startsWith('--')) {
          out[k] = next;
          i++;
        } else {
          out[k] = true;
        }
      }
    } else if (a.startsWith('-')) {
      const k = a.slice(1);
      const next = argvList[i + 1];
      if (next && !next.startsWith('-')) {
        out[k] = next; i++;
      } else {
        out[k] = true;
      }
    }
  }
  return out;
}

const argv = parseArgs(process.argv.slice(2));

const mode = argv.mode || argv.m || 'assign';
const mongoUri = argv.mongoUri || argv.mongo || process.env.MONGO_URI || 'mongodb://localhost:27017/online_learning';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to DB');
  } catch (err) {
    console.error('Failed to connect to MongoDB with:', mongoUri);
    console.error(err.message || err);
    process.exit(1);
  }

  const skills = await Skill.find().sort({ _id: 1 });

  if (!skills || skills.length === 0) {
    console.log('No skills found');
    await mongoose.disconnect();
    return;
  }

  const bulkOps = [];

  if (mode === 'assign') {
    const value = argv.value || argv.v;
    if (!value) {
      console.error('Missing --value argument for assign mode');
      await mongoose.disconnect();
      process.exit(1);
    }
    for (const s of skills) {
      bulkOps.push({ updateOne: { filter: { _id: s._id }, update: { $set: { skillVoice: value } } } });
    }
  } else if (mode === 'generate') {
    const baseUrl = argv.baseUrl || argv.b;
    if (!baseUrl) {
      console.error('Missing --baseUrl argument for generate mode');
      await mongoose.disconnect();
      process.exit(1);
    }
    let idx = 1;
    for (const s of skills) {
      const url = `${baseUrl}${idx}.mp3`;
      bulkOps.push({ updateOne: { filter: { _id: s._id }, update: { $set: { skillVoice: url } } } });
      idx++;
    }
  } else if (mode === 'file') {
    const filePath = argv.file || argv.f;
    if (!filePath) {
      console.error('Missing --file argument for file mode');
      await mongoose.disconnect();
      process.exit(1);
    }
    const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (!fs.existsSync(absolute)) {
      console.error('File not found:', absolute);
      await mongoose.disconnect();
      process.exit(1);
    }
    let raw;
    try {
      raw = fs.readFileSync(absolute, 'utf8');
    } catch (err) {
      console.error('Failed to read file:', absolute);
      console.error(err.message || err);
      await mongoose.disconnect();
      process.exit(1);
    }
    let map;
    try {
      map = JSON.parse(raw);
    } catch (err) {
      console.error('Invalid JSON in file:', absolute);
      console.error(err.message || err);
      await mongoose.disconnect();
      process.exit(1);
    }
    for (const s of skills) {
      const val = map[s._id.toString()];
      if (val !== undefined) {
        bulkOps.push({ updateOne: { filter: { _id: s._id }, update: { $set: { skillVoice: val } } } });
      }
    }
  } else {
    console.error('Unknown mode:', mode);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (bulkOps.length === 0) {
    console.log('No updates to perform');
    await mongoose.disconnect();
    return;
  }

  try {
    const res = await Skill.bulkWrite(bulkOps, { ordered: false });
    console.log('Bulk update completed. Matched:', res.matchedCount, 'Modified:', res.modifiedCount, 'Upserts:', res.upsertedCount || 0);
  } catch (err) {
    console.error('Bulk update failed:');
    console.error(err.message || err);
  } finally {
    await mongoose.disconnect();
    console.log('Done');
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
