import { getUsageSummaryForUser } from '../services/usageTrackingService.js';
import UnauthorizedError from '../errors/unauthorizedError.js';
import ForbiddenError from '../errors/forbiddenError.js';
import BadRequestError from '../errors/badRequestError.js';
import mongoose from 'mongoose';
import User from '../models/user.schema.js';

export const getUsageSummaryController = async (req, res, next) => {
  try {
    const requesterUserId = req.user?.id;
    if (!requesterUserId) {
      throw new UnauthorizedError('Unauthorized');
    }

    const requestedUserId = String(req.query.userId || '').trim();
    let targetUserId = requesterUserId;

    if (requestedUserId) {
      if (!mongoose.Types.ObjectId.isValid(requestedUserId)) {
        throw new BadRequestError('userId khong hop le');
      }

      if (String(requestedUserId) !== String(requesterUserId)) {
        const requester = await User.findOne({
          _id: requesterUserId,
          isStatus: { $ne: 'deleted' }
        }).select('roles').lean();

        const roles = Array.isArray(requester?.roles) ? requester.roles : [];
        const canViewOtherUsers = roles.includes('admin') || roles.includes('teacher');
        if (!canViewOtherUsers) {
          throw new ForbiddenError('Ban khong co quyen xem usage cua user khac');
        }
      }

      targetUserId = requestedUserId;
    }

    const daysRaw = req.query.days;
    const startDateRaw = req.query.startDate;
    const endDateRaw = req.query.endDate;

    if ((startDateRaw || endDateRaw) && daysRaw) {
      throw new BadRequestError('Truyen days hoac startDate/endDate, khong duoc truyen ca hai');
    }

    if (startDateRaw || endDateRaw) {
      const start = startDateRaw ? new Date(startDateRaw) : null;
      const end = endDateRaw ? new Date(endDateRaw) : null;

      if (startDateRaw && (!start || Number.isNaN(start.getTime()))) {
        throw new BadRequestError('startDate khong hop le (YYYY-MM-DD)');
      }
      if (endDateRaw && (!end || Number.isNaN(end.getTime()))) {
        throw new BadRequestError('endDate khong hop le (YYYY-MM-DD)');
      }

      const s = start || end;
      const e = end || start;
      if (s > e) {
        throw new BadRequestError('startDate phai nho hon hoac bang endDate');
      }

      const startISO = new Date(s.getFullYear(), s.getMonth(), s.getDate()).toISOString().slice(0, 10);
      const endISO = new Date(e.getFullYear(), e.getMonth(), e.getDate()).toISOString().slice(0, 10);

      const summary = await getUsageSummaryForUser(targetUserId, { startDate: startISO, endDate: endISO });

      return res.status(200).json({
        ...summary,
        startDate: startISO,
        endDate: endISO
      });
    }

    const days = Math.max(1, Math.min(31, Number.parseInt(daysRaw, 10) || 7));
    const summary = await getUsageSummaryForUser(targetUserId, { days });

    return res.status(200).json({
      ...summary,
      days
    });
  } catch (error) {
    next(error);
  }
};
