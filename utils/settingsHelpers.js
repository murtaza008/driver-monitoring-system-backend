const Setting = require('../models/Setting');

const SYSTEM_USER_ID = 'admin-system';

function scopedKey(userId, name) {
  if (!userId || userId === SYSTEM_USER_ID) return name;
  return `${userId}:${name}`;
}

async function loadSetting(userId, name, defaultValue) {
  const key = scopedKey(userId, name);
  const row = await Setting.findByPk(key);
  if (row) return JSON.parse(row.value);

  if (userId && userId !== SYSTEM_USER_ID) {
    const legacy = await Setting.findByPk(name);
    if (legacy) return JSON.parse(legacy.value);
  }

  return defaultValue;
}

async function saveSetting(userId, name, value) {
  const key = scopedKey(userId, name);
  await Setting.upsert({ key, value: JSON.stringify(value) });
}

module.exports = {
  SYSTEM_USER_ID,
  scopedKey,
  loadSetting,
  saveSetting,
};
