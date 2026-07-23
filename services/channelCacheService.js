const admin = require('./firebase');
const { getAllowedDrivers } = require('../utils/driverScope');

/**
 * In-memory cache of each admin's active message channels (one row per driver,
 * with their last message preview). Previously embedded directly inside
 * routes/messages.js's /channels/active handler.
 */
const cachedChannels = new Map();
const lastCacheTime = new Map();
const CACHE_TTL = 5000;
const refreshingUsers = new Set();

async function refreshChannels(userId) {
  if (!admin || !admin.apps.length) return;
  const db = admin.firestore();
  const localDrivers = await getAllowedDrivers(userId);

  const channelPromises = localDrivers.map(async (driver) => {
    const docId = driver.id;
    const msgsSnapshot = await db.collection('drivers').doc(docId).collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    let lastMessage = null;
    let lastMessageTime = null;
    let lastMessageSender = null;

    if (!msgsSnapshot.empty) {
      const msgDoc = msgsSnapshot.docs[0].data();
      lastMessage = msgDoc.text;
      lastMessageTime = msgDoc.timestamp ? msgDoc.timestamp.toDate() : new Date();
      lastMessageSender = msgDoc.senderName || msgDoc.senderId;
    }

    return {
      id: docId,
      name: driver.name || docId,
      lastMessage,
      lastMessageTime,
      lastMessageSender,
      ...driver.toJSON()
    };
  });

  cachedChannels.set(userId, (await Promise.all(channelPromises)).filter(c => c !== null));
  lastCacheTime.set(userId, Date.now());
}

/**
 * Returns this admin's active channels, refreshing in the background if the
 * cache is stale. On a completely cold cache, waits briefly (up to ~1.5s) for
 * the first refresh so the caller doesn't just get an empty list.
 */
async function getActiveChannels(userId) {
  const cached = cachedChannels.get(userId);
  const lastTime = lastCacheTime.get(userId) || 0;
  const needsRefresh = !cached || (Date.now() - lastTime > CACHE_TTL);

  if (needsRefresh && !refreshingUsers.has(userId)) {
    refreshingUsers.add(userId);
    Promise.resolve()
      .then(() => refreshChannels(userId))
      .catch(err => console.error('Background cache refresh failed:', err))
      .finally(() => refreshingUsers.delete(userId));
  }

  if (cached) return cached;

  let attempts = 0;
  while (!cachedChannels.get(userId) && attempts < 15) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  return cachedChannels.get(userId) || [];
}

module.exports = { getActiveChannels };
