const admin = require('./firebase');

/**
 * Persists a message to the driver's Firestore chat thread and pushes an FCM
 * notification to their device topic. Previously duplicated separately in
 * routes/violations.js's /confirm handler and routes/messages.js's POST /.
 * Failures on either step are logged, not thrown — a notification issue
 * should never fail the caller's primary action (confirming a violation,
 * sending a message).
 */
async function sendDriverMessage({ driverId, senderId, senderName = 'Fleet Manager', text, pushTitle, timestamp }) {
  if (!admin || !admin.apps.length) return;

  try {
    await admin.firestore().collection('drivers').doc(driverId).collection('messages').add({
      senderId,
      senderName,
      text,
      // Automated violation alerts pass the violation's own occurrence time here so
      // the driver sees when the behavior actually happened, not when the admin got
      // around to confirming it. Manual chat (routes/messages.js) never passes this,
      // so it correctly still falls back to "now".
      timestamp: timestamp || admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('Failed to write driver chat message:', e.message);
  }

  try {
    await admin.messaging().send({
      notification: { title: pushTitle, body: text },
      topic: `driver_${driverId}`,
    });
  } catch (e) {
    console.error('FCM Send failed:', e.message);
  }
}

module.exports = { sendDriverMessage };
