# 🌱 Hướng dẫn Seed Database

## 📋 Dữ liệu sẽ tạo

File `seedDatabase.js` sẽ tạo dữ liệu mẫu sau:

### 📊 Cấu trúc dữ liệu
```
✅ 1 Class (Lớp 1)
  ├─ ✅ 2 Users (student1, student2)
  ├─ ✅ 1 Skill (Cộng trong phạm vi 100)
  │   ├─ ✅ 2 Videos
  │   ├─ ✅ 2 Exercises
  │   ├─ ✅ 1 Quiz (15 câu hỏi)
  │   └─ ✅ 5 Progress steps (video→video→exercise→exercise→quiz)
  ├─ ✅ 3 User Activities (mẫu lịch sử học)
  └─ ✅ Rewards cho các user
```

---

## 🚀 Hướng dẫn chạy

### Step 1: Kiểm tra MongoDB đang chạy
```bash
# Trên Windows
# Nếu dùng Docker
docker run -d -p 27017:27017 --name mongodb mongo

# Hoặc nếu cài local, kiểm tra service MongoDB chạy
```

### Step 2: Cấu hình file .env
Đảm bảo `.env` có `MONGO_URI`:
```bash
MONGO_URI=mongodb://localhost:27017/online_learning
SECRET_KEY=your-secret-key
PORT=5000
```

### Step 3: Chạy seed script
```bash
node seedDatabase.js
```

### Step 4: Xem kết quả
```
✅ Kết nối MongoDB thành công
✅ Class đã tạo: 65a1b2c3d4e5f6g7h8i9j0k1
✅ User #1 đã tạo: student1
✅ User #2 đã tạo: student2
✅ Rewards đã tạo
✅ Skill đã tạo: 65a1b2c3d4e5f6g7h8i9j0k1
✅ Videos đã tạo: 2
✅ Exercises đã tạo: 2
✅ Quiz đã tạo: 65a1b2c3d4e5f6g7h8i9j0k1
✅ Questions đã tạo: 15
✅ Progress steps đã tạo: 5
✅ User Activities đã tạo: 3
✅ Rewards đã cập nhật

==================================================
✅ SEED DATABASE HOÀN TẤT!
==================================================

📊 Dữ liệu đã tạo:
  • Classes: 1
  • Users: 2
  • Skills: 1
  • Videos: 2
  • Exercises: 2
  • Quiz: 1
  • Questions: 15
  • Progress steps: 5
  • User activities: 3

🔐 Thông tin đăng nhập:
  User 1: student1 / user123
  User 2: student2 / user456
```

---

## 🧪 Test API sau khi seed

### 1. Đăng nhập
```bash
POST http://localhost:5000/auth/login
Content-Type: application/json

{
  "username": "student1",
  "password": "user123"
}
```

Response:
```json
{
  "message": "Đăng nhập thành công",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "username": "student1",
    "email": "student1@example.com",
    "fullName": "Nguyễn Văn A",
    "classId": "65a1b2c3d4e5f6g7h8i9j0k2"
  }
}
```

### 2. Lấy danh sách Skills của Class
```bash
GET http://localhost:5000/skills/class/65a1b2c3d4e5f6g7h8i9j0k2
Authorization: Bearer <accessToken>
```

### 3. Lấy Progress steps của Skill
```bash
GET http://localhost:5000/progress/skill/65a1b2c3d4e5f6g7h8i9j0k3
Authorization: Bearer <accessToken>
```

### 4. Lấy chi tiết Quiz (kèm 15 câu hỏi)
```bash
GET http://localhost:5000/quizzes/65a1b2c3d4e5f6g7h8i9j0k4
Authorization: Bearer <accessToken>
```

### 5. Lấy điểm thưởng
```bash
GET http://localhost:5000/rewards
Authorization: Bearer <accessToken>
```

---

## 📝 Dữ liệu chi tiết

### Users
| Username | Email | Password | Tên | Lớp |
|----------|-------|----------|-----|-----|
| student1 | student1@example.com | user123 | Nguyễn Văn A | Lớp 1 |
| student2 | student2@example.com | user456 | Trần Thị B | Lớp 1 |

### Skill
- **Tên:** Cộng trong phạm vi 100
- **Mô tả:** Học các phép cộng từ 1 đến 100
- **Thứ tự:** 1

### Videos
1. "Giới thiệu về phép cộng" (5 phút)
2. "Cộng các số từ 1-20" (8 phút)

### Exercises
1. "Bài tập cộng số 1" - Frontend ref: `addition_level_1` (10 điểm)
2. "Bài tập cộng số 2" - Frontend ref: `addition_level_2` (15 điểm)

### Quiz
- **Tên:** Kiểm tra kiến thức cộng
- **Số câu hỏi:** 15
- **Điểm thưởng:** 100 điểm (nếu làm đúng hết)

### Quiz Questions (15 câu)
```
1. 5 + 3 = ? → 8
2. 12 + 8 = ? → 20
3. 25 + 15 = ? → 40
4. 7 + 6 = ? → 13
5. 18 + 22 = ? → 40
6. 33 + 17 = ? → 50
7. 9 + 4 = ? → 13
8. 44 + 26 = ? → 70
9. 11 + 9 = ? → 20
10. 37 + 23 = ? → 60
11. 16 + 14 = ? → 30
12. 42 + 18 = ? → 60
13. 8 + 7 = ? → 15
14. 29 + 31 = ? → 60
15. 21 + 19 = ? → 40
```

---

## ⚠️ Lưu ý

- **Chỉ chạy 1 lần:** Nếu chạy lại, dữ liệu cũ sẽ bị thêm vào (không xóa tự động)
- **Nếu muốn xóa dữ liệu:** Xóa database hoặc chạy:
  ```bash
  # Trong MongoDB shell
  use online_learning
  db.dropDatabase()
  ```
- **Passwords đã hash:** Dùng bcrypt, không lưu plaintext

---

## 🎯 Sau khi seed xong

Bạn có thể:
1. ✅ Test API từ Swagger: `http://localhost:5000/api-docs`
2. ✅ Dùng Postman/Insomnia test
3. ✅ Xây dựng Frontend dựa trên dữ liệu này
4. ✅ Tạo thêm skills, videos, exercises khác
