const express = require('express');
const auth = require('../middleware/auth');
const admin = require('../services/firebase');
const Driver = require('../models/Driver');
const { viewScope } = require('../utils/driverScope');
const notificationService = require('../services/notificationService');
const channelCacheService = require('../services/channelCacheService');
const router = express.Router();

router.post('/', auth, async (req, res) => {
  try {
    const { driverId, text } = req.body;

    const driver = await Driver.findOne({
      where: { id: driverId, ...viewScope(req.user.id) }
    });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    await notificationService.sendDriverMessage({
      driverId,
      senderId: req.user.id || 'dashboard',
      text,
      pushTitle: 'Message from Fleet Manager',
    });

    res.json({ success: true, message: 'Message sent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:driverId', auth, async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findOne({
      where: { id: driverId, ...viewScope(req.user.id) }
    });
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    if (!admin || !admin.apps.length) {
      return res.status(500).json({ error: 'Firebase Admin SDK not initialized.' });
    }

    const db = admin.firestore();
    const snapshot = await db.collection('drivers').doc(driverId).collection('messages')
      .orderBy('timestamp', 'asc')
      .get();

    const messages = [];
    snapshot.forEach(doc => {
      messages.push({ id: doc.id, ...doc.data() });
    });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/channels/active', auth, async (req, res) => {
  try {
    res.json(await channelCacheService.getActiveChannels(req.user.id));
  } catch (err) {
    console.error('Error in /channels/active:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
