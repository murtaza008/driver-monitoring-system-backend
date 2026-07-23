const User = require('../models/User');
const Driver = require('../models/Driver');
const { loadSetting, SYSTEM_USER_ID } = require('../utils/settingsHelpers');
const { TYPE_TO_LABEL } = require('../utils/violationTypes');

const defaultPenalties = {
  'Drowsiness': { Low: 1, Medium: 2, High: 3, Critical: 4 },
  'Yawning': { Low: 1, Medium: 2, High: 3, Critical: 4 },
  'Distraction': { Low: 1, Medium: 2, High: 3, Critical: 4 },
  'Mobile Usage': { Low: 1, Medium: 2, High: 3, Critical: 4 },
  'Seatbelt': { Low: 1, Medium: 2, High: 3, Critical: 4 },
  'Smoking': { Low: 1, Medium: 2, High: 3, Critical: 4 },
};

const defaultSeverities = {
  'DROWSY': 'Medium',
  'YAWNING': 'Low',
  'DISTRACTION': 'Medium',
  'MOBILE_USAGE': 'High',
  'SEATBELT': 'Medium',
  'SMOKING': 'Low',
  'SPEED': 'Medium',
  'CRASH': 'Critical',
};

const defaultThresholds = { excellent: 90, good: 70, average: 50 };

const defaultNotifications = {
  templates: {
    'Drowsiness': 'Alert: Driver {name} detected with drowsiness. Please take a break immediately.',
    'Yawning': 'Notice: Frequent yawning detected for driver {name}. Consider scheduling a rest stop.',
    'Distraction': 'Warning: Driver {name} appears distracted. Please focus on the road.',
    'Mobile Usage': 'Critical: Driver {name} detected using mobile phone while driving. Immediate action required.',
    'Seatbelt': 'Alert: Driver {name} is not wearing a seatbelt. Please buckle up immediately.',
    'Smoking': 'Notice: Driver {name} detected smoking in the vehicle. This violates company policy.',
  },
  toggles: {
    'Drowsiness': { Low: false, Medium: false, High: true, Critical: true },
    'Yawning': { Low: false, Medium: false, High: true, Critical: true },
    'Distraction': { Low: false, Medium: false, High: true, Critical: true },
    'Mobile Usage': { Low: false, Medium: false, High: true, Critical: true },
    'Seatbelt': { Low: false, Medium: false, High: true, Critical: true },
    'Smoking': { Low: false, Medium: false, High: true, Critical: true },
  }
};

/**
 * Settings are stored per-admin (company). The mobile app authenticates as a
 * *driver*, not the admin, when it calls GET /settings/penalties to sync the
 * penalty table (see RiskCalculator.updatePenaltyTable in the Android app).
 * Resolve the JWT subject to the admin ("company") that owns the settings:
 * - an admin's own id maps to itself
 * - a driver's id maps to that driver's owning admin (Driver.userId)
 * - the shared demo tenant (admin-system) maps to the unscoped/default settings
 */
async function resolveOwnerId(userId) {
  if (!userId || userId === SYSTEM_USER_ID) return null;

  const user = await User.findByPk(userId);
  if (user) return userId;

  const driver = await Driver.findByPk(userId);
  if (driver) return driver.userId === SYSTEM_USER_ID ? null : driver.userId;

  return userId;
}

// Get penalty for a violation type + severity. `ownerId` should already be
// resolved to an admin id (or null) by the caller.
async function getPenalty(violationType, severity, ownerId = null) {
  try {
    const penalties = await loadSetting(ownerId, 'penalties', defaultPenalties);
    const tableKey = TYPE_TO_LABEL[violationType] || violationType;
    if (penalties[tableKey] && penalties[tableKey][severity] !== undefined) {
      return penalties[tableKey][severity];
    }
    return 0;
  } catch (err) {
    return 0;
  }
}

async function getNotifications(ownerId = null) {
  try {
    return await loadSetting(ownerId, 'notifications', defaultNotifications);
  } catch (err) {
    return defaultNotifications;
  }
}

async function shouldNotify(violationType, severity, ownerId = null) {
  try {
    const config = await getNotifications(ownerId);
    const label = TYPE_TO_LABEL[violationType] || violationType;
    return config.toggles?.[label]?.[severity] !== false;
  } catch (err) {
    return severity !== 'Low';
  }
}

module.exports = {
  defaultPenalties,
  defaultSeverities,
  defaultThresholds,
  defaultNotifications,
  resolveOwnerId,
  getPenalty,
  getNotifications,
  shouldNotify,
};
