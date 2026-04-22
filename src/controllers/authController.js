import User from '../models/user.schema.js';
import Reward from '../models/reward.schema.js';
import UserActivity from '../models/userActivity.schema.js';
import RefreshToken from '../models/refreshToken.schema.js';
import OTPVerification from '../models/otpVerification.schema.js';
import PasswordResetOTP from '../models/passwordResetOtp.schema.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import BadRequestError from '../errors/badRequestError.js';
import NotFoundError from '../errors/notFoundError.js';
import UnauthorizedError from '../errors/unauthorizedError.js';
import ForbiddenError from '../errors/forbiddenError.js';
import { OAuth2Client } from 'google-auth-library';
import Character from '../models/character.schema.js';
import Topic from '../models/topic.schema.js';
import PreferenceQuestion from '../models/preferenceQuestion.schema.js';
import { generateOTP, sendOTPEmail, sendPasswordResetOTPEmail } from '../config/emailConfig.js';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;
const GUEST_EXPIRY_DAYS = parseInt(process.env.GUEST_EXPIRY_DAYS) || 7;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || '';
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';
const ZALO_APP_ID = process.env.ZALO_APP_ID || '';
const ZALO_APP_SECRET = process.env.ZALO_APP_SECRET || '';
const ZALO_REDIRECT_URI = process.env.ZALO_REDIRECT_URI || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_TOPIC_MODEL = process.env.GEMINI_TOPIC_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeTopicSlug = (value) => {
  return String(value || '').trim().toLowerCase();
};

const normalizeOptionTopicScores = (topicScores) => {
  if (!Array.isArray(topicScores)) return [];

  const normalizedScores = [];
  for (const scoreItem of topicScores) {
    const topicSlug = normalizeTopicSlug(scoreItem?.topicSlug);
    const score = Number(scoreItem?.score);
    if (!topicSlug || !Number.isFinite(score)) {
      continue;
    }

    normalizedScores.push({
      topicSlug,
      score
    });
  }

  return normalizedScores;
};

const buildQuestionOptionMap = (question) => {
  const optionMap = new Map();
  const options = Array.isArray(question?.options) ? question.options : [];

  for (const option of options) {
    const value = typeof option?.value === 'string' ? option.value.trim() : '';
    if (!value) continue;

    optionMap.set(value, {
      label: typeof option?.label === 'string' && option.label.trim()
        ? option.label.trim()
        : value,
      topicScores: normalizeOptionTopicScores(option?.topicScores)
    });
  }

  return optionMap;
};

const sanitizeQuestionForClient = (question) => {
  return {
    _id: question._id,
    code: question.code,
    questionText: question.questionText,
    questionType: question.questionType,
    order: question.order,
    options: Array.isArray(question.options)
      ? question.options.map((option) => ({
        value: option.value,
        label: option.label
      }))
      : []
  };
};

const extractGeminiText = (geminiPayload) => {
  const parts = geminiPayload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => part?.text || '').join('\n').trim();
};

const extractFirstJsonObject = (text) => {
  if (!text || typeof text !== 'string') return null;
  const startIndex = text.indexOf('{');
  const endIndex = text.lastIndexOf('}');
  if (startIndex < 0 || endIndex <= startIndex) return null;
  try {
    return JSON.parse(text.slice(startIndex, endIndex + 1));
  } catch (error) {
    return null;
  }
};

const inferTopicByRules = (answersPayload, topics) => {
  if (!Array.isArray(topics) || topics.length === 0) return null;

  const scoreBySlug = new Map(
    topics.map((topic) => [normalizeTopicSlug(topic.slug), 0])
  );

  for (const answerItem of answersPayload) {
    const values = Array.isArray(answerItem.answerValues) ? answerItem.answerValues : [];
    const labels = Array.isArray(answerItem.answerLabels) ? answerItem.answerLabels : [];
    const freeText = typeof answerItem.freeText === 'string' ? answerItem.freeText : '';
    const combinedText = `${values.join(' ')} ${labels.join(' ')} ${freeText}`.toLowerCase();
    const topicScores = Array.isArray(answerItem.topicScores) ? answerItem.topicScores : [];

    for (const scoreItem of topicScores) {
      const topicSlug = normalizeTopicSlug(scoreItem?.topicSlug);
      const score = Number(scoreItem?.score);
      if (topicSlug && Number.isFinite(score) && scoreBySlug.has(topicSlug)) {
        scoreBySlug.set(topicSlug, scoreBySlug.get(topicSlug) + score);
      }
    }

    for (const topic of topics) {
      const keywords = Array.isArray(topic.keywords) ? topic.keywords : [];
      const topicSlug = normalizeTopicSlug(topic.slug);
      if (!topicSlug || !scoreBySlug.has(topicSlug)) {
        continue;
      }

      for (const keyword of keywords) {
        if (combinedText.includes(String(keyword).toLowerCase())) {
          scoreBySlug.set(topicSlug, scoreBySlug.get(topicSlug) + 1);
        }
      }
    }
  }

  const rankedTopics = topics
    .map((topic) => ({
      topic,
      score: scoreBySlug.get(normalizeTopicSlug(topic.slug)) || 0
    }))
    .sort((left, right) => right.score - left.score);

  const best = rankedTopics[0];
  const second = rankedTopics[1] || null;

  return {
    topic: best?.topic || null,
    bestScore: best?.score || 0,
    secondScore: second?.score ?? -1,
    scoreGap: best ? best.score - (second?.score ?? -1) : 0,
    rankedTopics
  };
};

const buildRuleReason = (ruleResult) => {
  const best = ruleResult?.rankedTopics?.[0];
  const second = ruleResult?.rankedTopics?.[1];
  if (!best) return 'Rule-based scoring did not produce a result';
  if (!second) {
    return `Rule score ${best.topic.slug}:${best.score}`;
  }
  return `Rule score ${best.topic.slug}:${best.score}, ${second.topic.slug}:${second.score}`;
};

const shouldUseGeminiAssist = (ruleResult, answersPayload) => {
  if (!GEMINI_API_KEY) return false;
  if (!ruleResult?.topic) return false;

  const hasMeaningfulFreeText = answersPayload.some(
    (answerItem) =>
      typeof answerItem?.freeText === 'string' &&
      answerItem.freeText.trim().length >= 10
  );

  if (ruleResult.bestScore <= 0) return true;
  if (ruleResult.scoreGap <= 1) return true;
  if (ruleResult.scoreGap <= 2 && hasMeaningfulFreeText) return true;

  return false;
};

const inferTopicByGeminiAssist = async (answersPayload, ruleResult) => {
  if (!ruleResult?.topic || !GEMINI_API_KEY) return null;

  const candidates = ruleResult.rankedTopics.slice(0, 2).map((entry) => ({
    slug: entry.topic.slug,
    name: entry.topic.name,
    description: entry.topic.description,
    score: entry.score,
    keywords: entry.topic.keywords || []
  }));

  if (candidates.length === 0) return null;

  const promptPayload = {
    candidates,
    ruleSummary: buildRuleReason(ruleResult),
    answers: answersPayload
  };

  const prompt = [
    'You are an assistant for topic tie-breaking.',
    'The backend already scored topics using deterministic rules.',
    'Only pick one slug from candidates.',
    'Return JSON only in this shape:',
    '{"topicSlug":"...","reason":"...","confidence":0.0}',
    'topicSlug must be one candidate slug.',
    'Reason should be concise (max 30 words).',
    `Input: ${JSON.stringify(promptPayload)}`
  ].join('\n');

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_TOPIC_MODEL)}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const geminiPayload = await geminiResponse.json();
    if (!geminiResponse.ok) {
      throw new Error(geminiPayload?.error?.message || `Gemini HTTP ${geminiResponse.status}`);
    }

    const geminiText = extractGeminiText(geminiPayload);
    const parsedResponse = extractFirstJsonObject(geminiText);
    const topicSlug = normalizeTopicSlug(
      parsedResponse?.topicSlug ||
      parsedResponse?.slug ||
      parsedResponse?.topic ||
      ''
    );

    const matchedTopic = candidates.find((topic) => normalizeTopicSlug(topic.slug) === topicSlug);
    if (!matchedTopic) {
      throw new Error('Gemini response does not contain a valid topicSlug');
    }

    const confidenceRaw = Number(parsedResponse?.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : null;

    return {
      topic: matchedTopic,
      source: 'gemini',
      reason: parsedResponse?.reason || 'Tie-break selected by Gemini',
      confidence
    };
  } catch (error) {
    console.error('Gemini assist failed:', error?.message || error);
    return null;
  }
};

const inferPreferredTopic = async (answersPayload, topics) => {
  const ruleResult = inferTopicByRules(answersPayload, topics);
  if (!ruleResult?.topic) {
    throw new BadRequestError('Không tìm thấy topic để gợi ý');
  }

  const reasonFromRule = buildRuleReason(ruleResult);

  if (!shouldUseGeminiAssist(ruleResult, answersPayload)) {
    return {
      topic: ruleResult.topic,
      source: 'rule_based',
      reason: reasonFromRule,
      confidence: ruleResult.bestScore > 0 ? 0.85 : 0.55
    };
  }

  const geminiResult = await inferTopicByGeminiAssist(answersPayload, ruleResult);
  if (!geminiResult) {
    return {
      topic: ruleResult.topic,
      source: 'rule_based',
      reason: `${reasonFromRule}. Gemini assist unavailable`,
      confidence: ruleResult.bestScore > 0 ? 0.8 : 0.5
    };
  }

  const geminiSlug = normalizeTopicSlug(geminiResult.topic.slug);
  const matchedTopic = topics.find((topic) => normalizeTopicSlug(topic.slug) === geminiSlug);
  if (!matchedTopic) {
    return {
      topic: ruleResult.topic,
      source: 'rule_based',
      reason: `${reasonFromRule}. Gemini slug invalid, ignore`,
      confidence: ruleResult.bestScore > 0 ? 0.8 : 0.5
    };
  }

  if (normalizeTopicSlug(matchedTopic.slug) === normalizeTopicSlug(ruleResult.topic.slug)) {
    return {
      topic: ruleResult.topic,
      source: 'rule_based+gemini',
      reason: `${reasonFromRule}. Gemini confirmed`,
      confidence: geminiResult.confidence ?? 0.88
    };
  }

  return {
    topic: matchedTopic,
    source: 'rule_based+gemini',
    reason: `${reasonFromRule}. Gemini tie-break changed choice`,
    confidence: geminiResult.confidence ?? 0.66
  };
};

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Tạo Access Token
const normalizeEmail = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || !EMAIL_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
};

const buildEmailInsensitiveQuery = (email) => {
  if (!email) return null;
  const escapedEmail = escapeRegex(email);
  return { email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') } };
};

const createAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email },
    SECRET_KEY,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

// Tạo Refresh Token và lưu vào database
const createRefreshToken = async (user, deviceInfo = null) => {
  const token = jwt.sign(
    { id: user._id, username: user.username },
    SECRET_KEY,
    { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
  );

  // Tính thời gian hết hạn
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  // Lưu vào database
  const refreshTokenDoc = new RefreshToken({
    userId: user._id,
    token,
    expiresAt,
    deviceInfo
  });

  await refreshTokenDoc.save();

  return token;
};

// Đăng nhập
export const loginController = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const deviceInfo = req.headers['user-agent'] || null;

    // Tìm user
    const user = await User.findOne({ username }).populate('classId');
    if (!user) {
      throw new UnauthorizedError('Không tìm thấy tên đăng nhập!');
    }

    // Kiểm tra password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Mật khẩu không đúng! Vui lòng thử lại.');
    }

    // Tạo tokens
    const accessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user, deviceInfo);

    return res.status(200).json({
      message: 'Đăng nhập thành công',
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
};

// Refresh Access Token
export const refreshTokenController = async (req, res, next) => {
  try {
    const refreshToken = req.body.refreshToken;
    const deviceInfo = req.headers['user-agent'] || null;

    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token không hợp lệ');
    }

    // Kiểm tra refresh token có trong database không
    const storedToken = await RefreshToken.findOne({ token: refreshToken });

    if (!storedToken) {
      throw new UnauthorizedError('Refresh token không hợp lệ');
    }

    // Kiểm tra token đã bị revoke chưa
    if (storedToken.isRevoked) {
      throw new UnauthorizedError('Refresh token đã bị thu hồi');
    }

    // Kiểm tra token đã hết hạn chưa (theo database)
    if (storedToken.expiresAt < new Date()) {
      // Xóa token hết hạn
      await RefreshToken.deleteOne({ _id: storedToken._id });
      throw new UnauthorizedError('Refresh token đã hết hạn');
    }

    // Verify refresh token với JWT
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, SECRET_KEY);
    } catch (jwtError) {
      // Revoke token nếu JWT verification fail
      await RefreshToken.updateOne({ _id: storedToken._id }, { isRevoked: true });
      if (jwtError.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Refresh token đã hết hạn');
      }
      throw new UnauthorizedError('Refresh token không hợp lệ');
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      throw new NotFoundError('User không tìm thấy');
    }

    // Revoke token cũ trong database
    await RefreshToken.updateOne({ _id: storedToken._id }, { isRevoked: true });

    // Tạo cả access token và refresh token mới
    const newAccessToken = createAccessToken(user);
    const newRefreshToken = await createRefreshToken(user, deviceInfo);

    return res.status(200).json({
      message: 'Refresh token thành công',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    next(error);
  }
};

// Lấy thông tin user
export const getUserController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .select('_id fullName email classId characterId preferredTopicId isGuest roles isShowCaseView');

    if (!user) throw new NotFoundError('User không tìm thấy');

    return res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      classId: user.classId || null,
      characterId: user.characterId || null,
      preferredTopicId: user.preferredTopicId || null,
      isGuest: user.isGuest ?? false,
      roles: user.roles || [],
      isShowCaseView: user.isShowCaseView ?? false
    });
  } catch (error) {
    next(error);
  }
};

export const getByPreferredTopicIdController = async (req, res, next) => {
  try {
    const { preferredTopicId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(preferredTopicId)) {
      throw new BadRequestError('preferredTopicId không hợp lệ');
    }

    const topic = await Topic.findById(preferredTopicId).select('slug');
    if (!topic) {
      throw new NotFoundError('Topic không tìm thấy');
    }

    return res.status(200).json({
      slugTopic: topic.slug
    });
  } catch (error) {
    next(error);
  }
};

// Đổi mật khẩu
export const changePasswordController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    // Kiểm tra các field bắt buộc
    if (!oldPassword || !newPassword || !confirmPassword) {
      throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
    }

    // Kiểm tra mật khẩu mới và xác nhận khớp nhau
    if (newPassword !== confirmPassword) {
      throw new BadRequestError('Mật khẩu mới không khớp');
    }

    // Kiểm tra mật khẩu mới có khác mật khẩu cũ
    if (oldPassword === newPassword) {
      throw new BadRequestError('Mật khẩu mới phải khác mật khẩu cũ');
    }

    // Tìm user
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User không tìm thấy');
    }

    // Kiểm tra mật khẩu cũ
    const isValidPassword = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Mật khẩu cũ không đúng');
    }

    // Hash mật khẩu mới
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Cập nhật user
    await User.findByIdAndUpdate(
      userId,
      { passwordHash: newPasswordHash },
      { new: true }
    );

    return res.status(200).json({
      message: 'Đổi mật khẩu thành công'
    });
  } catch (error) {
    next(error);
  }
};

// Gửi OTP quên mật khẩu
export const forgotPasswordController = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      throw new BadRequestError('Vui lòng cung cấp email');
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new BadRequestError('Email không hợp lệ');
    }

    const safeResponse = {
      message: 'Nếu email tồn tại, mã OTP đặt lại mật khẩu đã được gửi.',
      email: normalizedEmail
    };

    const escapedEmail = escapeRegex(normalizedEmail);
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') }
    });

    if (!user || user.isGuest) {
      throw new NotFoundError('Không tìm thấy tài khoản');
    }

    const otp = generateOTP();

    await PasswordResetOTP.deleteMany({ email: normalizedEmail });
    await PasswordResetOTP.create({ email: normalizedEmail, otp });

    sendPasswordResetOTPEmail(normalizedEmail, otp, user.fullName || 'ban').catch((error) => {
      console.error(`Failed to send password reset OTP to ${normalizedEmail}:`, error);
    });

    return res.status(200).json(safeResponse);
  } catch (error) {
    next(error);
  }
};

// Đặt lại mật khẩu bằng OTP
export const resetPasswordController = async (req, res, next) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmPassword) {
      throw new BadRequestError('Vui lòng cung cấp đầy đủ: email, otp, newPassword, confirmPassword');
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new BadRequestError('Email không hợp lệ');
    }

    if (newPassword.length < 8) {
      throw new BadRequestError('Mật khẩu mới phải có ít nhất 8 ký tự');
    }

    if (newPassword !== confirmPassword) {
      throw new BadRequestError('Mật khẩu mới không khớp');
    }

    const otpRecord = await PasswordResetOTP.findOne({
      email: normalizedEmail,
      otp: String(otp).trim()
    });

    if (!otpRecord) {
      throw new BadRequestError('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    const escapedEmail = escapeRegex(normalizedEmail);
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') }
    });

    if (!user || user.isGuest) {
      await PasswordResetOTP.deleteOne({ _id: otpRecord._id });
      throw new NotFoundError('User không tìm thấy');
    }

    if (user.passwordHash) {
      const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
      if (isSamePassword) {
        throw new BadRequestError('Mật khẩu mới phải khác mật khẩu cũ');
      }
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await User.findByIdAndUpdate(user._id, { passwordHash: newPasswordHash });
    await PasswordResetOTP.deleteMany({ email: normalizedEmail });
    await RefreshToken.updateMany({ userId: user._id }, { isRevoked: true });

    return res.status(200).json({
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.'
    });
  } catch (error) {
    next(error);
  }
};

// Logout
export const logoutController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const refreshToken = req.body.refreshToken;

    // Revoke refresh token trong database
    if (refreshToken) {
      await RefreshToken.updateOne(
        { token: refreshToken },
        { isRevoked: true }
      );
    }

    // Nếu có userId, xóa tất cả refresh tokens của user (optional - logout khỏi tất cả thiết bị)
    await RefreshToken.updateMany({ userId }, { isRevoked: true });

    // // Nếu là guest, xóa tất cả dữ liệu liên quan
    // if (userId) {
    //   const user = await User.findById(userId);
    //   if (user && user.isGuest) {
    //     // Xóa tất cả refresh tokens của guest
    //     await RefreshToken.deleteMany({ userId });
    //     await deleteGuestData(userId);
    //   }
    // }

    return res.status(200).json({ message: 'Đăng xuất thành công' });
  } catch (error) {
    next(error);
  }
};

// Đăng nhập khách (Guest Login)
export const guestLoginController = async (req, res, next) => {
  try {
    const { fullName = 'Người dùng' } = req.body;

    // Tạo thời gian hết hạn (7 ngày từ bây giờ)
    const guestExpiresAt = new Date();
    guestExpiresAt.setDate(guestExpiresAt.getDate() + parseInt(GUEST_EXPIRY_DAYS));

    // Tạo unique ID cho guest để tránh trùng lặp
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Tạo guest user với username và email unique
    const guestUser = new User({
      fullName,
      isGuest: true,
      guestExpiresAt,
      username: guestId,
      passwordHash: null,
      email: `${guestId}@guest.temp`
    });

    await guestUser.save();

    // Tạo reward record cho guest
    const reward = new Reward({ userId: guestUser._id });
    await reward.save();

    const deviceInfo = req.headers['user-agent'] || null;

    // Tạo tokens
    const accessToken = createAccessToken(guestUser);
    const refreshToken = await createRefreshToken(guestUser, deviceInfo);

    return res.status(201).json({
      message: 'Đăng nhập khách thành công',
      accessToken,
      refreshToken,
      user: {
        id: guestUser._id,
        fullName: guestUser.fullName,
        isGuest: true,
        expiresAt: guestExpiresAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// Verify Google ID token (Android / Flutter client) hoặc accessToken (Web)
export const googleTokenController = async (req, res, next) => {
  try {
    const { token } = req.body;
    const deviceInfo = req.headers['user-agent'] || null;

    if (!token) {
      throw new BadRequestError('Missing token');
    }

    let payload;

    // Detect token type: idToken (JWT format) vs accessToken (ya29. prefix)
    const isAccessToken = token.startsWith('ya29.') || !token.includes('.');

    if (!isAccessToken) {
      // Verify idToken using google-auth-library (Android/iOS)
      let ticket;
      try {
        ticket = await googleClient.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
      } catch (err) {
        throw new UnauthorizedError('Invalid Google idToken');
      }
      payload = ticket.getPayload();
    } else {
      // Sử dụng accessToken để lấy thông tin user từ Google API (Web)
      try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user info');
        }

        const userInfo = await response.json();
        // Map userinfo response to payload format tương tự idToken
        payload = {
          sub: userInfo.sub,
          email: userInfo.email,
          email_verified: userInfo.email_verified,
          name: userInfo.name,
          given_name: userInfo.given_name,
          picture: userInfo.picture
        };
      } catch (err) {
        console.error('Error fetching Google user info:', err);
        throw new UnauthorizedError('Invalid Google accessToken');
      }
    }

    const googleId = payload.sub;
    const email = normalizeEmail(payload.email);
    const email_verified = payload.email_verified || false;
    const emailLocalPart = email
      ? email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, ' ')
      : null;

    // Allow client to send `fullName` when token payload omits name
    const clientFullName = req.body.fullName || null;
    const fullName = payload.name || payload.given_name || clientFullName || emailLocalPart || 'Google User';
    const picture = payload.picture || null;

    // Try to find user by googleId
    let user = null;
    if (googleId) {
      user = await User.findOne({ googleId });
    }

    // If not found by googleId, try find by email
    if (!user && email) {
      const emailQuery = buildEmailInsensitiveQuery(email);
      user = emailQuery ? await User.findOne(emailQuery) : null;
      if (user && !user.googleId && email_verified) {
        user.googleId = googleId;
        user.provider = 'google';
        user.avatar = picture;
        user.emailVerified = true;
        await user.save();
      }
    }

    // If we found an existing user, update profile fields from Google payload when present
    if (user) {
      let updated = false;
      if (fullName && user.fullName !== fullName) {
        user.fullName = fullName;
        updated = true;
      }
      if (picture && user.avatar !== picture) {
        user.avatar = picture;
        updated = true;
      }
      if (email_verified && !user.emailVerified) {
        user.emailVerified = true;
        updated = true;
      }
      if (googleId && !user.googleId) {
        user.googleId = googleId;
        user.provider = 'google';
        updated = true;
      }
      if (email && !user.email) {
        user.email = email;
        updated = true;
      }
      if (updated) {
        await user.save();
      }
    }

    // If still not found, create new user
    if (!user) {
      // Generate a safe unique username (avoid collisions by including timestamp)
      const generatedUsername = email
        ? (email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '') || 'googleuser') + `_${Date.now()}`
        : `google_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Create a random password hash so required passwordHash field is satisfied
      const randomPassword = Math.random().toString(36) + Date.now().toString(36);
      const passwordHashForOauth = await bcrypt.hash(randomPassword, 10);

      const newUser = new User({
        username: generatedUsername,
        ...(email ? { email } : {}),
        passwordHash: passwordHashForOauth,
        fullName: fullName || 'Google User',
        classId: null,
        googleId,
        provider: 'google',
        avatar: picture,
        emailVerified: email_verified,
        roles: ['student']
      });

      await newUser.save();

      const reward = new Reward({ userId: newUser._id });
      await reward.save();

      user = newUser;
    }

    // Issue tokens
    const newAccessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user, deviceInfo);

    return res.status(200).json({
      message: 'Google sign-in successful',
      accessToken: newAccessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        provider: user.provider,
        roles: user.roles
      }
    });
  } catch (error) {
    next(error);
  }
};

// Verify Facebook access token (Web / Android client)
export const facebookTokenController = async (req, res, next) => {
  try {
    const { token } = req.body;
    const deviceInfo = req.headers['user-agent'] || null;

    if (!token || typeof token !== 'string') {
      throw new BadRequestError('Missing token');
    }

    // Strong verification: validate token against Facebook debug_token when app secret is configured.
    if (FACEBOOK_APP_ID && FACEBOOK_APP_SECRET) {
      try {
        const debugUrl = new URL('https://graph.facebook.com/debug_token');
        debugUrl.searchParams.set('input_token', token);
        debugUrl.searchParams.set('access_token', `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`);

        const debugResponse = await fetch(debugUrl.toString());
        if (!debugResponse.ok) {
          throw new Error('Failed to debug Facebook token');
        }

        const debugPayload = await debugResponse.json();
        const tokenData = debugPayload?.data;

        if (!tokenData?.is_valid) {
          throw new UnauthorizedError('Invalid Facebook accessToken');
        }

        if (tokenData.app_id && tokenData.app_id !== FACEBOOK_APP_ID) {
          throw new UnauthorizedError('Facebook token does not belong to this app');
        }

        if (tokenData.expires_at && Date.now() >= tokenData.expires_at * 1000) {
          throw new UnauthorizedError('Facebook accessToken expired');
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          throw err;
        }
        console.error('Error debugging Facebook token:', err);
        throw new UnauthorizedError('Invalid Facebook accessToken');
      }
    }

    let payload;
    try {
      const meUrl = new URL('https://graph.facebook.com/me');
      meUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');
      meUrl.searchParams.set('access_token', token);

      const response = await fetch(meUrl.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch Facebook user info');
      }
      payload = await response.json();
    } catch (err) {
      console.error('Error fetching Facebook user info:', err);
      throw new UnauthorizedError('Invalid Facebook accessToken');
    }

    const facebookId = payload?.id;
    if (!facebookId) {
      throw new UnauthorizedError('Invalid Facebook accessToken');
    }

    const email = normalizeEmail(payload?.email);
    const picture = payload?.picture?.data?.url || null;
    const clientFullName = req.body.fullName || null;
    const emailLocalPart = email
      ? email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, ' ')
      : null;
    const fullName = payload?.name || clientFullName || emailLocalPart || 'Facebook User';

    // Try to find by facebookId first
    let user = await User.findOne({ facebookId });

    // Fallback by email
    if (!user && email) {
      const emailQuery = buildEmailInsensitiveQuery(email);
      user = emailQuery ? await User.findOne(emailQuery) : null;
      if (user) {
        if (user.facebookId && user.facebookId !== facebookId) {
          throw new UnauthorizedError('Facebook account mismatch for this email');
        }

        if (!user.facebookId) {
          user.facebookId = facebookId;
          user.provider = 'facebook';
          if (picture) {
            user.avatar = picture;
          }
          if (!user.emailVerified) {
            user.emailVerified = true;
          }
          await user.save();
        }
      }
    }

    // If found, update profile fields when needed
    if (user) {
      let updated = false;
      if (fullName && user.fullName !== fullName) {
        user.fullName = fullName;
        updated = true;
      }
      if (picture && user.avatar !== picture) {
        user.avatar = picture;
        updated = true;
      }
      if (!user.facebookId) {
        user.facebookId = facebookId;
        updated = true;
      }
      if (user.provider !== 'facebook') {
        user.provider = 'facebook';
        updated = true;
      }
      if (email && !user.email) {
        user.email = email;
        updated = true;
      }
      if (!user.emailVerified) {
        user.emailVerified = true;
        updated = true;
      }
      if (updated) {
        await user.save();
      }
    }

    // Create user if not found
    if (!user) {
      const generatedUsername = email
        ? (email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '') || 'facebookuser') + `_${Date.now()}`
        : `facebook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const randomPassword = Math.random().toString(36) + Date.now().toString(36);
      const passwordHashForOauth = await bcrypt.hash(randomPassword, 10);

      const newUser = new User({
        username: generatedUsername,
        ...(email ? { email } : {}),
        passwordHash: passwordHashForOauth,
        fullName: fullName || 'Facebook User',
        classId: null,
        facebookId,
        provider: 'facebook',
        avatar: picture,
        emailVerified: !!email,
        roles: ['student']
      });

      await newUser.save();

      const reward = new Reward({ userId: newUser._id });
      await reward.save();

      user = newUser;
    }

    const newAccessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user, deviceInfo);

    return res.status(200).json({
      message: 'Facebook sign-in successful',
      accessToken: newAccessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        provider: user.provider,
        roles: user.roles
      }
    });
  } catch (error) {
    next(error);
  }
};


const fetchZaloProfile = async (token) => {
  try {
    const meUrl = new URL('https://graph.zalo.me/v2.0/me');
    meUrl.searchParams.set('fields', 'id,name,picture');
    meUrl.searchParams.set('access_token', token);

    const response = await fetch(meUrl.toString(), {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Zalo user info');
    }

    const payload = await response.json();
    if (payload?.error) {
      throw new UnauthorizedError(payload?.message || 'Invalid Zalo accessToken');
    }

    if (ZALO_APP_ID && payload?.app_id && String(payload.app_id) !== String(ZALO_APP_ID)) {
      throw new UnauthorizedError('Zalo token does not belong to this app');
    }

    return payload;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    console.error('Error fetching Zalo user info:', err);
    throw new UnauthorizedError('Invalid Zalo accessToken');
  }
};

const signInWithZaloAccessToken = async ({ token, fullName: fallbackFullName, deviceInfo = null }) => {
  const payload = await fetchZaloProfile(token);

  const zaloId = payload?.id ? String(payload.id) : null;
  if (!zaloId) {
    throw new UnauthorizedError('Invalid Zalo accessToken');
  }

  const picture =
    payload?.picture?.data?.url ||
    payload?.picture?.url ||
    payload?.picture ||
    payload?.avatar ||
    null;
  const email = normalizeEmail(payload?.email);

  const fullName = payload?.name || fallbackFullName || 'Zalo User';

  let user = await User.findOne({ zaloId });
  if (!user && email) {
    const emailQuery = buildEmailInsensitiveQuery(email);
    user = emailQuery ? await User.findOne(emailQuery) : null;
    if (user) {
      if (user.zaloId && user.zaloId !== zaloId) {
        throw new UnauthorizedError('Zalo account mismatch for this email');
      }
      if (!user.zaloId) {
        user.zaloId = zaloId;
      }
      if (user.provider !== 'zalo') {
        user.provider = 'zalo';
      }
      if (!user.email) {
        user.email = email;
      }
      await user.save();
    }
  }
  if (user) {
    let updated = false;
    if (fullName && user.fullName !== fullName) {
      user.fullName = fullName;
      updated = true;
    }
    if (picture && user.avatar !== picture) {
      user.avatar = picture;
      updated = true;
    }
    if (user.provider !== 'zalo') {
      user.provider = 'zalo';
      updated = true;
    }
    if (email && !user.email) {
      user.email = email;
      updated = true;
    }
    if (updated) {
      await user.save();
    }
  }

  if (!user) {
    const generatedUsername = `zalo_${zaloId}_${Date.now()}`;
    const randomPassword = Math.random().toString(36) + Date.now().toString(36);
    const passwordHashForOauth = await bcrypt.hash(randomPassword, 10);

    const newUser = new User({
      username: generatedUsername,
      ...(email ? { email } : {}),
      passwordHash: passwordHashForOauth,
      fullName: fullName || 'Zalo User',
      classId: null,
      zaloId,
      provider: 'zalo',
      avatar: picture,
      roles: ['student']
    });

    await newUser.save();
    const reward = new Reward({ userId: newUser._id });
    await reward.save();
    user = newUser;
  }

  const accessToken = createAccessToken(user);
  const refreshToken = await createRefreshToken(user, deviceInfo);

  return {
    message: 'Zalo sign-in successful',
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      avatar: user.avatar,
      provider: user.provider,
      roles: user.roles
    }
  };
};

// Verify Zalo access token (Web / Android / Flutter client)
export const zaloTokenController = async (req, res, next) => {
  try {
    const { token } = req.body;
    const deviceInfo = req.headers['user-agent'] || null;

    if (!token || typeof token !== 'string') {
      throw new BadRequestError('Missing token');
    }

    const result = await signInWithZaloAccessToken({
      token,
      fullName: req.body.fullName || null,
      deviceInfo
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Exchange Zalo OAuth code to access token, then sign in user
export const zaloCodeController = async (req, res, next) => {
  try {
    const { code, redirectUri, fullName } = req.body;
    const deviceInfo = req.headers['user-agent'] || null;

    if (!code || typeof code !== 'string') {
      throw new BadRequestError('Missing code');
    }
    if (!ZALO_APP_ID || !ZALO_APP_SECRET) {
      throw new BadRequestError('Missing ZALO_APP_ID or ZALO_APP_SECRET in server config');
    }

    const body = new URLSearchParams();
    body.set('app_id', ZALO_APP_ID);
    body.set('code', code);
    body.set('grant_type', 'authorization_code');

    const resolvedRedirectUri =
      (typeof redirectUri === 'string' ? redirectUri.trim() : '') || ZALO_REDIRECT_URI;
    if (resolvedRedirectUri) {
      body.set('redirect_uri', resolvedRedirectUri);
    }

    let tokenPayload;
    try {
      const response = await fetch('https://oauth.zaloapp.com/v4/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: ZALO_APP_SECRET
        },
        body: body.toString()
      });

      tokenPayload = await response.json();
    } catch (err) {
      console.error('Error exchanging Zalo code:', err);
      throw new UnauthorizedError('Invalid Zalo OAuth code');
    }

    if (!tokenPayload?.access_token) {
      throw new UnauthorizedError(tokenPayload?.error_description || tokenPayload?.message || 'Invalid Zalo OAuth code');
    }

    const result = await signInWithZaloAccessToken({
      token: tokenPayload.access_token,
      fullName: fullName || null,
      deviceInfo
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
// Xóa tất cả dữ liệu liên quan đến guest
const deleteGuestData = async (userId) => {
  try {
    // Xóa UserActivity - lịch sử hoạt động của user
    const deletedActivities = await UserActivity.deleteMany({ userId });

    // Xóa Reward - điểm thưởng của user
    const deletedRewards = await Reward.deleteMany({ userId });

    // Xóa User
    await User.findByIdAndDelete(userId);

    console.log(`Deleted guest user ${userId}:`, {
      userActivities: deletedActivities.deletedCount,
      rewards: deletedRewards.deletedCount
    });

    return {
      success: true,
      deleted: {
        userActivities: deletedActivities.deletedCount,
        rewards: deletedRewards.deletedCount
      }
    };
  } catch (error) {
    console.error('Error deleting guest data:', error);
    return { success: false, error: error.message };
  }
};

// API để xóa guest thủ công (khi user xóa app hoặc muốn xóa tài khoản khách)
export const deleteGuestController = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User không tìm thấy');
    }

    if (!user.isGuest) {
      throw new BadRequestError('Chỉ có thể xóa tài khoản khách');
    }

    await deleteGuestData(userId);

    return res.status(200).json({ message: 'Xóa tài khoản khách thành công' });
  } catch (error) {
    next(error);
  }
};

// Bước 1: Gửi OTP để chuyển guest sang user thường
export const sendOTPForConvertController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { username, email, password, fullName } = req.body;

    if (!username || !email || !password || !fullName) {
      throw new BadRequestError('Vui lòng điền đầy đủ: username, email, password, fullName');
    }

    if (password.length < 8) {
      throw new BadRequestError('Mật khẩu phải có ít nhất 8 ký tự');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestError('Email không hợp lệ');
    }

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User không tìm thấy');
    if (!user.isGuest) throw new BadRequestError('Tài khoản này đã là user thường');

    // Kiểm tra username/email đã tồn tại ở user khác
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
      _id: { $ne: userId }
    });
    if (existingUser) {
      throw new BadRequestError('Username hoặc email đã tồn tại');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = generateOTP();

    // Xóa OTP cũ của email này (nếu có)
    await OTPVerification.deleteMany({ email });

    const otpVerification = new OTPVerification({
      email,
      otp,
      username,
      passwordHash,
      fullName,
      guestUserId: userId
    });
    await otpVerification.save();

    sendOTPEmail(email, otp, fullName).catch((error) => {
      console.error(`Failed to send OTP email to ${email}:`, error);
    });

    return res.status(200).json({
      message: 'OTP đã được gửi đến email của bạn. Vui lòng kiểm tra và nhập mã OTP.',
      email
    });
  } catch (error) {
    next(error);
  }
};

// Bước 2: Xác thực OTP và hoàn tất chuyển đổi guest sang user thường
export const verifyOTPAndConvertController = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      throw new BadRequestError('Vui lòng cung cấp email và mã OTP');
    }

    const otpRecord = await OTPVerification.findOne({ email, otp });
    if (!otpRecord) {
      throw new BadRequestError('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    if (!otpRecord.guestUserId) {
      await OTPVerification.deleteOne({ _id: otpRecord._id });
      throw new BadRequestError('OTP này không dùng để chuyển đổi tài khoản');
    }

    const user = await User.findById(otpRecord.guestUserId);
    if (!user) {
      await OTPVerification.deleteOne({ _id: otpRecord._id });
      throw new NotFoundError('User không tìm thấy');
    }

    if (!user.isGuest) {
      await OTPVerification.deleteOne({ _id: otpRecord._id });
      throw new BadRequestError('Tài khoản này đã là user thường');
    }

    // Kiểm tra lại username/email chưa bị chiếm
    const existingUser = await User.findOne({
      $or: [{ username: otpRecord.username }, { email: otpRecord.email }],
      _id: { $ne: user._id }
    });
    if (existingUser) {
      await OTPVerification.deleteOne({ _id: otpRecord._id });
      throw new BadRequestError('Username hoặc email đã tồn tại');
    }

    // Cập nhật guest thành user thường, giữ nguyên toàn bộ dữ liệu học tập
    await User.findByIdAndUpdate(user._id, {
      username: otpRecord.username,
      email: otpRecord.email,
      passwordHash: otpRecord.passwordHash,
      fullName: otpRecord.fullName,
      isGuest: false,
      guestExpiresAt: null,
      emailVerified: true
    });

    await OTPVerification.deleteOne({ _id: otpRecord._id });

    return res.status(200).json({
      message: 'Chuyển đổi tài khoản thành công! Dữ liệu học tập được giữ nguyên.'
    });
  } catch (error) {
    next(error);
  }
};

// Lấy bộ câu hỏi sở thích để client hiển thị onboarding
export const getPreferenceQuestionsController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [questions, user] = await Promise.all([
      PreferenceQuestion.find({ isActive: true })
        .sort({ order: 1 })
        .select('_id code questionText questionType options order')
        .lean(),
      User.findById(userId)
        .select('_id')
        .lean()
    ]);

    if (!user) {
      throw new NotFoundError('User không tìm thấy');
    }

    const safeQuestions = questions.map(sanitizeQuestionForClient);

    return res.status(200).json({
      questions: safeQuestions
    });
  } catch (error) {
    next(error);
  }
};

export const submitPreferenceAnswersController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { answers } = req.body || {};

    if (!Array.isArray(answers) || answers.length === 0) {
      throw new BadRequestError('answers phải là mảng và không được rỗng');
    }

    const answerByCode = new Map();
    for (const answerItem of answers) {
      const questionCode =
        typeof answerItem?.questionCode === 'string'
          ? answerItem.questionCode.trim()
          : '';
      if (!questionCode) continue;
      answerByCode.set(questionCode, answerItem.answer);
    }

    if (answerByCode.size === 0) {
      throw new BadRequestError('Không có questionCode hợp lệ trong answers');
    }

    const questionCodes = Array.from(answerByCode.keys());

    const questions = await PreferenceQuestion.find({
      code: { $in: questionCodes },
      isActive: true
    }).lean();

    const questionByCode = new Map(questions.map((question) => [question.code, question]));
    const normalizedAnswers = [];

    for (const questionCode of questionCodes) {
      const question = questionByCode.get(questionCode);
      if (!question) {
        throw new BadRequestError(`questionCode không hợp lệ: ${questionCode}`);
      }

      const rawAnswer = answerByCode.get(questionCode);
      const optionMap = buildQuestionOptionMap(question);
      const allowedValues = new Set(optionMap.keys());

      if (question.questionType === 'single') {
        const value = typeof rawAnswer === 'string' ? rawAnswer.trim() : '';
        if (!value) {
          throw new BadRequestError(`Câu hỏi ${questionCode} cần một giá trị string`);
        }
        if (allowedValues.size > 0 && !allowedValues.has(value)) {
          throw new BadRequestError(`Giá trị không hợp lệ cho câu hỏi ${questionCode}`);
        }

        const optionMeta = optionMap.get(value) || null;
        normalizedAnswers.push({
          questionCode,
          questionText: question.questionText,
          answerValues: [value],
          answerLabels: [optionMeta?.label || value],
          freeText: '',
          topicScores: optionMeta?.topicScores || []
        });
        continue;
      }

      if (question.questionType === 'multiple') {
        if (!Array.isArray(rawAnswer) || rawAnswer.length === 0) {
          throw new BadRequestError(`Câu hỏi ${questionCode} cần một mảng giá trị`);
        }

        const uniqueValues = Array.from(
          new Set(
            rawAnswer
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter(Boolean)
          )
        );

        if (uniqueValues.length === 0) {
          throw new BadRequestError(`Câu hỏi ${questionCode} cần ít nhất 1 giá trị`);
        }

        if (allowedValues.size > 0) {
          const invalidValue = uniqueValues.find((value) => !allowedValues.has(value));
          if (invalidValue) {
            throw new BadRequestError(`Giá trị "${invalidValue}" không hợp lệ cho ${questionCode}`);
          }
        }

        const mergedTopicScores = [];
        for (const value of uniqueValues) {
          const optionMeta = optionMap.get(value);
          if (optionMeta?.topicScores?.length) {
            mergedTopicScores.push(...optionMeta.topicScores);
          }
        }

        normalizedAnswers.push({
          questionCode,
          questionText: question.questionText,
          answerValues: uniqueValues,
          answerLabels: uniqueValues.map((value) => optionMap.get(value)?.label || value),
          freeText: '',
          topicScores: mergedTopicScores
        });
        continue;
      }

      const textAnswer = typeof rawAnswer === 'string' ? rawAnswer.trim() : '';
      if (!textAnswer) {
        continue;
      }

      normalizedAnswers.push({
        questionCode,
        questionText: question.questionText,
        answerValues: [],
        answerLabels: [],
        freeText: textAnswer,
        topicScores: []
      });
    }

    if (normalizedAnswers.length === 0) {
      throw new BadRequestError('Không có câu trả lời hợp lệ để suy ra topic');
    }

    const topics = await Topic.find({ isActive: true }).lean();
    if (topics.length === 0) {
      throw new BadRequestError('Danh sách topic đang rỗng');
    }

    const inferredResult = await inferPreferredTopic(normalizedAnswers, topics);

    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User không tìm thấy');
    }

    user.preferredTopicId = inferredResult.topic._id;
    await user.save();

    return res.status(200).json({
      message: 'Cập nhật topic yêu thích thành công',
      slugTopic: inferredResult.topic.slug,
      source: inferredResult.source,
      confidence: inferredResult.confidence,
      reason: inferredResult.reason
    });
  } catch (error) {
    next(error);
  }
};

// Bật isShowCaseView (tạo nếu chưa có, cập nhật nếu đã có)
export const setShowCaseViewController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    await User.findByIdAndUpdate(userId, { $set: { isShowCaseView: true } }, { upsert: false });
    return res.status(200).json({ message: 'Cập nhật isShowCaseView thành công', isShowCaseView: true });
  } catch (error) {
    next(error);
  }
};

// Đổi tên đầy đủ (fullName) của user
export const changeFullNameController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { fullName } = req.body;

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
      throw new BadRequestError('fullName không được để trống');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User không tìm thấy');
    }

    user.fullName = fullName.trim();
    await user.save();

    return res.status(200).json({ message: 'Cập nhật tên thành công', fullName: user.fullName });
  } catch (error) {
    next(error);
  }
};

// Change full name and attach a character in one request
export const changeFullNameAndAttachCharacterController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { fullName, characterId, gender } = req.body || {};

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
      throw new BadRequestError('fullName không được để trống');
    }

    if (!characterId) {
      throw new BadRequestError('characterId là bắt buộc');
    }

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User không tìm thấy');

    const character = await Character.findById(characterId);
    if (!character) throw new NotFoundError('Character không tìm thấy');

    // Apply updates: store reference to character id
    user.fullName = fullName.trim();
    user.characterId = character._id;
    if (gender !== undefined && gender !== null) {
      const normalizedGender = Number(gender);
      if (!Number.isInteger(normalizedGender) || ![0, 1].includes(normalizedGender)) {
        throw new BadRequestError('gender phải là 0 hoặc 1');
      }
      user.gender = normalizedGender;
    }
    await user.save();

    return res.status(200).json({
      message: 'Cập nhật tên và gán character thành công',
      fullName: user.fullName,
      characterId: user.characterId,
      gender: user.gender
    });
  } catch (error) {
    next(error);
  }
};

// Gửi OTP để đăng ký
export const sendOTPForRegisterController = async (req, res, next) => {
  try {
    const { username, email, password, fullName } = req.body;

    // Validation
    if (!username || !email || !password || !fullName) {
      throw new BadRequestError('Vui lòng điền đầy đủ thông tin: username, email, password, fullName');
    }

    // Validate password length
    if (password.length < 8) {
      throw new BadRequestError('Mật khẩu phải có ít nhất 8 ký tự');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestError('Email không hợp lệ');
    }

    // Kiểm tra user đã tồn tại
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      throw new BadRequestError('Username hoặc email đã tồn tại');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Tạo OTP
    const otp = generateOTP();

    // Xóa OTP cũ của email này (nếu có)
    await OTPVerification.deleteMany({ email });

    // Lưu thông tin tạm thời cùng OTP
    const otpVerification = new OTPVerification({
      email,
      otp,
      username,
      passwordHash,
      fullName
    });

    await otpVerification.save();

    // Gửi OTP qua email (asynchronous - không chờ gửi xong)
    sendOTPEmail(email, otp, fullName).catch((error) => {
      console.error(`Failed to send OTP email to ${email}:`, error);
    });

    return res.status(200).json({
      message: 'OTP đã được gửi đến email của bạn. Vui lòng kiểm tra và nhập mã OTP.',
      email: email
    });
  } catch (error) {
    next(error);
  }
};

// Xác thực OTP và hoàn tất đăng ký
export const verifyOTPAndRegisterController = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    // Validation
    if (!email || !otp) {
      throw new BadRequestError('Vui lòng cung cấp email và mã OTP');
    }

    // Tìm OTP verification record
    const otpRecord = await OTPVerification.findOne({ email, otp });

    if (!otpRecord) {
      throw new BadRequestError('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    // Kiểm tra lại user có tồn tại không (double check)
    const existingUser = await User.findOne({
      $or: [{ username: otpRecord.username }, { email: otpRecord.email }]
    });

    if (existingUser) {
      // Xóa OTP record
      await OTPVerification.deleteOne({ _id: otpRecord._id });
      throw new BadRequestError('Username hoặc email đã tồn tại');
    }

    // Tạo user mới từ thông tin đã lưu
    const newUser = new User({
      username: otpRecord.username,
      email: otpRecord.email,
      passwordHash: otpRecord.passwordHash,
      fullName: otpRecord.fullName,
      classId: null,
      googleId: null,
      facebookId: null,
      zaloId: null,
      provider: 'local',
      avatar: null,
      characterId: null,
      roles: ['student'],
      isGuest: false
    });

    await newUser.save();

    // Tạo reward record
    const reward = new Reward({ userId: newUser._id });
    await reward.save();

    // Xóa OTP record sau khi đăng ký thành công
    await OTPVerification.deleteOne({ _id: otpRecord._id });

    // Tạo tokens
    const accessToken = createAccessToken(newUser);
    const refreshToken = await createRefreshToken(newUser);

    return res.status(201).json({
      message: 'Đăng ký thành công',
      accessToken,
      refreshToken,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        fullName: newUser.fullName,
        classId: newUser.classId
      }
    });
  } catch (error) {
    next(error);
  }
};
