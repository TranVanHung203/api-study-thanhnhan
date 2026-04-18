# ðŸš¨ DEPRECATED FILES - CÃ“ THá»‚ XÃ“A

File nÃ y liá»‡t kÃª táº¥t cáº£ cÃ¡c file cÅ© khÃ´ng cÃ²n dÃ¹ng trong project má»›i. Báº¡n cÃ³ thá»ƒ xÃ³a chÃºng an toÃ n.

## ðŸ“ Routes cÅ© - CÃ“ THá»‚ XÃ“A

```
src/routes/adminRoutes.js           âŒ Thay tháº¿ bá»Ÿi authRoutes.js
src/routes/courseRoutes.js          âŒ Thay tháº¿ bá»Ÿi skillRoutes.js + progressRoutes.js
src/routes/lessonRoutes.js          âŒ KhÃ´ng dÃ¹ng ná»¯a
src/routes/notifyRoutes.js          âŒ KhÃ´ng dÃ¹ng ná»¯a
src/routes/updateViewRoutes.js      âŒ KhÃ´ng dÃ¹ng ná»¯a
src/routes/userRoutes.js            âŒ Thay tháº¿ bá»Ÿi authRoutes.js
src/routes/quizRoutes.js            âŒ Thay tháº¿ bá»Ÿi quizNewRoutes.js
```

## ðŸ“ Controllers cÅ© - CÃ“ THá»‚ XÃ“A

```
src/controllers/adminController.js        âŒ KhÃ´ng dÃ¹ng ná»¯a
src/controllers/courseController.js       âŒ Thay tháº¿ bá»Ÿi skillController.js + progressController.js
src/controllers/lessonController.js       âŒ KhÃ´ng dÃ¹ng ná»¯a
src/controllers/notifyController.js       âŒ KhÃ´ng dÃ¹ng ná»¯a
src/controllers/userController.js         âŒ Thay tháº¿ bá»Ÿi authController.js
src/controllers/quizController.js         âŒ Thay tháº¿ bá»Ÿi quizNewController.js
```

## ðŸ“ Models cÅ© - CÃ“ THá»‚ XÃ“A

```
src/models/course.schema.js              âŒ KhÃ´ng dÃ¹ng ná»¯a
src/models/lecturer.schema.js            âŒ KhÃ´ng dÃ¹ng ná»¯a
src/models/lesson.schema.js              âŒ KhÃ´ng dÃ¹ng ná»¯a
src/models/module.schema.js              âŒ KhÃ´ng dÃ¹ng ná»¯a
src/models/quizAnswer.schema.js          âŒ KhÃ´ng dÃ¹ng ná»¯a
src/models/quizQuestion.schema.js        âŒ KhÃ´ng dÃ¹ng ná»¯a
src/models/student.schema.js             âŒ KhÃ´ng dÃ¹ng ná»¯a
src/models/studentQuizAnswer.schema.js   âŒ KhÃ´ng dÃ¹ng ná»¯a
```

## âœ… Files Cáº¤N GIá»® Láº I

### Routes
- `src/routes/authRoutes.js` âœ…
- `src/routes/skillRoutes.js` âœ…
- `src/routes/progressRoutes.js` âœ…
- `src/routes/videoRoutes.js` âœ…
- `src/routes/quizNewRoutes.js` âœ…
- `src/routes/questionRoutes.js` âœ…
- `src/routes/activityRoutes.js` âœ…
- `src/routes/rewardRoutes.js` âœ…

### Controllers
- `src/controllers/authController.js` âœ…
- `src/controllers/skillController.js` âœ…
- `src/controllers/progressController.js` âœ…
- `src/controllers/videoController.js` âœ…
- `src/controllers/quizNewController.js` âœ…
- `src/controllers/questionController.js` âœ…
- `src/controllers/userActivityController.js` âœ…
- `src/controllers/rewardController.js` âœ…

### Models
- `src/models/user.schema.js` âœ…
- `src/models/class.schema.js` âœ…
- `src/models/skill.schema.js` âœ…
- `src/models/progress.schema.js` âœ…
- `src/models/video.schema.js` âœ…
- `src/models/quiz.schema.js` âœ…
- `src/models/question.schema.js` âœ…
- `src/models/userActivity.schema.js` âœ…
- `src/models/reward.schema.js` âœ…

## ðŸ“ Files khÃ¡c - GIá»® Láº I (Utility)
- `src/middlewares/authMiddleware.js` âœ… (Ä‘Æ°á»£c cáº­p nháº­t Ä‘á»ƒ há»— trá»£ /api-docs)
- `src/errors/` âœ… (Táº¥t cáº£ cÃ¡c file xá»­ lÃ½ lá»—i giá»¯ láº¡i Ä‘á»ƒ dÃ¹ng)

---

## ðŸ—‘ï¸ CÃ¡ch xÃ³a file

### Option 1: XÃ³a manual tá»« VS Code
Chá»n file cÅ© â†’ Right click â†’ Delete

### Option 2: XÃ³a báº±ng Terminal
```bash
# XÃ³a táº¥t cáº£ routes cÅ©
del src\routes\adminRoutes.js
del src\routes\courseRoutes.js
del src\routes\lessonRoutes.js
del src\routes\notifyRoutes.js
del src\routes\updateViewRoutes.js
del src\routes\userRoutes.js
del src\routes\quizRoutes.js

# XÃ³a táº¥t cáº£ controllers cÅ©
del src\controllers\adminController.js
del src\controllers\courseController.js
del src\controllers\lessonController.js
del src\controllers\notifyController.js
del src\controllers\userController.js
del src\controllers\quizController.js

# XÃ³a táº¥t cáº£ models cÅ©
del src\models\course.schema.js
del src\models\lecturer.schema.js
del src\models\lesson.schema.js
del src\models\module.schema.js
del src\models\quizAnswer.schema.js
del src\models\quizQuestion.schema.js
del src\models\student.schema.js
del src\models\studentQuizAnswer.schema.js
```

### Option 3: Äá»•i tÃªn thÃ nh `.old` (an toÃ n hÆ¡n)
```bash
ren src\routes\adminRoutes.js adminRoutes.js.old
ren src\routes\courseRoutes.js courseRoutes.js.old
# ...vÃ  cá»© tháº¿
```

---

**LÆ°u Ã½:** HÃ£y cháº¯c cháº¯n app.js Ä‘Ã£ cáº­p nháº­t Ä‘á»ƒ sá»­ dá»¥ng routes má»›i trÆ°á»›c khi xÃ³a! âœ…
