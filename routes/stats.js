const express = require('express');
const Driver = require('../models/Driver');
const Violation = require('../models/Violation');
const User = require('../models/User');
const ScoreHistory = require('../models/ScoreHistory');
const auth = require('../middleware/auth');
const router = express.Router();
const { Op } = require('sequelize');
const { getAllowedDrivers } = require('../utils/driverScope');
const { normalizeViolationLabel } = require('../utils/violationTypes');
const { todayStr } = require('../utils/dailyScore');

/** Real historical trend from company signup to today — one point per day
 * that has data. Past days come from ScoreHistory (archived at each driver's
 * daily rollover); today is the live average of current driver scores. */
async function buildSafetyScoreTrend(driverIds, companyCreatedAt, liveTodayAvg) {
  const history = driverIds.length
    ? await ScoreHistory.findAll({ where: { driverId: { [Op.in]: driverIds } } })
    : [];

  const byDate = {};
  history.forEach(h => {
    if (!byDate[h.date]) byDate[h.date] = [];
    byDate[h.date].push(h.score);
  });

  // UTC-based boundaries throughout — must match todayStr()/dateStrOf() (both
  // toISOString()-based), which is what ScoreHistory rows and driver.riskScore
  // resets actually key off. Local-time boundaries here (as before) desynced the
  // loop's date keys from todayKey for most of the day on a non-UTC server (this one
  // runs at UTC+5), silently dropping "today" from the trend outside a ~5-hour window.
  const startKey = new Date(companyCreatedAt || Date.now()).toISOString().slice(0, 10);
  const todayKey = todayStr();

  const trend = [];
  const cursor = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(`${todayKey}T00:00:00.000Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    if (key === todayKey) {
      trend.push({ date: key, score: liveTodayAvg });
    } else if (byDate[key]) {
      const scores = byDate[key];
      trend.push({ date: key, score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return trend;
}

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const allowedDrivers = await getAllowedDrivers(userId);

    const totalDrivers = allowedDrivers.length;
    const activeDrivers = allowedDrivers.filter(d => d.status === 'Active').length;
    const driverIds = allowedDrivers.map(d => d.id);

    // UTC midnight — matches todayStr()/dateStrOf(), the actual boundary the
    // riskScore/daily-reset system uses. A local-midnight boundary here (as before)
    // disagreed with that system for part of every day on this UTC+5 server: a
    // violation could count as "today" here while the score system still treated it
    // as yesterday's.
    const today = new Date(`${todayStr()}T00:00:00.000Z`);

    const violationsToday = await Violation.count({
      where: {
        driverId: { [Op.in]: driverIds },
        timestamp: { [Op.gte]: today },
        status: 'Valid'
      }
    });

    // Each driver's riskScore already represents "today's" accumulated
    // penalty (see utils/dailyScore.js), so this average is inherently daily.
    const avgRisk = totalDrivers > 0
      ? Math.round(allowedDrivers.reduce((s, d) => s + (d.riskScore || 0), 0) / totalDrivers)
      : 0;
    const currentSafetyScore = Math.max(0, 100 - avgRisk);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

    const weekViolations = await Violation.findAll({
      where: {
        driverId: { [Op.in]: driverIds },
        timestamp: { [Op.gte]: sevenDaysAgo },
        status: 'Valid'
      }
    });

    const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyMap = {};
    dayMap.forEach(d => { weeklyMap[d] = 0; });
    weekViolations.forEach(v => {
      const day = dayMap[new Date(v.timestamp).getDay()];
      weeklyMap[day]++;
    });
    const weeklyViolations = dayMap.map(day => ({ day, count: weeklyMap[day] }));

    const todaysViolations = await Violation.findAll({
      where: {
        driverId: { [Op.in]: driverIds },
        timestamp: { [Op.gte]: today },
        status: 'Valid'
      }
    });

    const typeMap = {};
    todaysViolations.forEach(v => {
      const label = normalizeViolationLabel(v.type);
      typeMap[label] = (typeMap[label] || 0) + 1;
    });
    const violationTypesToday = Object.entries(typeMap).map(([name, value]) => ({ name, value }));

    const company = await User.findByPk(userId);
    const safetyScoreTrend = await buildSafetyScoreTrend(driverIds, company?.createdAt, currentSafetyScore);

    res.json({
      totalDrivers,
      activeDrivers,
      violationsToday,
      avgRisk,
      weeklyViolations,
      violationTypesToday: violationTypesToday.length > 0 ? violationTypesToday : [{ name: 'None', value: 0 }],
      safetyScoreTrend
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
