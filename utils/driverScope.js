const Driver = require('../models/Driver');
const { ensureDailyResetMany } = require('./dailyScore');

/**
 * The Sequelize where-clause fragment for "drivers this admin can see": their
 * own drivers only. Used to include the shared demo tenant's drivers too (so a
 * newly-registered admin had something to look at), but with multiple real
 * companies now on the platform that meant every admin could see every other
 * admin's drivers — dropped in favor of strict per-admin scoping.
 * Previously reimplemented independently in violations.js, drivers.js,
 * messages.js, and stats.js.
 */
function viewScope(userId) {
  return { userId };
}

async function getAllowedDrivers(userId) {
  const drivers = await Driver.findAll({ where: viewScope(userId) });
  // Every read of a driver list is also the cheapest place to lazily roll
  // each driver's safety score over to a new day — see utils/dailyScore.js.
  return ensureDailyResetMany(drivers);
}

async function getAllowedDriverIds(userId) {
  const drivers = await getAllowedDrivers(userId);
  return drivers.map(d => d.id);
}

module.exports = {
  viewScope,
  getAllowedDrivers,
  getAllowedDriverIds,
};
