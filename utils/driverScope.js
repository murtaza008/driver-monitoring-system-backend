const { Op } = require('sequelize');
const Driver = require('../models/Driver');
const { SYSTEM_USER_ID } = require('./settingsHelpers');
const { ensureDailyResetMany } = require('./dailyScore');

/**
 * The Sequelize where-clause fragment for "drivers this admin can see":
 * their own drivers, plus the shared demo tenant's drivers.
 * Previously reimplemented independently in violations.js, drivers.js,
 * messages.js, and stats.js.
 */
function viewScope(userId) {
  return { [Op.or]: [{ userId }, { userId: SYSTEM_USER_ID }] };
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
