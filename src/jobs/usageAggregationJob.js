import cron from 'node-cron';
import { closeTimedOutUsageSessions, flushUsageToDatabase } from '../services/usageTrackingService.js';

const USAGE_AGGREGATION_CRON = process.env.USAGE_AGGREGATION_CRON || '*/1 * * * *';
const USAGE_AGGREGATION_TIMEZONE = process.env.USAGE_AGGREGATION_TIMEZONE || 'UTC';

let usageAggregationJobStarted = false;

export const startUsageAggregationJob = () => {
  if (usageAggregationJobStarted) {
    return;
  }

  cron.schedule(
    USAGE_AGGREGATION_CRON,
    async () => {
      try {
        const timeoutResult = await closeTimedOutUsageSessions();
        const flushResult = await flushUsageToDatabase();

        if ((timeoutResult?.closedUsers || 0) > 0 || (flushResult?.processedUsers || 0) > 0) {
          console.log('[Usage Job] Tick result:', {
            closedUsers: timeoutResult?.closedUsers || 0,
            processedUsers: flushResult?.processedUsers || 0,
            flushedSeconds: flushResult?.flushedSeconds || 0,
            source: flushResult?.source || timeoutResult?.source || 'unknown'
          });
        }
      } catch (error) {
        console.error('[Usage Job] Failed to process usage aggregation:', error);
      }
    },
    {
      timezone: USAGE_AGGREGATION_TIMEZONE
    }
  );

  usageAggregationJobStarted = true;
  console.log(
    `[Usage Job] Scheduled usage aggregation with cron "${USAGE_AGGREGATION_CRON}" (timezone: ${USAGE_AGGREGATION_TIMEZONE}).`
  );
};

