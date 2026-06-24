const cron = require('node-cron');

let syncJob = null;

function startAutoSync(syncFunction) {
  const intervalMinutes = parseInt(process.env.SYNC_INTERVAL) || 5;
  
  // Validate interval
  if (intervalMinutes < 1 || intervalMinutes > 1440) {
    console.warn('Invalid sync interval, using default: 5 minutes');
    intervalMinutes = 5;
  }

  // Stop existing job if any
  if (syncJob) {
    syncJob.stop();
  }

  // Create cron expression for every N minutes
  const cronExpression = `*/${intervalMinutes} * * * *`;

  syncJob = cron.schedule(cronExpression, async () => {
    console.log(`Auto-sync triggered (every ${intervalMinutes} minutes)`);
    try {
      await syncFunction();
    } catch (error) {
      console.error('Auto-sync failed:', error);
    }
  });

  console.log(`Auto-sync started: every ${intervalMinutes} minutes`);
}

function stopAutoSync() {
  if (syncJob) {
    syncJob.stop();
    console.log('Auto-sync stopped');
  }
}

module.exports = {
  startAutoSync,
  stopAutoSync
};
