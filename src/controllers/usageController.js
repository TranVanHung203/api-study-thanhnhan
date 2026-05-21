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

    const days = Math.max(1, Math.min(31, Number.parseInt(req.query.days, 10) || 7));
    const summary = await getUsageSummaryForUser(targetUserId, { days });

    return res.status(200).json({
      ...summary,
      days
    });
  } catch (error) {
    next(error);
  }
};
