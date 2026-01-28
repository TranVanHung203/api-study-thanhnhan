import User from '../models/user.schema.js';
import Reward from '../models/reward.schema.js';
import UserActivity from '../models/userActivity.schema.js';
import RefreshToken from '../models/refreshToken.schema.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import BadRequestError from '../errors/badRequestError.js';
import NotFoundError from '../errors/notFoundError.js';
import UnauthorizedError from '../errors/unauthorizedError.js';
import ForbiddenError from '../errors/forbiddenError.js';
import { OAuth2Client } from 'google-auth-library';
import Character from '../models/character.schema.js';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;
const GUEST_EXPIRY_DAYS = parseInt(process.env.GUEST_EXPIRY_DAYS) || 7;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Tạo Access Token
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

// Đăng ký user
export const registerController = async (req, res, next) => {
  try {
    const { username, email, password, fullName, classId } = req.body;

    // Validation - chỉ cần username, email, password, fullName
    if (!username || !email || !password || !fullName) {
      throw new BadRequestError('Vui lòng điền đầy đủ thông tin: username, email, password, fullName');
    }

    // Kiểm tra user đã tồn tại
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      throw new BadRequestError('Username hoặc email đã tồn tại');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Tạo user mới - classId mặc định null, giáo viên chỉnh sửa sau hoặc tự động nâng cấp
    const newUser = new User({
      username,
      email,
      passwordHash,
      fullName,
      classId: null
    });

    await newUser.save();

    // Tạo reward record
    const reward = new Reward({ userId: newUser._id });
    await reward.save();

    return res.status(201).json({
      message: 'Đăng ký thành công',
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        fullName: newUser.fullName,
        classId: null
      }
    });
  } catch (error) {
    next(error);
  }
};

// Đăng nhập
export const loginController = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const deviceInfo = req.headers['user-agent'] || null;

    // Tìm user
    const user = await User.findOne({ username }).populate('classId');
    if (!user) {
      throw new UnauthorizedError('Không tìm thấy tên đăng nhập');
    }

    // Kiểm tra password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Mật khẩu không đúng, vui lòng nhập lại');
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
      throw new UnauthorizedError('Refresh token không tìm thấy');
    }

    // Kiểm tra refresh token có trong database không
    const storedToken = await RefreshToken.findOne({ token: refreshToken });

    if (!storedToken) {
      throw new UnauthorizedError('Refresh token không hợp lệ hoặc đã bị revoke');
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
      .populate('classId')
      .select('_id fullName email classId characterId');

    if (!user) throw new NotFoundError('User không tìm thấy');

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
    // await RefreshToken.updateMany({ userId }, { isRevoked: true });

    // Nếu là guest, xóa tất cả dữ liệu liên quan
    if (userId) {
      const user = await User.findById(userId);
      if (user && user.isGuest) {
        // Xóa tất cả refresh tokens của guest
        await RefreshToken.deleteMany({ userId });
        await deleteGuestData(userId);
      }
    }

    return res.status(200).json({ message: 'Đăng xuất thành công' });
  } catch (error) {
    next(error);
  }
};

// Đăng nhập khách (Guest Login)
export const guestLoginController = async (req, res, next) => {
  try {
    const { fullName = "Người dùng" } = req.body;

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

// Verify Google ID token (Android / Flutter client)
export const googleTokenController = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    const deviceInfo = req.headers['user-agent'] || null;

    if (!idToken) {
      throw new BadRequestError('Missing idToken');
    }

    // Verify idToken using google-auth-library
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    } catch (err) {
      throw new UnauthorizedError('Invalid Google idToken');
    }

    const payload = ticket.getPayload();
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
    const accessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user, deviceInfo);

    return res.status(200).json({
      message: 'Google sign-in successful',
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
    });
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

// Chuyển từ guest sang user thường (đăng ký chính thức)
export const convertGuestToUserController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      throw new BadRequestError('Vui lòng điền đầy đủ: username, email, password');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User không tìm thấy');
    }

    if (!user.isGuest) {
      throw new BadRequestError('Tài khoản này đã là user thường');
    }

    // Kiểm tra username/email đã tồn tại
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
      _id: { $ne: userId }
    });
    if (existingUser) {
      throw new BadRequestError('Username hoặc email đã tồn tại');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Cập nhật user từ guest sang user thường
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
      message: 'Chuyển đổi tài khoản thành công! Dữ liệu học tập được giữ nguyên.',
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
    const { fullName, characterId } = req.body;

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
    await user.save();

    return res.status(200).json({ message: 'Cập nhật tên và gán character thành công', fullName: user.fullName, characterId: user.characterId });
  } catch (error) {
    next(error);
  }
};
