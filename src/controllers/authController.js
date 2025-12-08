import User from '../models/user.schema.js';
import Reward from '../models/reward.schema.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

// Tạo Access Token
const createAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email },
    SECRET_KEY,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

// Tạo Refresh Token
const createRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username },
    SECRET_KEY,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
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
    const refreshToken = createRefreshToken(user);

    // Lưu tokens vào cookie
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: false, // set true nếu dùng HTTPS
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: false, // set true nếu dùng HTTPS
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

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
    const refreshToken = req.cookies.refresh_token || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token không tìm thấy' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, SECRET_KEY);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'User không tìm thấy' });
    }

    // Tạo access token mới
    const newAccessToken = createAccessToken(user);

    // Lưu vào cookie
    res.cookie('access_token', newAccessToken, {
      httpOnly: true,
      secure: false,
      maxAge: 15 * 60 * 1000
    });

    return res.status(200).json({
      message: 'Refresh token thành công',
      accessToken: newAccessToken
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Refresh token đã hết hạn' });
    }
    return res.status(401).json({ message: 'Refresh token không hợp lệ' });
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
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return res.status(200).json({ message: 'Đăng xuất thành công' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
