#!/usr/bin/env node
import dotenv from 'dotenv';
import DatabaseConfig from '../../src/config/databaseConfig.js';
import Question from '../../src/models/question.schema.js';

dotenv.config();

const QUESTION_TEXT = 'Giá trị của số được gạch chân là mấy?';
const QUESTION_TYPE = 'tim_gia_tri_so';
const DETAIL_TYPE = 'tim_gia_tri_so';
const HINT_VOICE =
  'Muốn biết giá trị của một chữ số trong một số, bạn hãy nhìn vị trí của chữ số đó từ trái sang phải. Chúng ta có hàng trăm đứng trước, sau đó đến hàng chục và cuối cùng là hàng đơn vị. Hãy xem các số dưới đây và lựa chọn đáp án phù hợp nhé.';
const CHOICES = ['100', '10', '1'];
const POSITION_TO_ANSWER = { 
  1: '100',
  2: '10',
  3: '1'
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    quizId: '',
    count: 30,
    raws: '',
    numbers: '',
    positionOrder: '1,2,3',
    dryRun: false
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (!arg.startsWith('--')) continue;
    const [key, value = ''] = arg.split('=');

    if (key === '--quizId') options.quizId = value.trim();
    if (key === '--count') options.count = Number.parseInt(value, 10);
    if (key === '--raws') options.raws = value.trim();
    if (key === '--numbers') options.numbers = value.trim();
    if (key === '--position-order') options.positionOrder = value.trim();
  }

  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/add-database/add-database.js --quizId=<quiz_id> [--count=30] [--raws=136|1,248|2] [--numbers=136,248,975] [--position-order=3,2,1] [--dry-run]

Options:
  --quizId   Required. Quiz ID to insert questions into.
  --count    Number of random questions to generate when --raws is not provided. Default: 30.
  --raws     Comma-separated rawQuestion list, each item must be in format abc|p
             - abc: 3-digit number (100..999)
             - p: position from left, only 1,2,3
  --numbers  Comma-separated 3-digit numbers. Script will pair these numbers with --position-order.
             Example: --numbers=136,248,975 --position-order=3,1,2
  --position-order
             Position cycle for generated questions. Each value must be 1,2,3.
             Default: 1,2,3
  --dry-run  Validate and preview without inserting to DB.

Examples:
  node scripts/add-database/add-database.js --quizId=69c4f54c8c15feaf9b90b785 --count=20
  node scripts/add-database/add-database.js --quizId=69c4f54c8c15feaf9b90b785 --raws=136|1,248|2,975|3
  node scripts/add-database/add-database.js --quizId=69c4f54c8c15feaf9b90b785 --numbers=321,456,789 --position-order=3,2,1 --count=9
`);
}

function validateRawQuestion(rawQuestion) {
  if (typeof rawQuestion !== 'string') {
    throw new Error(`rawQuestion must be string. Received: ${typeof rawQuestion}`);
  }

  const trimmed = rawQuestion.trim();
  const match = trimmed.match(/^([1-9]\d{2})\|([123])$/);
  if (!match) {
    throw new Error(`Invalid rawQuestion "${rawQuestion}". Expected format abc|p (abc=3 digits, p=1/2/3).`);
  }

  const position = Number(match[2]);
  const answer = POSITION_TO_ANSWER[position];

  if (!answer) {
    throw new Error(`Position "${position}" is invalid. Only 1,2,3 are allowed.`);
  }

  return {
    rawQuestion: `${match[1]}|${position}`,
    answer
  };
}

function generateRandomRaws(count) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('--count must be a positive integer.');
  }

  const maxUnique = 900 * 3; // 100..999 with positions 1..3
  if (count > maxUnique) {
    throw new Error(`--count is too large. Max unique questions: ${maxUnique}.`);
  }

  const unique = new Set();
  while (unique.size < count) {
    const number = Math.floor(Math.random() * 900) + 100;
    const position = Math.floor(Math.random() * 3) + 1;
    unique.add(`${number}|${position}`);
  }

  return [...unique];
}

function parsePositionOrder(input) {
  const parts = String(input || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!parts.length) {
    throw new Error('--position-order must not be empty.');
  }

  const parsed = parts.map((item) => Number.parseInt(item, 10));
  for (const p of parsed) {
    if (![1, 2, 3].includes(p)) {
      throw new Error(`Invalid position "${p}" in --position-order. Only 1,2,3 are allowed.`);
    }
  }

  return parsed;
}

function parseNumbers(input) {
  const parts = String(input || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!parts.length) {
    throw new Error('--numbers must not be empty.');
  }

  for (const numberText of parts) {
    if (!/^[1-9]\d{2}$/.test(numberText)) {
      throw new Error(`Invalid number "${numberText}" in --numbers. Only 3-digit numbers (100..999) are allowed.`);
    }
  }

  return parts;
}

function generateRawsFromNumbers(numbers, positionOrder, count) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('--count must be a positive integer.');
  }

  const raws = [];
  for (let i = 0; i < count; i += 1) {
    const numberText = numbers[i % numbers.length];
    const position = positionOrder[i % positionOrder.length];
    raws.push(`${numberText}|${position}`);
  }
  return raws;
}

function generateRandomRawsByPositionOrder(count, positionOrder) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('--count must be a positive integer.');
  }

  const unique = new Set();
  let safety = 0;
  const maxTries = count * 30;

  while (unique.size < count && safety < maxTries) {
    const idx = unique.size;
    const position = positionOrder[idx % positionOrder.length];
    const number = Math.floor(Math.random() * 900) + 100;
    unique.add(`${number}|${position}`);
    safety += 1;
  }

  if (unique.size < count) {
    throw new Error('Cannot generate enough unique questions with current constraints.');
  }

  return [...unique];
}

function buildQuestionDoc(quizId, rawQuestion) {
  const { rawQuestion: normalizedRaw, answer } = validateRawQuestion(rawQuestion);

  return {
    quizId,
    questionText: QUESTION_TEXT,
    imageQuestion: null,
    choices: CHOICES,
    answer,
    questionType: QUESTION_TYPE,
    detailType: DETAIL_TYPE,
    rawQuestion: normalizedRaw,
    hintVoice: HINT_VOICE
  };
}

async function main() {
  const { quizId, count, raws, numbers, positionOrder, dryRun } = parseArgs();
  if (!quizId) {
    throw new Error('Missing required option: --quizId');
  }

  const positionOrderList = parsePositionOrder(positionOrder);

  let rawList = [];
  if (raws) {
    rawList = raws
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  } else if (numbers) {
    const numberList = parseNumbers(numbers);
    rawList = generateRawsFromNumbers(numberList, positionOrderList, count);
  } else if (positionOrderList.join(',') !== '1,2,3') {
    rawList = generateRandomRawsByPositionOrder(count, positionOrderList);
  } else {
    rawList = generateRandomRaws(count);
  }

  const docs = rawList.map((raw) => buildQuestionDoc(quizId, raw));

  if (dryRun) {
    console.log('Dry-run mode. No data inserted.');
    console.log(`Total valid questions: ${docs.length}`);
    console.log('Preview first 5 docs:');
    console.log(JSON.stringify(docs.slice(0, 5), null, 2));
    return;
  }

  const db = new DatabaseConfig();
  await db.connect();

  try {
    const result = await Question.insertMany(docs, { ordered: false });
    console.log(`Inserted ${result.length} questions successfully.`);
    console.log('Sample inserted docs:');
    console.log(
      JSON.stringify(
        result.slice(0, 3).map((doc) => ({
          _id: doc._id,
          quizId: doc.quizId,
          rawQuestion: doc.rawQuestion,
          answer: doc.answer
        })),
        null,
        2
      )
    );
  } finally {
    await db.disconnect();
  }
}

main().catch((error) => {
  console.error('Add database script failed:', error.message);
  process.exit(1);
});
