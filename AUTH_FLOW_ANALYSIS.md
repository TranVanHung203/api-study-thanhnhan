# 🔐 Phân tích Token Authentication & Authorization

## 📍 NHẬN TOKEN

### 1️⃣ **Nơi tạo token: `src/controllers/authController.js`**

```javascript
// Line 10-17: Tạo Access Token (15 phút)
const createAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email },
    SECRET_KEY,
    { expiresIn: ACCESS_TOKEN_EXPIRY }  // 15m
  );
};

// Line 19-26: Tạo Refresh Token (7 ngày)
const createRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username },
    SECRET_KEY,
    { expiresIn: REFRESH_TOKEN_EXPIRY }  // 7d
  );
};
```

### 2️⃣ **Nơi gửi token: `src/controllers/authController.js` - loginController**

```javascript
// Line 85-102: Đăng nhập tạo tokens
export const loginController = async (req, res) => {
  // ...
  // Tạo tokens
  const accessToken = createAccessToken(user);      // ← Tạo access token
  const refreshToken = createRefreshToken(user);    // ← Tạo refresh token
  
  // Lưu vào cookies
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: false,
    maxAge: 15 * 60 * 1000  // 15 phút
  });

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 ngày
  });

  // Trả về cho client
  return res.status(200).json({
    message: 'Đăng nhập thành công',
    accessToken,    // ← Gửi token
    refreshToken,   // ← Gửi token
    user: { ... }
  });
};
```

---

## 🔍 GIẢI MÃ TOKEN

### 3️⃣ **Nơi giải mã token: `src/middlewares/authMiddleware.js`**

#### **Kiểm tra whitelist (không cần token)**
```javascript
// Line 7-8: Routes không cần token
const white_lists = ["/", "/register", "/login", "/refresh", ...];

if (white_lists.find(item => '' + item === req.originalUrl) || 
    req.originalUrl.startsWith('/api-docs')) {
  next();  // ← Bỏ qua xác thực
}
```

#### **Nhận token từ cookie**
```javascript
// Line 11-12: Lấy token từ cookie
else if (req?.cookies?.access_token) {
  const accessToken = req?.cookies?.access_token;  // ← Nhận từ cookie
  
  try {
    // Giải mã token
    const decode = jwt.verify(accessToken, SECRET_KEY);  // ← GIẢI MÃ
    
    // Lưu user info vào req
    req.user = {
      id: decode.id,           // ← Lấy id từ token
      username: decode.username,
      email: decode.email
    }
    next();  // ← Cho phép tiếp tục
  } catch (error) { ... }
}
```

#### **Xử lý token hết hạn - Tự động làm mới**
```javascript
// Line 23-56: Token hết hạn -> dùng refresh token
if (error.name === "TokenExpiredError") {
  if (req?.cookies?.refresh_token) {
    const refreshToken = req?.cookies?.refresh_token;
    
    try {
      // Giải mã refresh token
      const decodeRefresh = jwt.verify(refreshToken, SECRET_KEY);  // ← GIẢI MÃ
      
      // Tạo access token mới
      const newAccessToken = jwt.sign(payload, SECRET_KEY, {
        expiresIn: '15m'
      });
      
      // Lưu token mới vào cookie
      res.cookie('access_token', newAccessToken, { ... });
      
      // Set req.user để tiếp tục
      req.user = { id, username, email };
      next();
    } catch (error) {
      // Refresh token không hợp lệ -> yêu cầu login lại
      return res.status(401).json({ message: "Refresh token không hợp lệ" });
    }
  }
}
```

---

## 👥 PHÂN QUYỀN

### ⚠️ **HIỆN TẠI: CHƯA CÓ PHÂN QUYỀN**

Project hiện chỉ có:
- ✅ **Authentication** (xác thực user - ai là ai)
- ❌ **Authorization** (phân quyền - ai được làm gì)

### 4️⃣ **Nơi cần thêm phân quyền**

**Option 1: Thêm `role` vào token**

```javascript
// authController.js - Thêm role vào token
const createAccessToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      username: user.username, 
      email: user.email,
      role: user.role  // ← THÊM ROLE
    },
    SECRET_KEY,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};
```

**Option 2: Tạo middleware kiểm tra quyền**

```javascript
// src/middlewares/roleMiddleware.js
export const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Không có token' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Không có quyền' });
    }
    
    next();
  };
};
```

**Option 3: Dùng middleware trong routes**

```javascript
// src/routes/skillRoutes.js
import { checkRole } from '../middlewares/roleMiddleware.js';

// Chỉ admin mới được tạo skill
router.post('/', authToken, checkRole(['admin']), createSkillController);

// Tất cả user có role được xem
router.get('/class/:classId', authToken, getSkillsByClassController);
```

---

## 📊 FLOW AUTHENTICATION & AUTHORIZATION

```
┌─────────────────────────────────────────────────────────────┐
│                    1. ĐĂNG NHẬP                             │
├─────────────────────────────────────────────────────────────┤
│ POST /auth/login                                             │
│ └─ username: "user123"                                      │
│ └─ password: "pass123"                                      │
│                                                              │
│ loginController (authController.js):                        │
│ ├─ Hash password kiểm tra                                   │
│ ├─ createAccessToken() → JWT token 15m                      │
│ ├─ createRefreshToken() → JWT token 7d                      │
│ ├─ Lưu tokens vào cookies                                   │
│ └─ Trả về tokens cho client                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                2. GỬI REQUEST VỚI TOKEN                      │
├─────────────────────────────────────────────────────────────┤
│ GET /skills/class/123                                        │
│ Headers: Authorization: Bearer <accessToken>               │
│ Cookies: access_token=..., refresh_token=...               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│             3. KIỂM TRA & GIẢI MÃ TOKEN                      │
├─────────────────────────────────────────────────────────────┤
│ authMiddleware (authMiddleware.js):                         │
│                                                              │
│ ├─ Kiểm tra whitelist? → Bỏ qua                             │
│ │                                                            │
│ ├─ Có access_token? → Giải mã bằng SECRET_KEY               │
│ │  ├─ ✅ Valid → req.user = { id, username, email }         │
│ │  └─ ❌ Hết hạn → Dùng refresh_token tạo token mới        │
│ │     └─ Lưu token mới vào cookie                           │
│ │                                                            │
│ └─ Không có token? → 401 Unauthorized                       │
│                                                              │
│ req.user = {                                                │
│   id: "65a1b2c3d4e5f6g7h8i9j0k1",                          │
│   username: "user123",                                      │
│   email: "user@example.com"                                 │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│          4. TỈM KIẾM PHÂN QUYỀN (CHƯA CÓ)                   │
├─────────────────────────────────────────────────────────────┤
│ Sẽ kiểm tra: req.user.role === 'admin'?                    │
│ ├─ ✅ Yes → Cho phép thực hiện hành động                    │
│ └─ ❌ No → 403 Forbidden                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              5. THỰC HIỆN CONTROLLER                         │
├─────────────────────────────────────────────────────────────┤
│ getSkillsByClassController (skillController.js):           │
│ ├─ const userId = req.user.id  ← Lấy từ token              │
│ ├─ const skills = await Skill.find({ classId })            │
│ └─ return res.status(200).json({ skills })                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 TÓNG HỢP

| Yếu tố | Nơi xử lý | Chi tiết |
|--------|----------|---------|
| **Tạo token** | `authController.js` line 10-26 | jwt.sign() |
| **Gửi token** | `authController.js` line 85-102 | response + cookies |
| **Nhận token** | `authMiddleware.js` line 11-12 | cookies |
| **Giải mã token** | `authMiddleware.js` line 16 | jwt.verify() |
| **Làm mới token** | `authMiddleware.js` line 25-54 | Check expired -> tạo mới |
| **Phân quyền** | ❌ **CHƯA CÓ** | Cần thêm role field |

---

## 🚀 ĐỀ XUẤT THÊM PHÂN QUYỀN

Bạn muốn mình thêm role-based authorization không?
1. Thêm `role` field vào User schema
2. Tạo middleware `checkRole()`
3. Áp dụng vào routes cần phân quyền
