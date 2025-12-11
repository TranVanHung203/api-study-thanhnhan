import cron from 'node-cron';
import User from '../models/user.schema.js';
import UserActivity from '../models/userActivity.schema.js';
import Reward from '../models/reward.schema.js';

/**
 * Cleanup job để xóa dữ liệu orphan khi MongoDB TTL xóa guest users
 * Chạy mỗi giờ
 */
export const startCleanupJob = () => {
  // Chạy mỗi giờ: '0 * * * *'
  cron.schedule('0 * * * *', async () => {
    console.log('[Cleanup Job] Running orphan data cleanup...');
    
    try {
      // Lấy tất cả userId hiện tại
      const existingUsers = await User.find({}, '_id');
      const existingUserIds = existingUsers.map(u => u._id);

      // Xóa UserActivity có userId không tồn tại
      const deletedActivities = await UserActivity.deleteMany({
        userId: { $nin: existingUserIds }
      });

      // Xóa Reward có userId không tồn tại
      const deletedRewards = await Reward.deleteMany({
        userId: { $nin: existingUserIds }
      });

      if (deletedActivities.deletedCount > 0 || deletedRewards.deletedCount > 0) {
        console.log('[Cleanup Job] Deleted orphan data:', {
          userActivities: deletedActivities.deletedCount,
          rewards: deletedRewards.deletedCount
        });
      } else {
        console.log('[Cleanup Job] No orphan data found.');
      }
    } catch (error) {
      console.error('[Cleanup Job] Error:', error);
    }
  });

  console.log('[Cleanup Job] Scheduled to run every hour.');
};

/**
 * Xóa expired guests thủ công (backup nếu TTL index chưa hoạt động)
 * Chạy mỗi ngày lúc 3:00 AM
 */
export const startExpiredGuestCleanup = () => {
  // Chạy lúc 3:00 AM mỗi ngày: '0 3 * * *'
  cron.schedule('0 3 * * *', async () => {
    console.log('[Guest Cleanup] Running expired guest cleanup...');
    
    try {
      const now = new Date();
      
      // Tìm tất cả guest đã hết hạn
      const expiredGuests = await User.find({
        isGuest: true,
        guestExpiresAt: { $lt: now }
      });

      for (const guest of expiredGuests) {
        // Xóa dữ liệu liên quan
        await UserActivity.deleteMany({ userId: guest._id });
        await Reward.deleteMany({ userId: guest._id });
        await User.findByIdAndDelete(guest._id);
        
        console.log(`[Guest Cleanup] Deleted expired guest: ${guest._id}`);
      }

      if (expiredGuests.length > 0) {
        console.log(`[Guest Cleanup] Total deleted: ${expiredGuests.length} guests`);
      } else {
        console.log('[Guest Cleanup] No expired guests found.');
      }
    } catch (error) {
      console.error('[Guest Cleanup] Error:', error);
    }
  });

  console.log('[Guest Cleanup] Scheduled to run daily at 3:00 AM.');
};
