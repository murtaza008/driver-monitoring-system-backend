const cron = require('node-cron');
const { Op } = require('sequelize');
const Driver = require('../models/Driver');
const Violation = require('../models/Violation');
const { ensureDailyReset, dateStrOf } = require('../utils/dailyScore');
const { normalizeViolationLabel } = require('../utils/violationTypes');
const notificationService = require('./notificationService');

/**
 * Runs once a day right after midnight: archives each driver's just-finished
 * day (same rollover ensureDailyReset does lazily on request, but forced here
 * so it happens promptly rather than waiting on the driver's next API touch)
 * and pushes them a summary of yesterday's violations + final safety score.
 */
async function sendDailySummaries() {
  const drivers = await Driver.findAll();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = dateStrOf(yesterday);
  // UTC boundaries ('Z') — must match dateStrOf()/todayStr(), which are both
  // toISOString()-based. Local-time boundaries here would disagree with those on
  // a non-UTC server, the same class of bug already fixed in stats.js/dailyScore.js.
  const dayStart = new Date(`${yesterdayStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${yesterdayStr}T23:59:59.999Z`);

  for (const driver of drivers) {
    try {
      await ensureDailyReset(driver);

      const violations = await Violation.findAll({
        where: { driverId: driver.id, status: 'Valid', timestamp: { [Op.between]: [dayStart, dayEnd] } }
      });
      const totalPenalty = violations.reduce((sum, v) => sum + (v.penaltyApplied || 0), 0);
      const score = Math.max(0, 100 - totalPenalty);

      const typeCounts = {};
      violations.forEach(v => {
        const label = normalizeViolationLabel(v.type);
        typeCounts[label] = (typeCounts[label] || 0) + 1;
      });
      const breakdown = Object.entries(typeCounts).map(([name, count]) => `${name}: ${count}`).join(', ') || 'No violations';

      const text = `Daily Summary (${yesterdayStr}): ${violations.length} violation(s) — ${breakdown}. Safety Score: ${score}%.`;

      await notificationService.sendDriverMessage({
        driverId: driver.id,
        senderId: 'system',
        text,
        pushTitle: 'Daily Summary',
      });
    } catch (err) {
      console.error(`Daily summary failed for driver ${driver.id}:`, err.message);
    }
  }
}

function startDailySummaryJob() {
  // Server's local midnight — matches the same day boundary ensureDailyReset uses.
  cron.schedule('0 0 * * *', () => {
    sendDailySummaries().catch(err => console.error('Daily summary job failed:', err.message));
  });
  console.log('Daily summary job scheduled for 00:00 daily');
}

module.exports = { startDailySummaryJob, sendDailySummaries };
