const express = require('express');
const auth = require('../middleware/auth');
const { loadSetting, saveSetting } = require('../utils/settingsHelpers');
const settingsService = require('../services/settingsService');
const { resolveOwnerId, defaultPenalties, defaultSeverities, defaultThresholds, defaultNotifications } = settingsService;
const router = express.Router();

router.get('/penalties', auth, async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req.user.id);
    res.json(await loadSetting(ownerId, 'penalties', defaultPenalties));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/penalties', auth, async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req.user.id);
    await saveSetting(ownerId, 'penalties', req.body);
    res.json({ success: true, message: 'Penalties saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/severities', auth, async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req.user.id);
    res.json(await loadSetting(ownerId, 'severities', defaultSeverities));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/severities', auth, async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req.user.id);
    await saveSetting(ownerId, 'severities', req.body);
    res.json({ success: true, message: 'Severity mappings saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/thresholds', auth, async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req.user.id);
    res.json(await loadSetting(ownerId, 'thresholds', defaultThresholds));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/thresholds', auth, async (req, res) => {
  try {
    const { excellent, good, average } = req.body;
    const nums = [excellent, good, average].map(Number);
    if (nums.some(n => !Number.isFinite(n) || n < 0 || n > 100)) {
      return res.status(400).json({ success: false, message: 'Thresholds must be numbers between 0 and 100.' });
    }
    if (!(excellent > good && good > average)) {
      return res.status(400).json({
        success: false,
        message: 'Thresholds must be in descending order: Excellent > Good > Average.',
      });
    }
    const ownerId = await resolveOwnerId(req.user.id);
    await saveSetting(ownerId, 'thresholds', req.body);
    res.json({ success: true, message: 'Thresholds saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/notifications', auth, async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req.user.id);
    res.json(await loadSetting(ownerId, 'notifications', defaultNotifications));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/notifications', auth, async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req.user.id);
    await saveSetting(ownerId, 'notifications', req.body);
    res.json({ success: true, message: 'Notifications saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
