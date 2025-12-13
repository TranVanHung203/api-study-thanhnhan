import UserActivity from '../models/userActivity.schema.js';
import Reward from '../models/reward.schema.js';
import Progress from '../models/progress.schema.js';
import Skill from '../models/skill.schema.js';
import Exercise from '../models/exercise.schema.js';
import Video from '../models/video.schema.js';
import Quiz from '../models/quiz.schema.js';
import Question from '../models/question.schema.js';

/**
 * Validate đáp án exercise dựa theo exerciseType
 * 
 * @param {string} exerciseType - Loại bài tập
 * @param {number} correctAnswer - Đáp án đúng từ database
 * @param {array} userAnswer - Mảng items user gửi lên
 * @returns {object} { isCorrect: boolean, message: string }
 * 
 * Hiện tại hỗ trợ:
 * - drag_count: Đếm số item trong mảng, so sánh với answer
 * 
 * [TODO] Thêm các loại khác khi cần:
 * - drag_sort: Phân loại đúng vị trí
 * - matching: Nối đúng cặp
 * - fill_number: Điền đúng số
 * - ordering: Sắp đúng thứ tự
 * - multiple_choice: Chọn đúng đáp án
 */
export const validateExerciseAnswer = (exerciseType, correctAnswer, userAnswer) => {
  // ✅ Chặn tuyệt đối nếu thiếu dữ liệu
  if (!exerciseType) {
    return { isCorrect: false, message: 'Thiếu loại bài tập' };
  }

  if (correctAnswer === undefined || correctAnswer === null) {
    return { isCorrect: false, message: 'Bài tập chưa có đáp án trong hệ thống' };
  }

  switch (exerciseType) {

    // ================= DRAG COUNT =================
    case 'drag_count': {
      if (!Array.isArray(userAnswer)) {
        return { isCorrect: false, message: 'Dữ liệu không hợp lệ' };
      }

      const userCount = userAnswer.length;
      const isCorrect = userCount === correctAnswer;

      return {
        isCorrect,
        message: isCorrect
          ? `✅ Chính xác!`
          : `❌ Chưa đúng!`
      };
    }

    // ================= FILL NUMBER =================
    // case 'fill_number': {
    //   const isCorrect = Number(userAnswer) === Number(correctAnswer);
    //   return {
    //     isCorrect,
    //     message: isCorrect ? '✅ Điền đúng!' : '❌ Điền sai!'
    //   };
    // }

    // ================= MULTIPLE CHOICE =================
    // case 'multiple_choice': {
    //   const isCorrect = userAnswer === correctAnswer;
    //   return {
    //     isCorrect,
    //     message: isCorrect ? '✅ Chọn đúng!' : '❌ Chọn sai!'
    //   };
    // }

    // ================= MATCHING =================
    // case 'matching': {
    //   if (!Array.isArray(userAnswer) || !Array.isArray(correctAnswer)) {
    //     return { isCorrect: false, message: 'Dữ liệu nối cặp không hợp lệ' };
    //   }
    //
    //   const isCorrect =
    //     JSON.stringify(userAnswer.sort()) === JSON.stringify(correctAnswer.sort());
    //
    //   return {
    //     isCorrect,
    //     message: isCorrect ? '✅ Nối đúng tất cả!' : '❌ Nối sai!'
    //   };
    // }

    // ================= ORDERING =================
    // case 'ordering': {
    //   if (!Array.isArray(userAnswer)) {
    //     return { isCorrect: false, message: 'Dữ liệu sắp xếp không hợp lệ' };
    //   }
    //
    //   const isCorrect =
    //     JSON.stringify(userAnswer) === JSON.stringify(correctAnswer);
    //
    //   return {
    //     isCorrect,
    //     message: isCorrect ? '✅ Sắp xếp đúng!' : '❌ Sắp xếp sai!'
    //   };
    // }

    default:
      return { isCorrect: false, message: 'Loại bài tập chưa được hỗ trợ' };
  }
};


// Ghi nhận hoạt động của user (video, exercise, quiz)
// Body cho VIDEO: { progressId, isCompleted: true }
// Body cho EXERCISE: { progressId, exerciseType, userAnswer: ["item1", "item2", ...] }
// Body cho QUIZ: { progressId, score, isCompleted }
export const recordUserActivityController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { progressId, score, isCompleted, exerciseType, userAnswer } = req.body;

    // Tìm progress hiện tại
    const currentProgress = await Progress.findById(progressId);

    if (!currentProgress) {
      return res.status(404).json({ message: 'Progress không tìm thấy' });
    }

    // Tự động lấy contentType từ progress
    const contentType = currentProgress.contentType;

    // Kiểm tra đã hoàn thành step này chưa
    const existingActivity = await UserActivity.findOne({
      userId,
      progressId,
      isCompleted: true
    });

    if (existingActivity) {
      // Return same shape as success but mark isCheck = true
      const bonusEarnedExisting = existingActivity.bonusEarned || 0;
      const nextStepExisting = currentProgress.stepNumber + 1;
      if (existingActivity.contentType === 'exercise') {
        return res.status(201).json({
          isCorrect: true,
          message: 'Ghi nhận hoạt động thành công',
          bonusEarned: bonusEarnedExisting,
          nextStep: nextStepExisting,
          isCheck: true
        });
      }

      return res.status(201).json({
        message: 'Ghi nhận hoạt động thành công',
        userActivity: existingActivity,
        bonusEarned: bonusEarnedExisting,
        nextStep: nextStepExisting,
        isCheck: true
      });
    }

    // Lấy skill hiện tại
    const currentSkill = await Skill.findById(currentProgress.skillId);
    if (!currentSkill) {
      return res.status(404).json({ message: 'Skill không tìm thấy' });
    }

    // ========== KIỂM TRA SKILL TRƯỚC ĐÃ HOÀN THÀNH CHƯA ==========
    if (currentSkill.order > 1) {
      // Nếu user đã bắt đầu (hoàn thành ít nhất 1 step) trong skill hiện tại,
      // thì cho phép tiếp tục trong skill này mà không cần kiểm tra skill trước.
      const currentSkillProgresses = await Progress.find({ skillId: currentSkill._id });
      const currentSkillProgressIds = currentSkillProgresses.map(p => p._id);
      const hasStartedCurrentSkill = await UserActivity.exists({
        userId,
        progressId: { $in: currentSkillProgressIds },
        isCompleted: true
      });

      if (!hasStartedCurrentSkill) {
        // Tìm skill trước đó (order nhỏ hơn 1)
        const previousSkill = await Skill.findOne({
          chapterId: currentSkill.chapterId,
          order: currentSkill.order - 1
        });

        if (previousSkill) {
          // Lấy tất cả progress của skill trước
          const previousSkillProgresses = await Progress.find({ skillId: previousSkill._id });
          const previousProgressIds = previousSkillProgresses.map(p => p._id);

          // Kiểm tra user đã hoàn thành tất cả progress của skill trước chưa
          const completedPreviousActivities = await UserActivity.find({
            userId,
            progressId: { $in: previousProgressIds },
            isCompleted: true
          });

          // So sánh số lượng
          if (completedPreviousActivities.length < previousSkillProgresses.length) {
            return res.status(400).json({
              message: `Bạn cần hoàn thành skill "${previousSkill.skillName}" trước khi học skill này`,
              requiredSkillId: previousSkill._id,
              requiredSkillName: previousSkill.skillName,
              completedSteps: completedPreviousActivities.length,
              totalSteps: previousSkillProgresses.length
            });
          }
        }
      }
    }

    // ========== KIỂM TRA CÁC STEP TRƯỚC TRONG CÙNG SKILL ==========
    const currentStepNumber = currentProgress.stepNumber;
    
    if (currentStepNumber > 1) {
      // Lấy tất cả các step trước của cùng skill
      const previousSteps = await Progress.find({
        skillId: currentProgress.skillId,
        stepNumber: { $lt: currentStepNumber }
      });

      const previousStepIds = previousSteps.map(p => p._id);

      // Kiểm tra user đã hoàn thành tất cả step trước chưa
      const completedPreviousSteps = await UserActivity.find({
        userId,
        progressId: { $in: previousStepIds },
        isCompleted: true
      });

      // Lấy tất cả progress của skill để tính max step đã hoàn thành trong skill này
      const allSkillProgresses = await Progress.find({ skillId: currentProgress.skillId });
      const allSkillProgressIds = allSkillProgresses.map(p => p._id);
      const userCompletedInSkill = await UserActivity.find({
        userId,
        progressId: { $in: allSkillProgressIds },
        isCompleted: true
      });

      // Tạo set các stepNumber đã hoàn thành (bao gồm những bước trước nếu user đã hoàn thành bước sau)
      const completedStepNumbers = new Set();
      let maxCompletedInSkill = 0;
      for (const activity of userCompletedInSkill) {
        const step = allSkillProgresses.find(p => p._id.toString() === activity.progressId.toString());
        if (step) {
          completedStepNumbers.add(step.stepNumber);
          if (step.stepNumber > maxCompletedInSkill) maxCompletedInSkill = step.stepNumber;
        }
      }

      // Nếu user đã hoàn thành một step lớn hơn i, thì các step < = maxCompletedInSkill coi như hoàn thành
      for (let s = 1; s <= maxCompletedInSkill; s++) completedStepNumbers.add(s);

      // Tìm step chưa hoàn thành trong 1..currentStepNumber-1
      for (let i = 1; i < currentStepNumber; i++) {
        if (!completedStepNumbers.has(i)) {
          return res.status(400).json({
            message: `Bạn cần hoàn thành step ${i} trước khi làm step ${currentStepNumber}`,
            requiredStep: i,
            currentStep: currentStepNumber
          });
        }
      }
    }

    // ========== XỬ LÝ THEO LOẠI CONTENT ==========
    let finalIsCompleted = false;
    let validationResult = null;

    if (contentType === 'exercise') {
      // Expect body.answers to be an array of user answers for each exercise
      // e.g. answers = [{ exerciseId: ..., userAnswer: [...] }, ...]
      const { answers } = req.body;

      if (!Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({ message: 'Vui lòng gửi mảng answers chứa đáp án cho các exercise' });
      }

      // Lấy tất cả các exercise liên quan tới progressId
      const exercises = await Exercise.find({ progressId: currentProgress._id }).select('+answer');

      if (!exercises || exercises.length === 0) {
        return res.status(404).json({ message: 'Không tìm thấy exercise cho progress này' });
      }

      // Map exercises by id for quick lookup
      const exerciseMap = new Map(exercises.map(e => [e._id.toString(), e]));

      // Validate each provided answer; require that every exercise for this progress
      // has a corresponding entry in answers. If there are more exercises than answers,
      // or any validation fails, return with failure and do NOT save activity.
      if (answers.length !== exercises.length) {
        return res.status(400).json({ message: `Số lượng answers (${answers.length}) không khớp với số exercise (${exercises.length})` });
      }

      // Validate all
      const exerciseResults = [];
      let allCorrect = true;
      for (const ans of answers) {
        if (!ans || !ans.exerciseId) {
          return res.status(400).json({ message: 'Mỗi item trong answers cần có exerciseId và userAnswer' });
        }

        const ex = exerciseMap.get(ans.exerciseId.toString());
        if (!ex) {
          return res.status(404).json({ message: `Exercise không tồn tại: ${ans.exerciseId}` });
        }

        const result = validateExerciseAnswer(ex.exerciseType, ex.answer, ans.userAnswer);
        exerciseResults.push({ exerciseId: ans.exerciseId, ...result });
        if (!result.isCorrect) allCorrect = false;
      }

      // Nếu có exercise sai → trả về kết quả chi tiết (KHÔNG lưu activity)
      if (!allCorrect) {
        return res.status(200).json({
          isCorrect: false,
          message: 'Có đáp án chưa đúng',
          details: exerciseResults,
          isCheck: false
        });
      }

      // Nếu tất cả đúng
      finalIsCompleted = true;
      validationResult = { isCorrect: true, message: 'Tất cả đáp án đúng' };
    } else if (contentType === 'quiz') {
      // Expect body.answers for quizzes. Two supported shapes:
      // - Single quiz for the progress: answers = [{ questionId, userAnswer }, ...]
      // - Multiple quizzes: answers = [{ quizId, answers: [{ questionId, userAnswer }, ...] }, ...]
      const { answers } = req.body;

      if (!answers || (Array.isArray(answers) && answers.length === 0)) {
        return res.status(400).json({ message: 'Vui lòng gửi answers cho quiz' });
      }

      // Load all quizzes for this progress
      const quizzes = await Quiz.find({ progressId: currentProgress._id });
      if (!quizzes || quizzes.length === 0) {
        return res.status(404).json({ message: 'Không tìm thấy quiz cho progress này' });
      }

      // Helper to compare answers (support arrays)
      const isAnswerCorrect = (userAns, correctAns) => {
        if (Array.isArray(correctAns) && Array.isArray(userAns)) {
          try {
            const a = [...userAns].map(String).sort();
            const b = [...correctAns].map(String).sort();
            return JSON.stringify(a) === JSON.stringify(b);
          } catch (e) {
            return false;
          }
        }
        return String(userAns) === String(correctAns);
      };

      const quizResults = [];
      let allQuizzesCorrect = true;

      // If single quiz, allow answers to be the flat array
      if (quizzes.length === 1) {
        const quiz = quizzes[0];
        const questions = await Question.find({ quizId: quiz._id });
        if (!Array.isArray(answers)) {
          return res.status(400).json({ message: 'answers phải là mảng các câu trả lời' });
        }

        if (answers.length !== questions.length) {
          return res.status(400).json({ message: `Số lượng answers (${answers.length}) không khớp với số câu hỏi (${questions.length})` });
        }

        const questionMap = new Map(questions.map(q => [q._id.toString(), q]));
        const details = [];
        let correctCount = 0;

        for (const a of answers) {
          if (!a || !a.questionId) {
            return res.status(400).json({ message: 'Mỗi item trong answers cần có questionId và userAnswer' });
          }
          const q = questionMap.get(a.questionId.toString());
          if (!q) return res.status(404).json({ message: `Question không tồn tại: ${a.questionId}` });
          const ok = isAnswerCorrect(a.userAnswer, q.correctAnswer);
          details.push({ questionId: a.questionId, isCorrect: ok });
          if (!ok) allQuizzesCorrect = false; else correctCount++;
        }

        const scorePercent = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
        quizResults.push({ quizId: quiz._id, correctCount, totalQuestions: questions.length, scorePercent, details });
      } else {
        // Multiple quizzes: require array of { quizId, answers: [...] }
        if (!Array.isArray(answers)) {
          return res.status(400).json({ message: 'Với nhiều quiz, answers phải là mảng các object { quizId, answers }' });
        }

        const quizMap = new Map(quizzes.map(q => [q._id.toString(), q]));

        for (const qa of answers) {
          if (!qa || !qa.quizId || !Array.isArray(qa.answers)) {
            return res.status(400).json({ message: 'Mỗi item phải có quizId và mảng answers' });
          }
          const quiz = quizMap.get(qa.quizId.toString());
          if (!quiz) return res.status(404).json({ message: `Quiz không tồn tại: ${qa.quizId}` });
          const questions = await Question.find({ quizId: quiz._id });
          if (qa.answers.length !== questions.length) {
            return res.status(400).json({ message: `Số lượng answers cho quiz ${qa.quizId} không khớp (${qa.answers.length} vs ${questions.length})` });
          }
          const questionMap = new Map(questions.map(q => [q._id.toString(), q]));
          const details = [];
          let correctCount = 0;
          for (const a of qa.answers) {
            if (!a || !a.questionId) {
              return res.status(400).json({ message: 'Mỗi item trong answers cần có questionId và userAnswer' });
            }
            const q = questionMap.get(a.questionId.toString());
            if (!q) return res.status(404).json({ message: `Question không tồn tại: ${a.questionId}` });
            const ok = isAnswerCorrect(a.userAnswer, q.correctAnswer);
            details.push({ questionId: a.questionId, isCorrect: ok });
            if (!ok) allQuizzesCorrect = false; else correctCount++;
          }
          const scorePercent = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
          quizResults.push({ quizId: quiz._id, correctCount, totalQuestions: questions.length, scorePercent, details });
        }
      }

      // If any incorrect, return detailed result and do NOT save activity
      if (!allQuizzesCorrect) {
        return res.status(200).json({ isCorrect: false, message: 'Có đáp án quiz chưa đúng', quizzes: quizResults, isCheck: false });
      }

      // All correct
      finalIsCompleted = true;
      validationResult = { isCorrect: true, message: 'Tất cả đáp án quiz đúng' };

    } else {
      // VIDEO or other types: use provided isCompleted flag
      finalIsCompleted = isCompleted === true;
    }

    // Tính điểm thưởng (chỉ khi hoàn thành)
    let bonusEarned = 0;
    if (finalIsCompleted) {
      // Fetch related content to read bonusPoints if exists
      try {
        if (contentType === 'video') {
          const video = await Video.findOne({ progressId: currentProgress._id });
          if (video && video.bonusPoints) bonusEarned = video.bonusPoints;
        } else if (contentType === 'exercise') {
          // For exercises we may have multiple exercises for a single progress
          const exercisesForProgress = await Exercise.find({ progressId: currentProgress._id });
          for (const ex of exercisesForProgress) {
            if (ex && ex.bonusPoints) bonusEarned += ex.bonusPoints;
          }
        } else if (contentType === 'quiz') {
          const quiz = await Quiz.findOne({ progressId: currentProgress._id });
          if (quiz && quiz.bonusPoints) bonusEarned = quiz.bonusPoints;
        }
      } catch (err) {
        // ignore missing content for bonus calculation
      }
    }

    const userActivity = new UserActivity({
      userId,
      progressId,
      contentType,
      score: score || (finalIsCompleted ? 100 : 0),
      isCompleted: finalIsCompleted,
      bonusEarned
    });

    await userActivity.save();

    // Cập nhật reward nếu có điểm thưởng
    if (bonusEarned > 0) {
      await Reward.findOneAndUpdate(
        { userId },
        { $inc: { totalPoints: bonusEarned } },
        { new: true, upsert: true }
      );
    }

    // Response cho EXERCISE (khi đúng)
    if (contentType === 'exercise' && validationResult) {
      return res.status(201).json({
        isCorrect: true,
        message: validationResult.message,
        bonusEarned,
        nextStep: currentStepNumber + 1,
        isCheck: false
      });
    }

    // Response cho VIDEO / QUIZ
    return res.status(201).json({
      message: 'Ghi nhận hoạt động thành công',
      userActivity,
      bonusEarned,
      nextStep: currentStepNumber + 1,
      isCheck: false
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy lịch sử hoạt động của user
export const getUserActivityHistoryController = async (req, res) => {
  try {
    const userId = req.user.id;

    const activities = await UserActivity.find({ userId })
      .populate({
        path: 'progressId',
        populate: { path: 'skillId' }
      })
      .sort({ completedAt: -1 });

    return res.status(200).json({ activities });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy tiến độ hoàn thành của một kỹ năng
export const getSkillProgressController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { skillId } = req.params;

    // Lấy tất cả progress steps của skill
    const progresses = await Progress.find({ skillId })
      .sort({ stepNumber: 1 });

    // Lấy activities của user cho skill này
    const progressIds = progresses.map(p => p._id);
    const userActivities = await UserActivity.find({
      userId,
      progressId: { $in: progressIds }
    });

    // Tính toán tiến độ
    const totalSteps = progresses.length;
    const completedSteps = userActivities.filter(a => a.isCompleted).length;
    const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    return res.status(200).json({
      skillId,
      totalSteps,
      completedSteps,
      progressPercentage,
      steps: progresses.map(p => ({
        stepId: p._id,
        stepNumber: p.stepNumber,
        contentType: p.contentType,
        isCompleted: userActivities.some(a => a.progressId.toString() === p._id.toString() && a.isCompleted)
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy tiến độ hoàn thành của cả lớp
export const getClassProgressController = async (req, res) => {
  try {
    const { classId } = req.params;

    // Lấy tất cả skills của class
    const skills = await Skill.find({ classId });

    const skillProgress = [];

    for (const skill of skills) {
      const progresses = await Progress.find({ skillId: skill._id });
      const progressIds = progresses.map(p => p._id);
      const userActivities = await UserActivity.find({
        progressId: { $in: progressIds }
      });

      const totalSteps = progresses.length;
      const completedSteps = userActivities.filter(a => a.isCompleted).length;
      const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

      skillProgress.push({
        skillId: skill._id,
        skillName: skill.skillName,
        totalSteps,
        completedSteps,
        progressPercentage
      });
    }

    return res.status(200).json({
      classId,
      skillProgress
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
