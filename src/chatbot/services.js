import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { getChatbotModels } from './models.js';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const GEMINI_TEXT_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TEXT_TIMEOUT_MS || '180000', 10);
const GEMINI_TEXT_MAX_OUTPUT_TOKENS = Number.parseInt(process.env.GEMINI_TEXT_MAX_OUTPUT_TOKENS || '8192', 10);

const CHATBOT_MAX_TEXT_CHARS = Number.parseInt(process.env.CHATBOT_MAX_TEXT_CHARS || '90000', 10);
const CHATBOT_MAX_ENTRIES_PER_FILE = Number.parseInt(process.env.CHATBOT_MAX_ENTRIES_PER_FILE || '180', 10);
const CHATBOT_SEARCH_LIMIT = Number.parseInt(process.env.CHATBOT_SEARCH_LIMIT || '30', 10);
const CHATBOT_MIN_MATCH_SCORE = Number.parseFloat(process.env.CHATBOT_MIN_MATCH_SCORE || '1.4');
const CHATBOT_MIN_SCORE_GAP = Number.parseFloat(process.env.CHATBOT_MIN_SCORE_GAP || '0.55');
const CHATBOT_MAX_HISTORY_MESSAGES = Number.parseInt(process.env.CHATBOT_MAX_HISTORY_MESSAGES || '20', 10);
const CHATBOT_GEMINI_CHUNK_CHARS = Number.parseInt(process.env.CHATBOT_GEMINI_CHUNK_CHARS || '45000', 10);
const CHATBOT_GEMINI_MAX_CHUNKS = Number.parseInt(process.env.CHATBOT_GEMINI_MAX_CHUNKS || '12', 10);
const CHATBOT_USE_ATLAS_SEARCH = String(process.env.CHATBOT_USE_ATLAS_SEARCH || 'true').toLowerCase() !== 'false';
const CHATBOT_ATLAS_SEARCH_INDEX = process.env.CHATBOT_ATLAS_SEARCH_INDEX || '';

const DEFAULT_DOMAIN = 'general';
const MAX_REGEX_TOKENS = 8;
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', '.json', '.log']);
const VI_STOPWORDS = new Set([
  'la', 'gi', 'cua', 'va', 'cho', 'tren',
  'duoc', 'voi', 'co', 'khong', 'nhung',
  'mot', 'cac', 'tu', 'den', 'tai', 'noi',
  'nao', 'di', 'a', 'ha', 'the', 'nhe',
  'please', 'help', 'can', 'you', 'is', 'are', 'the', 'what', 'which'
]);
const QUESTION_HINT_WORDS = new Set([
  'la', 'gi', 'nao', 'bao', 'nhieu', 'khi', 'sao', 'why', 'how', 'what', 'which'
]);

const FALLBACK_NO_MATCH_REPLY = 'Mình chưa tìm thấy thông tin phù hợp trong tài liệu đã chọn. Bạn thử hỏi cụ thể hơn nhé.';
const FALLBACK_AMBIGUOUS_REPLY = 'Mình thấy có vài kết quả gần nhau. Bạn có thể nói rõ hơn 1-2 từ khóa chính không?';

const CHATBOT_SYSTEM_PROMPT = [
  'Bạn là trợ lý tạo dữ liệu hỏi đáp từ văn bản tài liệu để chatbot trả lời tự nhiên.',
  'Nhiệm vụ: trích xuất danh sách hỏi đáp có cấu trúc, rõ nghĩa và bám sát nội dung tài liệu.',
  'Nếu tài liệu là bộ quy tắc/nội quy/chính sách, phải giữ đúng ý nghĩa gốc của quy định.',
  'Chỉ giữ nội dung xuất hiện hoặc suy ra hợp lý từ tài liệu được cung cấp.',
  'Viết câu trả lời tự nhiên, ngắn gọn, dễ hiểu; tránh văn phong máy móc và tránh lặp một khuôn câu cho nhiều entries.',
  'Trả lời thẳng vào thông tin chính, không chèn câu dẫn nguồn.',
  'Không mở đầu bằng các cụm như: "Theo tài liệu", "Trong tài liệu", "Dựa trên tài liệu".',
  'Chọn đại từ theo ngữ cảnh: chatbot dùng "mình"; thông tin tổ chức có thể dùng "chúng tôi"; thông tin cá nhân có thể dùng "tôi".',
  'Bắt buộc trả về DUY NHẤT JSON hợp lệ, không markdown, không giải thích thêm.',
  'Schema bắt buộc:',
  '{',
  '  "entries": [',
  '    {',
  '      "key": "string - ý chính/câu hỏi chính",',
  '      "aliases": ["string"],',
  '      "answer": "string - câu trả lời tự nhiên",',
  '      "topic": "string - chủ đề ngắn",',
  '      "intentType": "string - vd: definition, policy, process, contact, fact, comparison, troubleshooting",',
  '      "entityType": "string - vd: company, person, product, lesson, rule, deadline, location, general",',
  '      "tags": ["string"],',
  '      "source": "string - trích dẫn ngắn"',
  '    }',
  '  ]',
  '}',
  `Số lượng entries tối đa: ${CHATBOT_MAX_ENTRIES_PER_FILE}.`,
  'Nếu văn bản không có thông tin hữu ích để tạo hỏi đáp, trả về {"entries":[]}.'
].join('\n');

const geminiClient = axios.create({
  baseURL: GEMINI_API_BASE_URL
});

let atlasSearchUnavailable = false;
let textSearchUnavailable = false;

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const extractErrorDetail = (error) => {
  const apiError = error.response?.data?.error;

  if (typeof apiError === 'string') {
    return apiError;
  }

  if (apiError?.message) {
    return apiError.message;
  }

  return error.message || 'Unknown error';
};

const buildServiceError = (prefix, error) => {
  const status = error.response?.status;
  const detail = extractErrorDetail(error);
  const timeoutNote = error.code === 'ECONNABORTED' ? ' (request timeout)' : '';
  const statusText = status ? ` (status ${status})` : '';
  const serviceError = new Error(`${prefix}${statusText}${timeoutNote}: ${detail}`);
  serviceError.statusCode = status === 429 ? 429 : 502;
  return serviceError;
};

const requireGeminiApiKey = () => {
  if (!GEMINI_API_KEY) {
    throw createHttpError(500, 'Missing GEMINI_API_KEY. Please configure Gemini API key in .env.');
  }
};

const safeUnlink = async (filePath) => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[chatbot] Failed to remove temporary file: ${filePath}`);
    }
  }
};

const normalizeSpace = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const normalizeSearchText = (value) => {
  return normalizeSpace(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const dedupeArray = (items) => {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const normalized = normalizeSpace(item);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
};

const toLowerNoDiacritics = (value) => normalizeSearchText(value);

const buildNgrams = (tokens, size) => {
  const ngrams = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    ngrams.push(tokens.slice(index, index + size).join(' '));
  }
  return ngrams;
};

const buildQueryProfile = (message) => {
  const raw = normalizeSpace(message);
  const normalized = normalizeSearchText(raw);
  const rawTokens = raw
    .split(/\s+/u)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]+/gu, '').trim())
    .filter((token) => token.length > 1);
  const allTokens = normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
  const keywordTokens = allTokens.filter((token) => !VI_STOPWORDS.has(token));
  const rawKeywordTokens = rawTokens.filter((token) => !VI_STOPWORDS.has(normalizeSearchText(token)));
  const ngram2 = buildNgrams(keywordTokens, 2);
  const ngram3 = buildNgrams(keywordTokens, 3);
  const phraseCandidates = dedupeArray([
    keywordTokens.join(' '),
    ...ngram3,
    ...ngram2
  ]).filter((item) => item.split(' ').length >= 2);

  const keywordQuery = keywordTokens.join(' ');
  const rawKeywordQuery = rawKeywordTokens.join(' ');
  const textQuery = rawKeywordQuery || raw;
  const questionTone = allTokens.some((token) => QUESTION_HINT_WORDS.has(token));

  return {
    raw,
    normalized,
    allTokens,
    keywordTokens,
    rawKeywordTokens,
    phraseCandidates,
    keywordQuery,
    textQuery,
    questionTone
  };
};

const resolveUserId = (value) => {
  if (!value) {
    return 'anonymous';
  }

  return String(value);
};

const resolveObjectIds = (ids) => {
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids
    .map((item) => String(item))
    .filter((item) => mongoose.Types.ObjectId.isValid(item))
    .map((item) => new mongoose.Types.ObjectId(item));
};

const createConversationTitle = (message) => {
  const normalized = normalizeSpace(message);
  if (normalized.length <= 80) {
    return normalized;
  }
  return `${normalized.slice(0, 77)}...`;
};

const extractTextFromUploadedFile = async (file) => {
  const extension = path.extname(file.originalname || '').toLowerCase();

  if (TEXT_EXTENSIONS.has(extension) || file.mimetype?.startsWith('text/')) {
    return fs.readFile(file.path, 'utf8');
  }

  if (extension === '.pdf' || file.mimetype === 'application/pdf') {
    const dataBuffer = await fs.readFile(file.path);
    const parser = new PDFParse({ data: dataBuffer });

    try {
      const parsed = await parser.getText();
      return parsed.text || '';
    } finally {
      await parser.destroy();
    }
  }

  if (
    extension === '.docx'
    || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const parsed = await mammoth.extractRawText({ path: file.path });
    return parsed.value || '';
  }

  throw createHttpError(400, `Unsupported file type for local parse: ${file.originalname}`);
};

const extractGeminiText = (data) => {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const firstCandidate = candidates[0];
  const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : [];
  const text = parts
    .map((part) => part?.text)
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join('\n')
    .trim();

  if (text) {
    return text;
  }

  const finishReason = firstCandidate?.finishReason;
  if (finishReason) {
    throw new Error(`Gemini returned empty content (finishReason: ${finishReason}).`);
  }

  throw new Error('Gemini returned empty content.');
};

const removeCodeFences = (value) => {
  let cleaned = normalizeSpace(value);

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\s*/, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }

  return cleaned.trim();
};

const parseKnowledgeJson = (rawText) => {
  const baseText = removeCodeFences(rawText);
  const candidates = [baseText];

  const objectStart = baseText.indexOf('{');
  const objectEnd = baseText.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(baseText.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = baseText.indexOf('[');
  const arrayEnd = baseText.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    candidates.push(baseText.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);

      if (Array.isArray(parsed)) {
        return { entries: parsed };
      }

      if (Array.isArray(parsed?.entries)) {
        return { entries: parsed.entries };
      }

      if (parsed && typeof parsed === 'object' && parsed.key && parsed.answer) {
        return { entries: [parsed] };
      }
    } catch (error) {
      continue;
    }
  }

  throw new Error('Gemini did not return valid JSON entries.');
};

const ensureStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set();
  const cleaned = [];

  for (const item of value) {
    const normalized = normalizeSpace(String(item || ''));
    if (!normalized) {
      continue;
    }

    const dedupeKey = normalized.toLowerCase();
    if (unique.has(dedupeKey)) {
      continue;
    }

    unique.add(dedupeKey);
    cleaned.push(normalized);
  }

  return cleaned;
};

const sanitizeAnswerStyle = (value) => {
  let cleaned = normalizeSpace(value);
  if (!cleaned) {
    return '';
  }

  const normalized = normalizeSearchText(cleaned);
  const leadingMetaPrefixes = [
    'theo tai lieu',
    'trong tai lieu',
    'dua tren tai lieu',
    'tai lieu cho biet',
    'document states',
    'according to the document'
  ];

  if (leadingMetaPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    cleaned = cleaned.replace(/^[^:,\-.\n]{0,120}[:,\-.\n]?\s*/u, '');
  }

  cleaned = cleaned.replace(/^[,.:;\-\s]+/u, '').trim();
  if (!cleaned) {
    return '';
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const normalizeIntentType = (value) => {
  const normalized = toLowerNoDiacritics(value);
  if (!normalized) {
    return 'fact';
  }

  if (/(dinh nghia|definition|khai niem|la gi|what is)/.test(normalized)) {
    return 'definition';
  }
  if (/(quy dinh|noi quy|policy|quy tac|rule)/.test(normalized)) {
    return 'policy';
  }
  if (/(quy trinh|process|cac buoc|huong dan|workflow)/.test(normalized)) {
    return 'process';
  }
  if (/(lien he|contact|so dien thoai|email)/.test(normalized)) {
    return 'contact';
  }
  if (/(deadline|han|thoi han|bao gio|khi nao)/.test(normalized)) {
    return 'deadline';
  }
  if (/(so sanh|khac nhau|comparison|vs)/.test(normalized)) {
    return 'comparison';
  }
  if (/(loi|su co|khac phuc|troubleshoot|fix)/.test(normalized)) {
    return 'troubleshooting';
  }

  return 'fact';
};

const normalizeEntityType = (value) => {
  const normalized = toLowerNoDiacritics(value);
  if (!normalized) {
    return 'general';
  }

  if (/(company|cong ty|doanh nghiep|to chuc|organization)/.test(normalized)) {
    return 'company';
  }
  if (/(person|nguoi|giao vien|hoc sinh|sinh vien|nhan su)/.test(normalized)) {
    return 'person';
  }
  if (/(product|san pham|dich vu|service)/.test(normalized)) {
    return 'product';
  }
  if (/(lesson|bai hoc|chapter|chuong|mon hoc)/.test(normalized)) {
    return 'lesson';
  }
  if (/(rule|policy|quy dinh|noi quy|quy tac)/.test(normalized)) {
    return 'rule';
  }
  if (/(deadline|han|thoi han|date)/.test(normalized)) {
    return 'deadline';
  }
  if (/(location|dia diem|noi)/.test(normalized)) {
    return 'location';
  }

  return 'general';
};

const detectQuerySemantics = (profile) => {
  const normalized = profile.normalized || '';

  const entityType = normalizeEntityType(normalized);
  const intentType = normalizeIntentType(normalized);

  return {
    intentType,
    entityType
  };
};

const makeAnswerNatural = ({
  answer,
  queryProfile,
  entityType
}) => {
  let text = sanitizeAnswerStyle(answer);
  if (!text) {
    return '';
  }

  const queryNormalized = queryProfile?.normalized || '';
  const asksAssistantName = /(ban ten la gi|ten ban la gi|goi ban la gi|ban la ai)/.test(queryNormalized);
  if (asksAssistantName) {
    const match = text.match(/(?:ten(?: cua)?(?: chatbot| tro ly| ai)?(?: la)?\s*)(.+)$/iu)
      || text.match(/(?:toi la|mình là|minh la|i am)\s*(.+)$/iu);
    if (match?.[1]) {
      const assistantName = normalizeSpace(match[1]).replace(/[.。]+$/u, '');
      if (assistantName) {
        return `Mình là ${assistantName}.`;
      }
    }
  }

  if (!/[.!?]$/u.test(text)) {
    text = `${text}.`;
  }

  return text;
};

const sanitizeKnowledgeEntries = ({
  rawEntries,
  userId,
  documentId,
  defaultSource
}) => {
  const sanitized = [];
  const seenKeys = new Set();

  for (const rawEntry of rawEntries) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      continue;
    }

    const key = normalizeSpace(rawEntry.key || rawEntry.question || rawEntry.title || '');
    const answer = sanitizeAnswerStyle(
      rawEntry.answer || rawEntry.response || rawEntry.content || ''
    );

    if (!key || !answer) {
      continue;
    }

    const keyNormalized = normalizeSearchText(key);
    if (!keyNormalized || seenKeys.has(keyNormalized)) {
      continue;
    }
    seenKeys.add(keyNormalized);

    const aliases = ensureStringArray(rawEntry.aliases || rawEntry.alias || rawEntry.keywords || [])
      .filter((alias) => normalizeSearchText(alias) !== keyNormalized);

    const tags = ensureStringArray(rawEntry.tags || rawEntry.tag || []);

    const topic = normalizeSpace(rawEntry.topic || rawEntry.subject || rawEntry.category || '');
    const source = normalizeSpace(rawEntry.source || defaultSource || '');
    const intentType = normalizeIntentType(rawEntry.intentType || rawEntry.intent || topic || key);
    const entityType = normalizeEntityType(rawEntry.entityType || rawEntry.entity || topic || key);
    const keyPhrases = dedupeArray([
      key,
      ...aliases.slice(0, 5),
      topic
    ]).map((item) => normalizeSearchText(item)).filter((item) => item.length > 0);

    const searchText = normalizeSpace([
      key,
      ...aliases,
      topic,
      intentType,
      entityType,
      ...keyPhrases,
      ...tags,
      answer
    ].join(' '));

    sanitized.push({
      userId,
      documentId,
      key,
      keyNormalized,
      aliases,
      answer,
      topic,
      intentType,
      entityType,
      keyPhrases,
      tags,
      source,
      domain: DEFAULT_DOMAIN,
      searchText
    });

    if (sanitized.length >= CHATBOT_MAX_ENTRIES_PER_FILE) {
      break;
    }
  }

  return sanitized;
};

const createFallbackKnowledgeEntryFromText = ({
  userId,
  documentId,
  fileName,
  text
}) => {
  const cleaned = normalizeSpace(text);
  if (!cleaned) {
    return null;
  }

  const snippet = cleaned.slice(0, 900);
  const baseName = path.parse(fileName || '').name || 'tai_lieu';
  const key = `Nội dung chính trong tài liệu ${baseName} là gì?`;
  const keyNormalized = normalizeSearchText(key);
  if (!keyNormalized) {
    return null;
  }

  return {
    userId,
    documentId,
    key,
    keyNormalized,
    aliases: [
      `tóm tắt ${baseName}`,
      `thông tin trong ${baseName}`
    ].map((item) => normalizeSpace(item)).filter(Boolean),
    answer: snippet,
    topic: 'tổng quan tài liệu',
    intentType: 'summary',
    entityType: 'general',
    keyPhrases: dedupeArray([key, baseName]).map((item) => normalizeSearchText(item)).filter(Boolean),
    tags: ['tong_quan', 'tai_lieu'],
    source: fileName || '',
    domain: DEFAULT_DOMAIN,
    searchText: normalizeSpace([key, baseName, 'summary', 'general', snippet].join(' '))
  };
};

const splitTextForGemini = ({
  text,
  targetChunkChars,
  maxChunks
}) => {
  const normalizedText = normalizeSpace(text);
  if (!normalizedText) {
    return [];
  }

  const safeTargetChars = Number.isFinite(targetChunkChars)
    ? Math.max(4000, targetChunkChars)
    : 45000;
  const safeMaxChunks = Number.isFinite(maxChunks)
    ? Math.max(1, maxChunks)
    : 12;

  if (normalizedText.length <= safeTargetChars) {
    return [normalizedText];
  }

  const chunks = [];
  const paragraphs = normalizedText.split(/\n{2,}/u).map((part) => part.trim()).filter(Boolean);
  let currentChunk = '';

  const pushChunk = () => {
    const chunk = normalizeSpace(currentChunk);
    if (chunk) {
      chunks.push(chunk);
    }
    currentChunk = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > safeTargetChars) {
      if (currentChunk) {
        pushChunk();
      }

      for (let index = 0; index < paragraph.length; index += safeTargetChars) {
        chunks.push(paragraph.slice(index, index + safeTargetChars));
      }
      continue;
    }

    const separator = currentChunk ? '\n\n' : '';
    const nextChunk = `${currentChunk}${separator}${paragraph}`;
    if (nextChunk.length > safeTargetChars) {
      pushChunk();
      currentChunk = paragraph;
    } else {
      currentChunk = nextChunk;
    }
  }

  if (currentChunk) {
    pushChunk();
  }

  if (chunks.length <= safeMaxChunks) {
    return chunks;
  }

  // If there are too many chunks, rebalance by hard slicing to keep full coverage with bounded requests.
  const balancedChunkSize = Math.ceil(normalizedText.length / safeMaxChunks);
  const rebalanced = [];
  for (let index = 0; index < normalizedText.length; index += balancedChunkSize) {
    rebalanced.push(normalizedText.slice(index, index + balancedChunkSize));
  }

  return rebalanced.slice(0, safeMaxChunks);
};

const requestGeminiKnowledgeJson = async ({ promptText }) => {
  const response = await geminiClient.post(`/models/${GEMINI_TEXT_MODEL}:generateContent`, {
    systemInstruction: {
      parts: [{ text: CHATBOT_SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      temperature: 0.15,
      topP: 0.9,
      maxOutputTokens: Number.isFinite(GEMINI_TEXT_MAX_OUTPUT_TOKENS)
        ? GEMINI_TEXT_MAX_OUTPUT_TOKENS
        : 8192,
      responseMimeType: 'application/json'
    }
  }, {
    headers: {
      'x-goog-api-key': GEMINI_API_KEY,
      'Content-Type': 'application/json'
    },
    timeout: GEMINI_TEXT_TIMEOUT_MS
  });

  return extractGeminiText(response.data);
};

const requestGeminiEntriesWithRepair = async ({ promptText }) => {
  const firstRaw = await requestGeminiKnowledgeJson({ promptText });

  try {
    return parseKnowledgeJson(firstRaw).entries || [];
  } catch (parseError) {
    const repairPrompt = [
      'Nội dung dưới đây KHÔNG hợp lệ JSON. Hãy sửa lại thành JSON hợp lệ theo đúng schema.',
      'Không thêm giải thích.',
      'Nội dung cần sửa:',
      firstRaw
    ].join('\n\n');

    const repairedRaw = await requestGeminiKnowledgeJson({ promptText: repairPrompt });
    return parseKnowledgeJson(repairedRaw).entries || [];
  }
};

const generateKnowledgeFromText = async ({
  fileName,
  documentText
}) => {
  requireGeminiApiKey();

  const safeText = normalizeSpace(documentText);
  if (!safeText) {
    return [];
  }

  const chunkChars = Math.min(
    Math.max(4000, CHATBOT_GEMINI_CHUNK_CHARS),
    Math.max(2000, CHATBOT_MAX_TEXT_CHARS)
  );
  const textChunks = splitTextForGemini({
    text: safeText,
    targetChunkChars: chunkChars,
    maxChunks: CHATBOT_GEMINI_MAX_CHUNKS
  });
  const totalChunks = textChunks.length;
  const chunkEntryLimit = Math.max(
    8,
    Math.ceil(CHATBOT_MAX_ENTRIES_PER_FILE / Math.max(1, totalChunks))
  );

  try {
    const collectedEntries = [];

    for (let index = 0; index < textChunks.length; index += 1) {
      const chunk = textChunks[index];
      const isSingleChunk = totalChunks === 1;
      const partLabel = isSingleChunk
        ? 'Đây là toàn bộ văn bản tài liệu.'
        : `Đây là phần ${index + 1}/${totalChunks} của cùng một tài liệu. Hãy chỉ dùng thông tin xuất hiện trong phần này.`;

      const promptText = [
        `Tài liệu: ${fileName}`,
        partLabel,
        `Trả về tối đa ${chunkEntryLimit} entries cho phần này.`,
        'Văn bản tài liệu:',
        '---BEGIN_DOCUMENT---',
        chunk,
        '---END_DOCUMENT---'
      ].join('\n\n');

      const chunkEntries = await requestGeminiEntriesWithRepair({ promptText });
      if (Array.isArray(chunkEntries) && chunkEntries.length > 0) {
        collectedEntries.push(...chunkEntries);
      }

      if (collectedEntries.length >= CHATBOT_MAX_ENTRIES_PER_FILE * 2) {
        break;
      }
    }

    return collectedEntries;
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }
    throw buildServiceError('Failed to create structured knowledge with Gemini', error);
  }
};

const computeHeuristicScore = ({
  profile,
  semantics,
  entry
}) => {
  const queryNormalized = profile.normalized;
  const queryTokens = profile.keywordTokens;
  const queryPhrases = profile.phraseCandidates;
  const keyNormalized = normalizeSearchText(entry.key || '');
  const aliasesNormalized = Array.isArray(entry.aliases)
    ? entry.aliases.map((alias) => normalizeSearchText(alias))
    : [];
  const topicNormalized = normalizeSearchText(entry.topic || '');
  const answerNormalized = normalizeSearchText(entry.answer || '');
  const intentNormalized = normalizeIntentType(entry.intentType || '');
  const entityNormalized = normalizeEntityType(entry.entityType || '');
  const keyPhrasesNormalized = Array.isArray(entry.keyPhrases)
    ? entry.keyPhrases.map((item) => normalizeSearchText(item))
    : [];
  const queryCompact = queryTokens.join(' ');

  if (!queryNormalized || !keyNormalized) {
    return 0;
  }

  let score = 0;

  if (keyNormalized === queryNormalized) {
    score += 10;
  }

  if (queryCompact && keyNormalized.includes(queryCompact)) {
    score += 7.5;
  }

  for (const phrase of queryPhrases) {
    if (phrase.length < 4) {
      continue;
    }

    if (keyNormalized.includes(phrase)) {
      score += 5.2;
      continue;
    }

    if (aliasesNormalized.some((alias) => alias.includes(phrase))) {
      score += 4.2;
      continue;
    }

    if (keyPhrasesNormalized.some((candidate) => candidate.includes(phrase))) {
      score += 3.5;
      continue;
    }
  }

  let tokenHits = 0;
  for (const token of queryTokens) {
    if (keyNormalized.includes(token)) {
      score += 2.2;
      tokenHits += 1;
      continue;
    }

    if (aliasesNormalized.some((alias) => alias.includes(token))) {
      score += 1.8;
      tokenHits += 1;
      continue;
    }

    if (topicNormalized.includes(token)) {
      score += 1.0;
      tokenHits += 1;
      continue;
    }

    if (answerNormalized.includes(token)) {
      score += 0.12;
      continue;
    }

    if (keyPhrasesNormalized.some((candidate) => candidate.includes(token))) {
      score += 1.1;
    }
  }

  if (queryTokens.length > 0) {
    score += (tokenHits / queryTokens.length) * 2.5;
  }

  if (semantics.intentType && intentNormalized === semantics.intentType) {
    score += 1.2;
  }

  if (semantics.entityType && entityNormalized === semantics.entityType) {
    score += 1.3;
  }

  if (profile.questionTone && /(definition|fact|contact|policy|process|summary)/.test(intentNormalized)) {
    score += 0.4;
  }

  return Number(score.toFixed(4));
};

const channelBoost = (candidate, profile) => {
  const baseScore = Number(candidate.score) || 0;
  const queryTokenCount = profile.keywordTokens.length;
  const lowTokenPenalty = queryTokenCount <= 1 ? 0.35 : 1;

  if (candidate.matchedBy === 'atlas') {
    return Math.min(baseScore * 0.8, 9.5);
  }

  if (candidate.matchedBy === 'text') {
    return Math.min(baseScore * 0.55, 5.2);
  }

  return Math.min(baseScore * lowTokenPenalty * 0.35, 2.4);
};

const mergeAndRankCandidates = ({
  profile,
  semantics,
  candidates
}) => {
  const merged = new Map();

  for (const candidate of candidates) {
    const candidateId = String(candidate._id);
    const heuristic = computeHeuristicScore({
      profile,
      semantics,
      entry: candidate
    });
    const finalScore = Number((heuristic + channelBoost(candidate, profile)).toFixed(4));

    const normalizedCandidate = {
      ...candidate,
      finalScore,
      heuristicScore: heuristic
    };

    const existing = merged.get(candidateId);
    if (!existing || normalizedCandidate.finalScore > existing.finalScore) {
      merged.set(candidateId, normalizedCandidate);
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => right.finalScore - left.finalScore);
};

const searchWithAtlas = async ({
  ChatbotKnowledge,
  userId,
  selectedDocIds,
  profile,
  limit
}) => {
  if (!CHATBOT_USE_ATLAS_SEARCH || !CHATBOT_ATLAS_SEARCH_INDEX || atlasSearchUnavailable) {
    return [];
  }

  try {
    const queryText = profile.textQuery || profile.raw;
    const rows = await ChatbotKnowledge.aggregate([
      {
        $search: {
          index: CHATBOT_ATLAS_SEARCH_INDEX,
          text: {
            query: queryText,
            path: ['key', 'aliases', 'keyPhrases', 'topic', 'tags', 'searchText', 'intentType', 'entityType', 'answer'],
            fuzzy: {
              maxEdits: 2,
              prefixLength: 1
            }
          }
        }
      },
      {
        $match: {
          userId,
          documentId: { $in: selectedDocIds }
        }
      },
      {
        $project: {
          key: 1,
          aliases: 1,
          answer: 1,
          topic: 1,
          intentType: 1,
          entityType: 1,
          keyPhrases: 1,
          tags: 1,
          source: 1,
          documentId: 1,
          score: { $meta: 'searchScore' }
        }
      },
      { $limit: limit }
    ]);

    return rows.map((row) => ({
      ...row,
      matchedBy: 'atlas'
    }));
  } catch (error) {
    atlasSearchUnavailable = true;
    console.warn(`[chatbot] Atlas Search unavailable, fallback to local text search. ${extractErrorDetail(error)}`);
    return [];
  }
};

const searchWithTextIndex = async ({
  ChatbotKnowledge,
  userId,
  selectedDocIds,
  profile,
  limit
}) => {
  if (textSearchUnavailable) {
    return [];
  }

  try {
    const queryText = profile.textQuery || profile.raw;
    const rows = await ChatbotKnowledge.aggregate([
      {
        $match: {
          userId,
          documentId: { $in: selectedDocIds }
        }
      },
      { $match: { $text: { $search: queryText } } },
      { $addFields: { textScore: { $meta: 'textScore' } } },
      { $sort: { textScore: -1 } },
      { $limit: limit },
      {
        $project: {
          key: 1,
          aliases: 1,
          answer: 1,
          topic: 1,
          intentType: 1,
          entityType: 1,
          keyPhrases: 1,
          tags: 1,
          source: 1,
          documentId: 1,
          score: '$textScore'
        }
      }
    ]);

    return rows.map((row) => ({
      ...row,
      matchedBy: 'text'
    }));
  } catch (error) {
    textSearchUnavailable = true;
    console.warn(`[chatbot] Text index unavailable, fallback to regex search. ${extractErrorDetail(error)}`);
    return [];
  }
};

const searchWithRegex = async ({
  ChatbotKnowledge,
  userId,
  selectedDocIds,
  profile,
  limit
}) => {
  const semantics = detectQuerySemantics(profile);
  const queryTokens = profile.keywordTokens.slice(0, MAX_REGEX_TOKENS);
  if (queryTokens.length === 0) {
    return [];
  }

  const orConditions = [];
  for (const token of queryTokens) {
    const regex = new RegExp(escapeRegExp(token), 'i');
    orConditions.push({ key: regex });
    orConditions.push({ aliases: regex });
    orConditions.push({ keyPhrases: regex });
    orConditions.push({ topic: regex });
    orConditions.push({ tags: regex });
    orConditions.push({ intentType: regex });
    orConditions.push({ entityType: regex });
    orConditions.push({ searchText: regex });
    orConditions.push({ answer: regex });
  }

  const rows = await ChatbotKnowledge.find({
    userId,
    documentId: { $in: selectedDocIds },
    $or: orConditions
  })
    .select('key aliases answer topic intentType entityType keyPhrases tags source documentId')
    .limit(Math.max(limit * 2, 30))
    .lean();

  return rows
    .map((row) => ({
      ...row,
      score: computeHeuristicScore({
        profile,
        semantics,
        entry: row
      }),
      matchedBy: 'regex'
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
};

const findKnowledgeMatches = async ({
  ChatbotKnowledge,
  userId,
  selectedDocIds,
  message
}) => {
  const profile = buildQueryProfile(message);
  const semantics = detectQuerySemantics(profile);
  const normalizedLimit = Number.isFinite(CHATBOT_SEARCH_LIMIT)
    ? Math.max(5, Math.min(100, CHATBOT_SEARCH_LIMIT))
    : 30;

  const [atlasCandidates, textCandidates] = await Promise.all([
    searchWithAtlas({
      ChatbotKnowledge,
      userId,
      selectedDocIds,
      profile,
      limit: normalizedLimit
    }),
    searchWithTextIndex({
      ChatbotKnowledge,
      userId,
      selectedDocIds,
      profile,
      limit: normalizedLimit
    })
  ]);

  const primaryCandidates = mergeAndRankCandidates({
    profile,
    semantics,
    candidates: [
      ...atlasCandidates,
      ...textCandidates
    ]
  });

  if (primaryCandidates.length > 0) {
    return {
      profile,
      semantics,
      matches: primaryCandidates
    };
  }

  const regexCandidates = await searchWithRegex({
    ChatbotKnowledge,
    userId,
    selectedDocIds,
    profile,
    limit: normalizedLimit
  });

  const allMatches = mergeAndRankCandidates({
    profile,
    semantics,
    candidates: [
      ...regexCandidates
    ]
  });

  return {
    profile,
    semantics,
    matches: allMatches
  };
};

const buildAmbiguousReply = ({
  queryProfile,
  topMatches,
  documentNameMap
}) => {
  const hints = topMatches
    .slice(0, 2)
    .map((item) => {
      const topic = normalizeSpace(item.topic || '');
      const key = normalizeSpace(item.key || '');
      const docName = documentNameMap.get(String(item.documentId)) || 'tài liệu';
      const shortKey = key.length > 52 ? `${key.slice(0, 49)}...` : key;
      if (topic) {
        return `${topic} (${docName})`;
      }
      return `${shortKey} (${docName})`;
    });

  if (hints.length > 0) {
    return `${FALLBACK_AMBIGUOUS_REPLY} Bạn đang muốn ý nào trong: ${hints.join(' hoặc ')}?`;
  }

  if (queryProfile?.questionTone) {
    return `${FALLBACK_AMBIGUOUS_REPLY} Bạn thử thêm từ khóa đặc trưng hơn nhé.`;
  }

  return FALLBACK_AMBIGUOUS_REPLY;
};

const isConfidentMatch = ({
  matches
}) => {
  const best = matches[0];
  if (!best) {
    return false;
  }

  if (best.finalScore < CHATBOT_MIN_MATCH_SCORE) {
    return false;
  }

  const second = matches[1];
  if (!second) {
    return true;
  }

  const gap = best.finalScore - second.finalScore;
  return gap >= CHATBOT_MIN_SCORE_GAP;
};

const pickAnswerFromMatch = ({
  bestMatch,
  queryProfile
}) => {
  return makeAnswerNatural({
    answer: bestMatch.answer,
    queryProfile,
    entityType: bestMatch.entityType || 'general'
  });
};

const trimSources = ({
  matches,
  docMap
}) => {
  return matches.slice(0, 3).map((entry) => ({
    documentId: entry.documentId,
    documentName: docMap.get(String(entry.documentId)) || 'Unknown document',
    entryId: entry._id,
    key: entry.key,
    topic: entry.topic || '',
    matchedBy: entry.matchedBy || 'hybrid',
    score: Number(entry.finalScore.toFixed(4)),
    intentType: entry.intentType || 'fact',
    entityType: entry.entityType || 'general'
  }));
};

const gatherAssistantResponse = ({
  queryProfile,
  matches,
  docMap
}) => {
  if (!matches.length) {
    return {
      answer: FALLBACK_NO_MATCH_REPLY,
      sources: []
    };
  }

  if (!isConfidentMatch({ matches })) {
    return {
      answer: buildAmbiguousReply({
        queryProfile,
        topMatches: matches,
        documentNameMap: docMap
      }),
      sources: trimSources({ matches, docMap })
    };
  }

  const bestMatch = matches[0];
  const answer = pickAnswerFromMatch({
    bestMatch,
    queryProfile
  });

  return {
    answer: answer || FALLBACK_NO_MATCH_REPLY,
    sources: trimSources({ matches, docMap })
  };
};

const buildSearchDebug = ({
  queryProfile,
  semantics,
  matches
}) => {
  const top = matches.slice(0, 3).map((item) => ({
    key: item.key,
    matchedBy: item.matchedBy,
    finalScore: item.finalScore,
    intentType: item.intentType || 'fact',
    entityType: item.entityType || 'general'
  }));

  return {
    rawQuery: queryProfile.raw,
    queryText: queryProfile.textQuery,
    keywordTokens: queryProfile.keywordTokens,
    rawKeywordTokens: queryProfile.rawKeywordTokens,
    intentType: semantics.intentType,
    entityType: semantics.entityType,
    top
  };
};

export const uploadAndIndexDocuments = async ({ files, userId }) => {
  if (!Array.isArray(files) || files.length === 0) {
    throw createHttpError(400, 'No files were uploaded.');
  }

  requireGeminiApiKey();

  const normalizedUserId = resolveUserId(userId);
  const { ChatbotDocument, ChatbotKnowledge } = await getChatbotModels();
  const uploadResults = [];

  for (const file of files) {
    const document = await ChatbotDocument.create({
      userId: normalizedUserId,
      originalName: file.originalname,
      storedName: file.filename,
      storagePath: file.path,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      status: 'processing',
      entryCount: 0,
      domain: DEFAULT_DOMAIN,
      geminiFileName: null,
      geminiFileUri: null,
      geminiFileState: null
    });

    try {
      const rawText = await extractTextFromUploadedFile(file);
      const normalizedText = normalizeSpace(rawText);

      if (!normalizedText) {
        throw createHttpError(400, 'Tài liệu không có nội dung text để xử lý.');
      }

      const rawEntries = await generateKnowledgeFromText({
        fileName: file.originalname,
        documentText: normalizedText
      });

      const knowledgeEntries = sanitizeKnowledgeEntries({
        rawEntries,
        userId: normalizedUserId,
        documentId: document._id,
        defaultSource: file.originalname
      });

      if (knowledgeEntries.length === 0) {
        const fallbackEntry = createFallbackKnowledgeEntryFromText({
          userId: normalizedUserId,
          documentId: document._id,
          fileName: file.originalname,
          text: normalizedText
        });

        if (fallbackEntry) {
          knowledgeEntries.push(fallbackEntry);
        }
      }

      if (knowledgeEntries.length === 0) {
        throw new Error('Không tạo được entry hợp lệ từ tài liệu.');
      }

      await ChatbotKnowledge.deleteMany({ documentId: document._id });
      await ChatbotKnowledge.insertMany(knowledgeEntries, { ordered: true });

      document.status = 'ready';
      document.entryCount = knowledgeEntries.length;
      document.errorMessage = null;
      await document.save();

      uploadResults.push({
        documentId: String(document._id),
        fileName: document.originalName,
        status: 'ready',
        entryCount: knowledgeEntries.length
      });
    } catch (error) {
      if (ChatbotKnowledge?.deleteMany) {
        await ChatbotKnowledge.deleteMany({ documentId: document._id });
      }

      document.status = 'failed';
      document.entryCount = 0;
      document.errorMessage = error.message;
      await document.save();

      uploadResults.push({
        documentId: String(document._id),
        fileName: document.originalName,
        status: 'failed',
        error: error.message
      });
    } finally {
      await safeUnlink(file.path);
    }
  }

  return uploadResults;
};

export const listDocuments = async ({ userId, limit = 100 }) => {
  const normalizedUserId = resolveUserId(userId);
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 100;
  const { ChatbotDocument } = await getChatbotModels();

  const documents = await ChatbotDocument.find({ userId: normalizedUserId })
    .sort({ createdAt: -1 })
    .limit(normalizedLimit)
    .lean();

  return documents.map((document) => ({
    documentId: String(document._id),
    userId: document.userId,
    originalName: document.originalName,
    mimeType: document.mimeType,
    size: document.size,
    status: document.status,
    entryCount: document.entryCount || 0,
    chunkCount: document.entryCount || 0,
    errorMessage: document.errorMessage,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  }));
};

export const listConversations = async ({ userId, limit = 50 }) => {
  const normalizedUserId = resolveUserId(userId);
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, limit)) : 50;
  const { ChatbotConversation } = await getChatbotModels();

  const conversations = await ChatbotConversation.find({ userId: normalizedUserId })
    .sort({ lastMessageAt: -1 })
    .limit(normalizedLimit)
    .lean();

  return conversations.map((conversation) => ({
    conversationId: String(conversation._id),
    userId: conversation.userId,
    title: conversation.title,
    selectedDocumentIds: conversation.selectedDocumentIds.map((item) => String(item)),
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt
  }));
};

export const getConversationMessages = async ({ conversationId, userId, limit = 100 }) => {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    throw createHttpError(400, 'Invalid conversationId.');
  }

  const normalizedUserId = resolveUserId(userId);
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 100;
  const { ChatbotConversation, ChatbotMessage } = await getChatbotModels();

  const conversation = await ChatbotConversation.findOne({
    _id: conversationId,
    userId: normalizedUserId
  });

  if (!conversation) {
    throw createHttpError(404, 'Conversation not found.');
  }

  const messages = await ChatbotMessage.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .limit(normalizedLimit)
    .lean();

  return messages.map((message) => ({
    messageId: String(message._id),
    role: message.role,
    content: message.content,
    sources: message.sources.map((source) => ({
      documentId: String(source.documentId),
      documentName: source.documentName,
      entryId: String(source.entryId),
      key: source.key,
      topic: source.topic,
      matchedBy: source.matchedBy,
      score: source.score,
      intentType: source.intentType,
      entityType: source.entityType
    })),
    createdAt: message.createdAt
  }));
};

export const sendChatMessage = async ({
  userId,
  conversationId,
  selectedDocumentIds,
  message
}) => {
  const normalizedUserId = resolveUserId(userId);
  const trimmedMessage = normalizeSpace(message);

  if (!trimmedMessage) {
    throw createHttpError(400, 'message is required.');
  }

  const {
    ChatbotDocument,
    ChatbotKnowledge,
    ChatbotConversation,
    ChatbotMessage
  } = await getChatbotModels();

  let conversation;
  if (conversationId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw createHttpError(400, 'Invalid conversationId.');
    }

    conversation = await ChatbotConversation.findOne({
      _id: conversationId,
      userId: normalizedUserId
    });

    if (!conversation) {
      throw createHttpError(404, 'Conversation not found.');
    }
  }

  const selectedIdsFromRequest = resolveObjectIds(selectedDocumentIds);
  const selectedIds = selectedIdsFromRequest.length > 0
    ? selectedIdsFromRequest
    : (conversation?.selectedDocumentIds || []);

  if (selectedIds.length === 0) {
    throw createHttpError(400, 'selectedDocumentIds must contain at least one valid id.');
  }

  const selectedDocuments = await ChatbotDocument.find({
    _id: { $in: selectedIds },
    userId: normalizedUserId,
    status: 'ready'
  })
    .select('_id originalName')
    .lean();

  if (selectedDocuments.length === 0) {
    throw createHttpError(404, 'No ready documents found for selectedDocumentIds.');
  }

  const selectedDocIds = selectedDocuments.map((document) => document._id);
  const docMap = new Map(selectedDocuments.map((document) => [String(document._id), document.originalName]));

  if (conversation) {
    conversation.selectedDocumentIds = selectedDocIds;
  } else {
    conversation = new ChatbotConversation({
      userId: normalizedUserId,
      title: createConversationTitle(trimmedMessage),
      selectedDocumentIds: selectedDocIds
    });
  }

  conversation.lastMessageAt = new Date();
  await conversation.save();

  await ChatbotMessage.create({
    conversationId: conversation._id,
    role: 'user',
    content: trimmedMessage
  });

  const searchResult = await findKnowledgeMatches({
    ChatbotKnowledge,
    userId: normalizedUserId,
    selectedDocIds,
    message: trimmedMessage
  });
  const { profile, semantics, matches } = searchResult;
  const responsePayload = gatherAssistantResponse({
    queryProfile: profile,
    matches,
    docMap
  });
  const answer = responsePayload.answer;
  const sources = responsePayload.sources;

  await ChatbotMessage.create({
    conversationId: conversation._id,
    role: 'assistant',
    content: answer,
    sources
  });

  conversation.lastMessageAt = new Date();
  if (!conversation.title) {
    conversation.title = createConversationTitle(trimmedMessage);
  }
  await conversation.save();

  const recentMessages = await ChatbotMessage.find({ conversationId: conversation._id })
    .sort({ createdAt: -1 })
    .limit(CHATBOT_MAX_HISTORY_MESSAGES)
    .select('_id')
    .lean();

  return {
    conversationId: String(conversation._id),
    answer,
    sources: sources.map((source) => ({
      documentId: String(source.documentId),
      documentName: source.documentName,
      entryId: String(source.entryId),
      key: source.key,
      topic: source.topic,
      matchedBy: source.matchedBy,
      score: source.score,
      intentType: source.intentType,
      entityType: source.entityType
    })),
    usedEntryCount: sources.length,
    usedContextCount: sources.length,
    historyCount: recentMessages.length,
    searchDebug: buildSearchDebug({
      queryProfile: profile,
      semantics,
      matches
    })
  };
};

