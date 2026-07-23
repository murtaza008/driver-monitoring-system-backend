const express = require('express');
const Driver = require('../models/Driver');
const auth = require('../middleware/auth');
const { ensureDailyReset } = require('../utils/dailyScore');
const router = express.Router();

router.post('/', auth, async (req, res) => {
  try {
    const { status } = req.body;
    // driverId comes from the authenticated JWT, not the request body — otherwise any
    // caller with a valid mobile session could overwrite ANY other driver's status
    // just by naming their id.
    const driverId = req.user.id;

    const driver = await Driver.findByPk(driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    // Roll over to a new day (archiving yesterday's score) so a stale in-memory
    // riskScore from before midnight isn't shown as the current live value.
    await ensureDailyReset(driver);
    // riskScore is intentionally NOT settable here. It must only ever change via an
    // admin confirming/deleting a violation (routes/violations.js) — this heartbeat
    // used to also push the mobile app's own local, ephemeral, unconfirmed-inclusive
    // RiskCalculator value here every ~5s, silently overwriting the real,
    // admin-controlled Safety Score with a number nobody on the dashboard actually
    // approved.
    await driver.update({ status: status || 'Active' });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
