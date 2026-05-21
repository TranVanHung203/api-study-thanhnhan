import express from 'express';
import { authToken } from '../middlewares/authMiddleware.js';
import { getUsageSummaryController } from '../controllers/usageController.js';

const router = express.Router();

router.all('*', authToken);

/**
 * @swagger
 * /usage/summary:
 *   get:
 *     summary: Lay tong thoi gian su dung app (mac dinh cua user hien tai, admin co the truyen userId)
 *     tags: [Usage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 31
 *           default: 7
 *         description: So ngay gan nhat can tra ve (bao gom hom nay). Nếu truyền `startDate`/`endDate` thì `days` sẽ bị bỏ qua.
 *       - in: query
 *         name: startDate
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu của khoảng (định dạng YYYY-MM-DD). Nếu chỉ truyền `startDate` thì lấy 1 ngày.
 *       - in: query
 *         name: endDate
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc của khoảng (định dạng YYYY-MM-DD). Nếu chỉ truyền `endDate` thì lấy 1 ngày.
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: User ID can xem usage (admin/teacher duoc xem user khac)
 *     responses:
 *       200:
 *         description: Tong hop usage time
 *       401:
 *         description: Chua xac thuc
 *       403:
 *         description: Khong du quyen xem usage cua user khac (chi admin/teacher)
 */
router.get('/summary', getUsageSummaryController);

export default router;
