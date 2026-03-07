import User from '../models/user.schema.js';
import Reward from '../models/reward.schema.js';
import UserActivity from '../models/userActivity.schema.js';
import RefreshToken from '../models/refreshToken.schema.js';
import OTPVerification from '../models/otpVerification.schema.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import BadRequestError from '../errors/badRequestError.js';
import NotFoundError from '../errors/notFoundError.js';
import UnauthorizedError from '../errors/unauthorizedError.js';
import ForbiddenError from '../errors/forbiddenError.js';
import { OAuth2Client } from 'google-auth-library';
import Character from '../models/character.schema.js';
import { generateOTP, sendOTPEmail } from '../config/emailConfig.js';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;
const GUEST_EXPIRY_DAYS = parseInt(process.env.GUEST_EXPIRY_DAYS) || 7;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Táº¡o Access Token
const createAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email },
    SECRET_KEY,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

// Táº¡o Refresh Token vÃ  lÆ°u vÃ o database
const createRefreshToken = async (user, deviceInfo = null) => {
  const token = jwt.sign(
    { id: user._id, username: user.username },
    SECRET_KEY,
    { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
  );

  // TÃ­nh thá»i gian háº¿t háº¡n
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  // LÆ°u vÃ o database
  const refreshTokenDoc = new RefreshToken({
    userId: user._id,
    token,
    expiresAt,
    deviceInfo
  });

  await refreshTokenDoc.save();

  return token;
};




// ÄÄƒng nháº­p
export const loginController = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const deviceInfo = req.headers['user-agent'] || null;

    // TÃ¬m user
    const user = await User.findOne({ username }).populate('classId');
    if (!user) {
      throw new UnauthorizedError('KhÃ´ng tÃ¬m tháº¥y tÃªn Ä‘Äƒng nháº­p');
    }

    // Kiá»ƒm tra password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Máº­t kháº©u khÃ´ng Ä‘Ãºng, vui lÃ²ng nháº­p láº¡i');
    }

    // Táº¡o tokens
    const accessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user, deviceInfo);

    return res.status(200).json({
      message: 'ÄÄƒng nháº­p thÃ nh cÃ´ng',
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
      throw new UnauthorizedError('Refresh token khÃ´ng tÃ¬m tháº¥y');
    }

    // Kiá»ƒm tra refresh token cÃ³ trong database khÃ´ng
    const storedToken = await RefreshToken.findOne({ token: refreshToken });

    if (!storedToken) {
      throw new UnauthorizedError('Refresh token khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ bá»‹ revoke');
    }

    // Kiá»ƒm tra token Ä‘Ã£ bá»‹ revoke chÆ°a
    if (storedToken.isRevoked) {
      throw new UnauthorizedError('Refresh token Ä‘Ã£ bá»‹ thu há»“i');
    }

    // Kiá»ƒm tra token Ä‘Ã£ háº¿t háº¡n chÆ°a (theo database)
    if (storedToken.expiresAt < new Date()) {
      // XÃ³a token háº¿t háº¡n
      await RefreshToken.deleteOne({ _id: storedToken._id });
      throw new UnauthorizedError('Refresh token Ä‘Ã£ háº¿t háº¡n');
    }

    // Verify refresh token vá»›i JWT
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, SECRET_KEY);
    } catch (jwtError) {
      // Revoke token náº¿u JWT verification fail
      await RefreshToken.updateOne({ _id: storedToken._id }, { isRevoked: true });
      if (jwtError.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Refresh token Ä‘Ã£ háº¿t háº¡n');
      }
      throw new UnauthorizedError('Refresh token khÃ´ng há»£p lá»‡');
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      throw new NotFoundError('User khÃ´ng tÃ¬m tháº¥y');
    }

    // Revoke token cÅ© trong database
    await RefreshToken.updateOne({ _id: storedToken._id }, { isRevoked: true });

    // Táº¡o cáº£ access token vÃ  refresh token má»›i
    const newAccessToken = createAccessToken(user);
    const newRefreshToken = await createRefreshToken(user, deviceInfo);

    return res.status(200).json({
      message: 'Refresh token thÃ nh cÃ´ng',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    next(error);
  }
};

// Láº¥y thÃ´ng tin user
export const getUserController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .populate('classId')
      .select('_id fullName email classId characterId');

    if (!user) throw new NotFoundError('User khÃ´ng tÃ¬m tháº¥y');

    return res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      classId: user.classId || null,
      characterId: user.characterId || null

    });
  } catch (error) {
    next(error);
  }
};

// Äá»•i máº­t kháº©u
export const changePasswordController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    // Kiá»ƒm tra cÃ¡c field báº¯t buá»™c
    if (!oldPassword || !newPassword || !confirmPassword) {
      throw new BadRequestError('Vui lÃ²ng nháº­p Ä‘áº§y Ä‘á»§ thÃ´ng tin');
    }

    // Kiá»ƒm tra máº­t kháº©u má»›i vÃ  xÃ¡c nháº­n khá»›p nhau
    if (newPassword !== confirmPassword) {
      throw new BadRequestError('Máº­t kháº©u má»›i khÃ´ng khá»›p');
    }

    // Kiá»ƒm tra máº­t kháº©u má»›i cÃ³ khÃ¡c máº­t kháº©u cÅ©
    if (oldPassword === newPassword) {
      throw new BadRequestError('Máº­t kháº©u má»›i pháº£i khÃ¡c máº­t kháº©u cÅ©');
    }

    // TÃ¬m user
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User khÃ´ng tÃ¬m tháº¥y');
    }

    // Kiá»ƒm tra máº­t kháº©u cÅ©
    const isValidPassword = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Máº­t kháº©u cÅ© khÃ´ng Ä‘Ãºng');
    }

    // Hash máº­t kháº©u má»›i
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Cáº­p nháº­t user
    await User.findByIdAndUpdate(
      userId,
      { passwordHash: newPasswordHash },
      { new: true }
    );

    return res.status(200).json({
      message: 'Äá»•i máº­t kháº©u thÃ nh cÃ´ng'
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

    //Náº¿u cÃ³ userId, xÃ³a táº¥t cáº£ refresh tokens cá»§a user (optional - logout khá»i táº¥t cáº£ thiáº¿t bá»‹)
    await RefreshToken.updateMany({ userId }, { isRevoked: true });

    // // Náº¿u lÃ  guest, xÃ³a táº¥t cáº£ dá»¯ liá»‡u liÃªn quan
    // if (userId) {
    //   const user = await User.findById(userId);
    //   if (user && user.isGuest) {
    //     // XÃ³a táº¥t cáº£ refresh tokens cá»§a guest
    //     await RefreshToken.deleteMany({ userId });
    //     await deleteGuestData(userId);
    //   }
    // }

    return res.status(200).json({ message: 'ÄÄƒng xuáº¥t thÃ nh cÃ´ng' });
  } catch (error) {
    next(error);
  }
};

// ÄÄƒng nháº­p khÃ¡ch (Guest Login)
export const guestLoginController = async (req, res, next) => {
  try {
    const { fullName = "NgÆ°á»i dÃ¹ng" } = req.body;

    // Táº¡o thá»i gian háº¿t háº¡n (7 ngÃ y tá»« bÃ¢y giá»)
    const guestExpiresAt = new Date();
    guestExpiresAt.setDate(guestExpiresAt.getDate() + parseInt(GUEST_EXPIRY_DAYS));

    // Táº¡o unique ID cho guest Ä‘á»ƒ trÃ¡nh trÃ¹ng láº·p
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Táº¡o guest user vá»›i username vÃ  email unique
    const guestUser = new User({
      fullName,
      isGuest: true,
      guestExpiresAt,
      username: guestId,
      passwordHash: null,
      email: `${guestId}@guest.temp`
    });

    await guestUser.save();

    // Táº¡o reward record cho guest
    const reward = new Reward({ userId: guestUser._id });
    await reward.save();

    const deviceInfo = req.headers['user-agent'] || null;

    // Táº¡o tokens
    const accessToken = createAccessToken(guestUser);
    const refreshToken = await createRefreshToken(guestUser, deviceInfo);

    return res.status(201).json({
      message: 'ÄÄƒng nháº­p khÃ¡ch thÃ nh cÃ´ng',
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

// Verify Google ID token (Android / Flutter client) hoáº·c accessToken (Web)
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
      // Sá»­ dá»¥ng accessToken Ä‘á»ƒ láº¥y thÃ´ng tin user tá»« Google API (Web)
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
        // Map userinfo response to payload format tÆ°Æ¡ng tá»± idToken
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
    const email = payload.email || null;
    const email_verified = payload.email_verified || false;
    const emailLocalPart = email ? email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, ' ') : null;
    // allow client to send `fullName` when token payload omits name
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
      user = await User.findOne({ email });
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
      if (updated) {
        await user.save();
      }
    }

    // If still not found, create new user
    if (!user) {
      // generate a safe unique username (avoid collisions by including timestamp)
      const generatedUsername = email
        ? (email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '') || `googleuser`) + `_${Date.now()}`
        : `google_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // create a random password hash so required passwordHash field is satisfied
      const randomPassword = Math.random().toString(36) + Date.now().toString(36);
      const passwordHashForOauth = await bcrypt.hash(randomPassword, 10);

      const newUser = new User({
        username: generatedUsername,
        email: email || null,
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

// XÃ³a táº¥t cáº£ dá»¯ liá»‡u liÃªn quan Ä‘áº¿n guest
const deleteGuestData = async (userId) => {
  try {
    // XÃ³a UserActivity - lá»‹ch sá»­ hoáº¡t Ä‘á»™ng cá»§a user
    const deletedActivities = await UserActivity.deleteMany({ userId });

    // XÃ³a Reward - Ä‘iá»ƒm thÆ°á»Ÿng cá»§a user
    const deletedRewards = await Reward.deleteMany({ userId });

    // XÃ³a User
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

// API Ä‘á»ƒ xÃ³a guest thá»§ cÃ´ng (khi user xÃ³a app hoáº·c muá»‘n xÃ³a tÃ i khoáº£n khÃ¡ch)
export const deleteGuestController = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User khÃ´ng tÃ¬m tháº¥y');
    }

    if (!user.isGuest) {
      throw new BadRequestError('Chá»‰ cÃ³ thá»ƒ xÃ³a tÃ i khoáº£n khÃ¡ch');
    }

    await deleteGuestData(userId);

    return res.status(200).json({ message: 'XÃ³a tÃ i khoáº£n khÃ¡ch thÃ nh cÃ´ng' });
  } catch (error) {
    next(error);
  }
};

// Chuyá»ƒn tá»« guest sang user thÆ°á»ng (Ä‘Äƒng kÃ½ chÃ­nh thá»©c)
export const convertGuestToUserController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      throw new BadRequestError('Vui lÃ²ng Ä‘iá»n Ä‘áº§y Ä‘á»§: username, email, password');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User khÃ´ng tÃ¬m tháº¥y');
    }

    if (!user.isGuest) {
      throw new BadRequestError('TÃ i khoáº£n nÃ y Ä‘Ã£ lÃ  user thÆ°á»ng');
    }

    // Kiá»ƒm tra username/email Ä‘Ã£ tá»“n táº¡i
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
      _id: { $ne: userId }
    });
    if (existingUser) {
      throw new BadRequestError('Username hoáº·c email Ä‘Ã£ tá»“n táº¡i');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Cáº­p nháº­t user tá»« guest sang user thÆ°á»ng
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        username,
        email,
        passwordHash,
        isGuest: false,
        guestExpiresAt: null
      },
      { new: true }
    );

    return res.status(200).json({
      message: 'Chuyá»ƒn Ä‘á»•i tÃ i khoáº£n thÃ nh cÃ´ng! Dá»¯ liá»‡u há»c táº­p Ä‘Æ°á»£c giá»¯ nguyÃªn.',
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        isGuest: false
      }
    });
  } catch (error) {
    next(error);
  }
};

// Äá»•i tÃªn Ä‘áº§y Ä‘á»§ (fullName) cá»§a user
export const changeFullNameController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { fullName } = req.body;

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
      throw new BadRequestError('fullName khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User khÃ´ng tÃ¬m tháº¥y');
    }

    user.fullName = fullName.trim();
    await user.save();

    return res.status(200).json({ message: 'Cáº­p nháº­t tÃªn thÃ nh cÃ´ng', fullName: user.fullName });
  } catch (error) {
    next(error);
  }
};

// Change full name and attach a character in one request
export const changeFullNameAndAttachCharacterController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { fullName, characterId } = req.body;

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
      throw new BadRequestError('fullName khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng');
    }

    if (!characterId) {
      throw new BadRequestError('characterId lÃ  báº¯t buá»™c');
    }

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User khÃ´ng tÃ¬m tháº¥y');

    const character = await Character.findById(characterId);
    if (!character) throw new NotFoundError('Character khÃ´ng tÃ¬m tháº¥y');

    // Apply updates: store reference to character id
    user.fullName = fullName.trim();
    user.characterId = character._id;
    await user.save();

    return res.status(200).json({ message: 'Cáº­p nháº­t tÃªn vÃ  gÃ¡n character thÃ nh cÃ´ng', fullName: user.fullName, characterId: user.characterId });
  } catch (error) {
    next(error);
  }
};

// Gá»­i OTP Ä‘á»ƒ Ä‘Äƒng kÃ½
export const sendOTPForRegisterController = async (req, res, next) => {
  try {
    const { username, email, password, fullName} = req.body;

    // Validation
    if (!username || !email || !password || !fullName) {
      throw new BadRequestError('Vui lÃ²ng Ä‘iá»n Ä‘áº§y Ä‘á»§ thÃ´ng tin: username, email, password, fullName');
    }

    // Validate password length
    if (password.length < 8) {
      throw new BadRequestError('Máº­t kháº©u pháº£i cÃ³ Ã­t nháº¥t 8 kÃ½ tá»±');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestError('Email khÃ´ng há»£p lá»‡');
    }

    // Kiá»ƒm tra user Ä‘Ã£ tá»“n táº¡i
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      throw new BadRequestError('Username hoáº·c email Ä‘Ã£ tá»“n táº¡i');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Táº¡o OTP
    const otp = generateOTP();

    // XÃ³a OTP cÅ© cá»§a email nÃ y (náº¿u cÃ³)
    await OTPVerification.deleteMany({ email });

    // LÆ°u thÃ´ng tin táº¡m thá»i cÃ¹ng OTP
    const otpVerification = new OTPVerification({
      email,
      otp,
      username,
      passwordHash,
      fullName
    });

    await otpVerification.save();

    // Gá»­i OTP qua email (asynchronous - khÃ´ng chá» gá»­i xong)
    sendOTPEmail(email, otp, fullName).catch(error => {
      console.error(`Failed to send OTP email to ${email}:`, error);
    });

    return res.status(200).json({
      message: 'OTP Ä‘Ã£ Ä‘Æ°á»£c gá»­i Ä‘áº¿n email cá»§a báº¡n. Vui lÃ²ng kiá»ƒm tra vÃ  nháº­p mÃ£ OTP.',
      email: email
    });
  } catch (error) {
    next(error);
  }
};

// XÃ¡c thá»±c OTP vÃ  hoÃ n táº¥t Ä‘Äƒng kÃ½
export const verifyOTPAndRegisterController = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    // Validation
    if (!email || !otp) {
      throw new BadRequestError('Vui lÃ²ng cung cáº¥p email vÃ  mÃ£ OTP');
    }

    // TÃ¬m OTP verification record
    const otpRecord = await OTPVerification.findOne({ email, otp });

    if (!otpRecord) {
      throw new BadRequestError('MÃ£ OTP khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n');
    }

    // Kiá»ƒm tra láº¡i user cÃ³ tá»“n táº¡i khÃ´ng (double check)
    const existingUser = await User.findOne({ 
      $or: [{ username: otpRecord.username }, { email: otpRecord.email }] 
    });
    
    if (existingUser) {
      // XÃ³a OTP record
      await OTPVerification.deleteOne({ _id: otpRecord._id });
      throw new BadRequestError('Username hoáº·c email Ä‘Ã£ tá»“n táº¡i');
    }

    // Táº¡o user má»›i tá»« thÃ´ng tin Ä‘Ã£ lÆ°u
    const newUser = new User({
      username: otpRecord.username,
      email: otpRecord.email,
      passwordHash: otpRecord.passwordHash,
      fullName: otpRecord.fullName,
      classId: null,
      googleId: null,
      provider: 'local',
      avatar: null,
      characterId: null,
      roles: ['student'],
      isGuest: false
    });

    await newUser.save();

    // Táº¡o reward record
    const reward = new Reward({ userId: newUser._id });
    await reward.save();

    // XÃ³a OTP record sau khi Ä‘Äƒng kÃ½ thÃ nh cÃ´ng
    await OTPVerification.deleteOne({ _id: otpRecord._id });

    // Táº¡o tokens
    const accessToken = createAccessToken(newUser);
    const refreshToken = await createRefreshToken(newUser);

    return res.status(201).json({
      message: 'ÄÄƒng kÃ½ thÃ nh cÃ´ng',
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
