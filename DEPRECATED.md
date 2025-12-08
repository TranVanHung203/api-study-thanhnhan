# 🚨 DEPRECATED FILES - CÓ THỂ XÓA

File này liệt kê tất cả các file cũ không còn dùng trong project mới. Bạn có thể xóa chúng an toàn.

## 📁 Routes cũ - CÓ THỂ XÓA

```
src/routes/adminRoutes.js           ❌ Thay thế bởi authRoutes.js
src/routes/courseRoutes.js          ❌ Thay thế bởi skillRoutes.js + progressRoutes.js
src/routes/lessonRoutes.js          ❌ Không dùng nữa
src/routes/notifyRoutes.js          ❌ Không dùng nữa
src/routes/updateViewRoutes.js      ❌ Không dùng nữa
src/routes/userRoutes.js            ❌ Thay thế bởi authRoutes.js
src/routes/quizRoutes.js            ❌ Thay thế bởi quizNewRoutes.js
```

## 📁 Controllers cũ - CÓ THỂ XÓA

```
src/controllers/adminController.js        ❌ Không dùng nữa
src/controllers/courseController.js       ❌ Thay thế bởi skillController.js + progressController.js
src/controllers/lessonController.js       ❌ Không dùng nữa
src/controllers/notifyController.js       ❌ Không dùng nữa
src/controllers/userController.js         ❌ Thay thế bởi authController.js
src/controllers/quizController.js         ❌ Thay thế bởi quizNewController.js
```

## 📁 Models cũ - CÓ THỂ XÓA

```
src/models/course.schema.js              ❌ Không dùng nữa
src/models/lecturer.schema.js            ❌ Không dùng nữa
src/models/lesson.schema.js              ❌ Không dùng nữa
src/models/module.schema.js              ❌ Không dùng nữa
src/models/quizAnswer.schema.js          ❌ Không dùng nữa
src/models/quizQuestion.schema.js        ❌ Không dùng nữa
src/models/student.schema.js             ❌ Không dùng nữa
src/models/studentQuizAnswer.schema.js   ❌ Không dùng nữa
```

## ✅ Files CẤN GIỮ LẠI

### Routes
- `src/routes/authRoutes.js` ✅
- `src/routes/skillRoutes.js` ✅
- `src/routes/progressRoutes.js` ✅
- `src/routes/videoRoutes.js` ✅
- `src/routes/exerciseRoutes.js` ✅
- `src/routes/quizNewRoutes.js` ✅
- `src/routes/questionRoutes.js` ✅
- `src/routes/activityRoutes.js` ✅
- `src/routes/rewardRoutes.js` ✅

### Controllers
- `src/controllers/authController.js` ✅
- `src/controllers/skillController.js` ✅
- `src/controllers/progressController.js` ✅
- `src/controllers/videoController.js` ✅
- `src/controllers/exerciseController.js` ✅
- `src/controllers/quizNewController.js` ✅
- `src/controllers/questionController.js` ✅
- `src/controllers/userActivityController.js` ✅
- `src/controllers/rewardController.js` ✅

### Models
- `src/models/user.schema.js` ✅
- `src/models/class.schema.js` ✅
- `src/models/skill.schema.js` ✅
- `src/models/progress.schema.js` ✅
- `src/models/video.schema.js` ✅
- `src/models/exercise.schema.js` ✅
- `src/models/quiz.schema.js` ✅
- `src/models/question.schema.js` ✅
- `src/models/userActivity.schema.js` ✅
- `src/models/reward.schema.js` ✅

## 📝 Files khác - GIỮ LẠI (Utility)
- `src/middlewares/authMiddleware.js` ✅ (được cập nhật để hỗ trợ /api-docs)
- `src/errors/` ✅ (Tất cả các file xử lý lỗi giữ lại để dùng)

---

## 🗑️ Cách xóa file

### Option 1: Xóa manual từ VS Code
Chọn file cũ → Right click → Delete

### Option 2: Xóa bằng Terminal
```bash
# Xóa tất cả routes cũ
del src\routes\adminRoutes.js
del src\routes\courseRoutes.js
del src\routes\lessonRoutes.js
del src\routes\notifyRoutes.js
del src\routes\updateViewRoutes.js
del src\routes\userRoutes.js
del src\routes\quizRoutes.js

# Xóa tất cả controllers cũ
del src\controllers\adminController.js
del src\controllers\courseController.js
del src\controllers\lessonController.js
del src\controllers\notifyController.js
del src\controllers\userController.js
del src\controllers\quizController.js

# Xóa tất cả models cũ
del src\models\course.schema.js
del src\models\lecturer.schema.js
del src\models\lesson.schema.js
del src\models\module.schema.js
del src\models\quizAnswer.schema.js
del src\models\quizQuestion.schema.js
del src\models\student.schema.js
del src\models\studentQuizAnswer.schema.js
```

### Option 3: Đổi tên thành `.old` (an toàn hơn)
```bash
ren src\routes\adminRoutes.js adminRoutes.js.old
ren src\routes\courseRoutes.js courseRoutes.js.old
# ...và cứ thế
```

---

**Lưu ý:** Hãy chắc chắn app.js đã cập nhật để sử dụng routes mới trước khi xóa! ✅
