import express from 'express';
import {
  checkInStreakController,
  getMyStreakController,
  getStreakSummaryController,
  getWeeklyStreakController,
  getYearStreakController,
  getMonthStreakController,
  updateStreakTimezoneController,
  saveRecent30DaysCheckinsController
} from '../controllers/streakController.js';
import { authToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Streaks
 *   description: API check-in and streak
 */

/**
 * @swagger
 * /streaks/me:
 *   get:
 *     tags: [Streaks]
 *     summary: Get current streak state
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Streak information
 */
router.get('/me', authToken, getMyStreakController);

/**
 * @swagger
 * /streaks/check-in:
 *   post:
 *     tags: [Streaks]
 *     summary: Check in for today (increase streak)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               timezone:
 *                 type: string
 *                 example: Asia/Ho_Chi_Minh
 *     responses:
 *       200:
 *         description: Check-in result
 */
router.post('/check-in', authToken, checkInStreakController);

/**
 * @swagger
 * /streaks/summary:
 *   get:
 *     tags: [Streaks]
 *     summary: Get streak summary data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timezone
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional timezone override (IANA)
 *     responses:
 *       200:
 *         description: Summary information
 */
router.get('/summary', authToken, getStreakSummaryController);

/**
 * @swagger
 * /streaks/week:
 *   get:
 *     tags: [Streaks]
 *     summary: Get weekly check-in data ordered Monday to Sunday
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: weekStart
 *         required: false
 *         schema:
 *           type: string
 *         description: Any date in target week (YYYY-MM-DD). Response is normalized to Monday.
 *       - in: query
 *         name: timezone
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional timezone override (IANA)
 *     responses:
 *       200:
 *         description: Weekly streak data
 */
router.get('/week', authToken, getWeeklyStreakController);

/**
 * @swagger
 * /streaks/year/{year}:
 *   get:
 *     tags: [Streaks]
 *     summary: Get full year streak data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Year (e.g., 2026)
 *       - in: query
 *         name: timezone
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional timezone override (IANA)
 *     responses:
 *       200:
 *         description: Yearly streak calendar data
 */
router.get('/year/:year', authToken, getYearStreakController);

/**
 * @swagger
 * /streaks/year/{year}/month/{month}:
 *   get:
 *     tags: [Streaks]
 *     summary: Get month streak data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Year (e.g., 2026)
 *       - in: path
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *         description: Month number (1-12)
 *       - in: query
 *         name: timezone
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional timezone override (IANA)
 *     responses:
 *       200:
 *         description: Monthly streak calendar data
 */
router.get('/year/:year/month/:month', authToken, getMonthStreakController);

/**
 * @swagger
 * /streaks/timezone:
 *   patch:
 *     tags: [Streaks]
 *     summary: Update streak timezone
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - timezone
 *             properties:
 *               timezone:
 *                 type: string
 *                 example: Asia/Ho_Chi_Minh
 *     responses:
 *       200:
 *         description: Timezone updated
 *       400:
 *         description: Invalid timezone
 */
router.patch('/timezone', authToken, updateStreakTimezoneController);

/**
 * @swagger
 * /streaks/history:
 *   post:
 *     tags: [Streaks]
 *     summary: Save checked-in dates and build full day timeline
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - checkedInDates
 *             properties:
 *               timezone:
 *                 type: string
 *                 example: Asia/Ho_Chi_Minh
 *               checkedInDates:
 *                 type: array
 *                 description: Checked-in dates in YYYY-MM-DD
 *                 items:
 *                   type: string
 *                   example: 2026-05-11
 *     responses:
 *       200:
 *         description: History saved
 *       400:
 *         description: Invalid input
 */
router.post('/history', authToken, saveRecent30DaysCheckinsController);

// Backward compatibility
router.post('/recent-30-days', authToken, saveRecent30DaysCheckinsController);

export default router;
