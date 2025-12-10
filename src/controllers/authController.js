import User from '../models/user.schema.js';
import Reward from '../models/reward.schema.js';
import UserActivity from '../models/userActivity.schema.js';
import RefreshToken from '../models/refreshToken.schema.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;
const GUEST_EXPIRY_DAYS = parseInt(process.env.GUEST_EXPIRY_DAYS) || 7;

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
export const registerController = async (req, res) => {
  try {
    const { username, email, password, fullName, classId } = req.body;

    // Validation - chỉ cần username, email, password, fullName
    if (!username || !email || !password || !fullName) {
      return res.status(400).json({
        message: 'Vui lòng điền đầy đủ thông tin: username, email, password, fullName'
      });
    }

    // Kiểm tra user đã tồn tại
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Username hoặc email đã tồn tại' });
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
    return res.status(500).json({ message: error.message });
  }
};

// Đăng nhập
export const loginController = async (req, res) => {
  try {
    const { username, password } = req.body;
    const deviceInfo = req.headers['user-agent'] || null;

    // Tìm user
    const user = await User.findOne({ username }).populate('classId');
    if (!user) {
      return res.status(401).json({ message: 'Username hoặc mật khẩu không đúng' });
    }

    // Kiểm tra password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Username hoặc mật khẩu không đúng' });
    }

    // Tạo tokens
    const accessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user, deviceInfo);

    return res.status(200).json({
      message: 'Đăng nhập thành công',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        classId: user.classId
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Refresh Access Token
export const refreshTokenController = async (req, res) => {
  try {
    const refreshToken = req.body.refreshToken;
    const deviceInfo = req.headers['user-agent'] || null;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token không tìm thấy' });
    }

    // Kiểm tra refresh token có trong database không
    const storedToken = await RefreshToken.findOne({ token: refreshToken });
    
    if (!storedToken) {
      return res.status(401).json({ message: 'Refresh token không hợp lệ hoặc đã bị revoke' });
    }

    // Kiểm tra token đã bị revoke chưa
    if (storedToken.isRevoked) {
      return res.status(401).json({ message: 'Refresh token đã bị thu hồi' });
    }

    // Kiểm tra token đã hết hạn chưa (theo database)
    if (storedToken.expiresAt < new Date()) {
      // Xóa token hết hạn
      await RefreshToken.deleteOne({ _id: storedToken._id });
      return res.status(401).json({ message: 'Refresh token đã hết hạn' });
    }

    // Verify refresh token với JWT
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, SECRET_KEY);
    } catch (jwtError) {
      // Revoke token nếu JWT verification fail
      await RefreshToken.updateOne({ _id: storedToken._id }, { isRevoked: true });
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Refresh token đã hết hạn' });
      }
      return res.status(401).json({ message: 'Refresh token không hợp lệ' });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'User không tìm thấy' });
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
    return res.status(500).json({ message: error.message });
  }
};

// Lấy thông tin user
export const getUserController = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate('classId');

    if (!user) {
      return res.status(404).json({ message: 'User không tìm thấy' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Đổi mật khẩu
export const changePasswordController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    // Kiểm tra các field bắt buộc
    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin' });
    }

    // Kiểm tra mật khẩu mới và xác nhận khớp nhau
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Mật khẩu mới không khớp' });
    }

    // Kiểm tra mật khẩu mới có khác mật khẩu cũ
    if (oldPassword === newPassword) {
      return res.status(400).json({ message: 'Mật khẩu mới phải khác mật khẩu cũ' });
    }

    // Tìm user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User không tìm thấy' });
    }

    // Kiểm tra mật khẩu cũ
    const isValidPassword = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Mật khẩu cũ không đúng' });
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
    return res.status(500).json({ message: error.message });
  }
};

// Logout
export const logoutController = async (req, res) => {
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
    return res.status(500).json({ message: error.message });
  }
};

// Đăng nhập khách (Guest Login)
export const guestLoginController = async (req, res) => {
  try {
    const { fullName } = req.body;

    if (!fullName) {
      return res.status(400).json({ message: 'Vui lòng nhập tên của bạn' });
    }

    // Tạo thời gian hết hạn (7 ngày từ bây giờ)
    const guestExpiresAt = new Date();
    guestExpiresAt.setDate(guestExpiresAt.getDate() + parseInt(GUEST_EXPIRY_DAYS));

    // Tạo guest user
    const guestUser = new User({
      fullName,
      isGuest: true,
      guestExpiresAt,
      username: null,
      passwordHash: null,
      email: null
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
    return res.status(500).json({ message: error.message });
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
export const deleteGuestController = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User không tìm thấy' });
    }

    if (!user.isGuest) {
      return res.status(400).json({ message: 'Chỉ có thể xóa tài khoản khách' });
    }

    await deleteGuestData(userId);

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    return res.status(200).json({ message: 'Xóa tài khoản khách thành công' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Chuyển từ guest sang user thường (đăng ký chính thức)
export const convertGuestToUserController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: 'Vui lòng điền đầy đủ: username, email, password'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User không tìm thấy' });
    }

    if (!user.isGuest) {
      return res.status(400).json({ message: 'Tài khoản này đã là user thường' });
    }

    // Kiểm tra username/email đã tồn tại
    const existingUser = await User.findOne({ 
      $or: [{ username }, { email }],
      _id: { $ne: userId }
    });
    if (existingUser) {
      return res.status(400).json({ message: 'Username hoặc email đã tồn tại' });
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
    return res.status(500).json({ message: error.message });
  }
};
