const { Op } = require('sequelize');
const ScoreHistory = require('../models/ScoreHistory');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dateStrOf(value) {
  return new Date(value).toISOString().slice(0, 10);
}

async function archiveScoreForDate(driver, dateStr) {
  const finalScore = Math.max(0, 100 - (driver.riskScore || 0));
  const existing = await ScoreHistory.findOne({ where: { driverId: driver.id, date: dateStr } });
  if (existing) {
    await existing.update({ score: finalScore });
  } else {
    await ScoreHistory.create({ userId: driver.userId, driverId: driver.id, date: dateStr, score: finalScore });
  }
}

/**
 * Each driver's riskScore represents "today's" accumulated penalty (100% at
 * midnight, decreasing as violations get confirmed through the day). Rather
 * than run a cron job at midnight, we lazily roll it over the first time the
 * driver record is touched on a new day, archiving the previous day's final
 * score into ScoreHistory first so the all-time trend chart can be rebuilt.
 */
async function ensureDailyReset(driver) {
  const today = todayStr();
  const lastDate = driver.lastRiskResetDate ? dateStrOf(driver.lastRiskResetDate) : null;

  if (lastDate === today) return driver;

  if (lastDate) {
    await archiveScoreForDate(driver, lastDate);
  } else if ((driver.riskScore || 0) > 0) {
    // First time this driver has ever been touched by the reset system, but it
    // already carries a nonzero riskScore (e.g. violations were confirmed before
    // this row was ever read on a later day). Archive it under today instead of
    // silently discarding it — the previous code reset straight to 0 with no
    // archive step whenever lastDate was null, permanently losing that score.
    await archiveScoreForDate(driver, today);
  }

  await driver.update({ riskScore: 0, lastRiskResetDate: today });
  return driver;
}

async function ensureDailyResetMany(drivers) {
  await Promise.all(drivers.map(ensureDailyReset));
  return drivers;
}

/** Recomputes a past day's archived score from the violations that still
 * exist for that day — used when an admin deletes an already-confirmed
 * violation that landed on a day earlier than today. */
async function recomputeScoreForDate(driverId, userId, dateStr) {
  const Violation = require('../models/Violation');
  // Must be UTC (note the 'Z') to match dateStrOf()/todayStr(), which both derive the
  // date via toISOString() — on a server whose local timezone isn't UTC (e.g. UTC+5),
  // parsing these as local time shifts the query window away from the actual day a
  // late-UTC-day violation is labeled with, silently excluding it from its own day's
  // recompute.
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const dayViolations = await Violation.findAll({
    where: { driverId, status: 'Valid', timestamp: { [Op.between]: [dayStart, dayEnd] } }
  });
  const totalPenalty = dayViolations.reduce((sum, v) => sum + (v.penaltyApplied || 0), 0);
  const score = Math.max(0, 100 - totalPenalty);

  const existing = await ScoreHistory.findOne({ where: { driverId, date: dateStr } });
  if (existing) {
    await existing.update({ score });
  } else {
    await ScoreHistory.create({ userId, driverId, date: dateStr, score });
  }
}

module.exports = {
  todayStr,
  dateStrOf,
  ensureDailyReset,
  ensureDailyResetMany,
  recomputeScoreForDate,
};
