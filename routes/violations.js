const express = require('express');
const { Op } = require('sequelize');
const Violation = require('../models/Violation');
const Driver = require('../models/Driver');
const auth = require('../middleware/auth');
const admin = require('../services/firebase');
const { normalizeViolationLabel } = require('../utils/violationTypes');
const { SYSTEM_USER_ID } = require('../utils/settingsHelpers');
const { viewScope, getAllowedDriverIds } = require('../utils/driverScope');
const notificationService = require('../services/notificationService');
const { ensureDailyReset, recomputeScoreForDate, todayStr, dateStrOf } = require('../utils/dailyScore');
const router = express.Router();

async function withVehiclePlates(violations, driverIds) {
  const drivers = await Driver.findAll({
    where: { id: { [Op.in]: driverIds } },
    attributes: ['id', 'vehiclePlate', 'photoUrl'],
  });
  const driverById = Object.fromEntries(drivers.map(d => [d.id, d]));
  return violations.map(v => ({
    ...v.toJSON(),
    vehiclePlate: driverById[v.driverId]?.vehiclePlate || null,
    driverPhotoUrl: driverById[v.driverId]?.photoUrl || null,
  }));
}

// Get confirmed violations (default dashboard/mobile view — pending items never leak in here)
router.get('/', auth, async (req, res) => {
  try {
    const driverIds = await getAllowedDriverIds(req.user.id);
    const where = { driverId: { [Op.in]: driverIds }, status: 'Valid' };
    if (req.query.today === '1' || req.query.today === 'true') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      where.timestamp = { [Op.gte]: start };
    }
    const limit = parseInt(req.query.limit, 10);
    const violations = await Violation.findAll({
      where,
      order: [['timestamp', 'DESC']],
      ...(Number.isInteger(limit) && limit > 0 ? { limit } : {}),
    });
    res.json(await withVehiclePlates(violations, driverIds));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get violations awaiting admin review
router.get('/pending', auth, async (req, res) => {
  try {
    const driverIds = await getAllowedDriverIds(req.user.id);
    const violations = await Violation.findAll({
      where: { driverId: { [Op.in]: driverIds }, status: 'Pending' },
      order: [['timestamp', 'DESC']],
    });
    res.json(await withVehiclePlates(violations, driverIds));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Log a violation (from mobile app) — lands as Pending; no penalty/notification until an admin confirms it
router.post('/', auth, async (req, res) => {
  try {
    const { type, severity: appSeverity, imageUrl, idempotencyKey } = req.body;
    // driverId comes from the authenticated JWT, never the request body — otherwise
    // any caller with a valid mobile session could submit fake violations for any
    // OTHER driver just by naming their id, regardless of who they actually are.
    const driverId = req.user.id;

    if (idempotencyKey) {
      const existing = await Violation.findOne({ where: { idempotencyKey } });
      if (existing) {
        return res.status(200).json({ success: true, data: existing, message: 'Already processed' });
      }
    }

    const driver = await Driver.findByPk(driverId);
    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    // The Android app already computes severity from how long the anomalous
    // state persisted (ViolationDurationTracker) — that's authoritative here,
    // not a static per-type admin default.
    const finalSeverity = appSeverity || 'Medium';

    const violation = await Violation.create({
      driverId,
      driverName: driver.name,
      type,
      severity: finalSeverity,
      imageUrl: imageUrl || null,
      idempotencyKey,
      status: 'Pending',
    });

    const { syncToFirebase } = require('../services/firebase-sync');
    syncToFirebase('violation', violation.toJSON());

    console.log(`Logged pending violation ${type} for driver ${driver.name}, awaiting admin review`);
    res.status(201).json({ success: true, data: violation });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(200).json({ success: true, message: 'Already processed (unique constraint)' });
    }
    console.error('Error logging violation:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get confirmed violations for a specific driver (mobile app's violation history)
router.get('/driver/:driverId', auth, async (req, res) => {
  try {
    const driver = await Driver.findOne({
      where: { id: req.params.driverId, ...viewScope(req.user.id) }
    });
    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    const violations = await Violation.findAll({
      where: { driverId: req.params.driverId, status: 'Valid' },
      order: [['timestamp', 'DESC']]
    });
    res.json(violations);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Confirm a pending violation: apply its penalty, mark it Valid, and notify (per admin's saved template/toggles)
router.put('/:id/confirm', auth, async (req, res) => {
  try {
    const violation = await Violation.findByPk(req.params.id);
    if (!violation) return res.status(404).json({ message: 'Violation not found' });
    if (violation.status !== 'Pending') return res.status(400).json({ message: 'Violation is not pending' });

    const driver = await Driver.findOne({
      where: { id: violation.driverId, ...viewScope(req.user.id) }
    });
    if (!driver) return res.status(403).json({ message: 'Access denied' });

    // Atomic claim on the Pending->Valid transition: a plain read-then-write here let
    // two near-simultaneous confirm requests for the same violation (double-click,
    // network retry) both pass the status check above before either commit, applying
    // the penalty to driver.riskScore twice for a violation that only exists once.
    // The where-clause re-checks status='Pending' at the DB level, so only the request
    // that actually wins the race proceeds to apply the penalty.
    const [claimed] = await Violation.update(
      { status: 'Valid' },
      { where: { id: violation.id, status: 'Pending' } }
    );
    if (claimed === 0) return res.status(400).json({ message: 'Violation is not pending' });
    await violation.reload();
    await ensureDailyReset(driver);

    const settingsService = require('../services/settingsService');
    const ownerId = driver.userId === SYSTEM_USER_ID ? null : driver.userId;

    const penalty = await settingsService.getPenalty(violation.type, violation.severity, ownerId);
    await violation.update({ penaltyApplied: penalty });

    // Apply the penalty to whichever day the violation actually happened on — not
    // blindly to today. A violation can sit Pending for days before an admin reviews
    // it, so "today" (when it's confirmed) is often a different day than its
    // timestamp. Applying to today's live riskScore regardless of that made DELETE's
    // revert (which correctly targets the violation's own date) undo the wrong day's
    // score, leaving today's riskScore permanently inflated after a delete.
    if (penalty > 0) {
      const violationDate = dateStrOf(violation.timestamp);
      if (violationDate === todayStr()) {
        const currentScore = driver.riskScore ?? 0;
        await driver.update({ riskScore: Math.min(100, currentScore + penalty) });
      } else {
        await recomputeScoreForDate(driver.id, driver.userId, violationDate);
      }
    }

    const { syncToFirebase } = require('../services/firebase-sync');
    syncToFirebase('driver', driver.toJSON());
    syncToFirebase('violation', violation.toJSON());

    const notifyEnabled = await settingsService.shouldNotify(violation.type, violation.severity, ownerId);
    if (notifyEnabled) {
      const displayType = normalizeViolationLabel(violation.type);
      const notifications = await settingsService.getNotifications(ownerId);
      const template = notifications?.templates?.[displayType];
      const body = template
        ? template.replace(/\{name\}/g, driver.name)
        : `${driver.name} - Severity: ${violation.severity}`;

      await notificationService.sendDriverMessage({
        driverId: violation.driverId,
        senderId: 'system',
        text: body,
        pushTitle: `CRITICAL ALERT: ${displayType}`,
      });
    }

    res.json({ success: true, data: violation, updatedScore: driver.riskScore });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Reject a false-positive pending violation — deletes it outright, no penalty was ever applied
router.put('/:id/reject', auth, async (req, res) => {
  try {
    const violation = await Violation.findByPk(req.params.id);
    if (!violation) return res.status(404).json({ message: 'Violation not found' });

    const driver = await Driver.findOne({
      where: { id: violation.driverId, ...viewScope(req.user.id) }
    });
    if (!driver) return res.status(403).json({ message: 'Access denied' });

    const violationId = violation.id;
    await violation.destroy();

    if (admin && admin.apps.length) {
      try {
        await admin.firestore().collection('incidents').doc(violationId.toString()).delete();
      } catch (fbErr) {
        console.error(`Failed to delete violation ${violationId} from Firestore:`, fbErr.message);
      }
    }

    res.json({ success: true, message: 'Violation rejected and removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete an already-confirmed (Valid) violation — used by the delete "cross"
// on Recent/Today/All Violations and the driver's Violation History. Reverts
// whatever penalty this violation applied: straight off today's riskScore if
// it happened today, or by recomputing that day's archived ScoreHistory row
// if it happened on an earlier, already-archived day.
router.delete('/:id', auth, async (req, res) => {
  try {
    const violation = await Violation.findByPk(req.params.id);
    if (!violation) return res.status(404).json({ message: 'Violation not found' });

    const driver = await Driver.findOne({
      where: { id: violation.driverId, ...viewScope(req.user.id) }
    });
    if (!driver) return res.status(403).json({ message: 'Access denied' });

    await ensureDailyReset(driver);

    const wasValidWithPenalty = violation.status === 'Valid' && violation.penaltyApplied > 0;
    const violationDate = dateStrOf(violation.timestamp);
    const violationId = violation.id;

    // Row existence as the atomic gate: if a concurrent delete request (double-click,
    // retry) for this same violation already removed the row, this returns 0 and we
    // skip reverting — otherwise both requests would each subtract the penalty once,
    // double-reverting a score that was only ever incremented once.
    const deletedCount = await Violation.destroy({ where: { id: violationId } });
    if (deletedCount === 0) {
      return res.json({ success: true, message: 'Violation already deleted' });
    }

    if (wasValidWithPenalty) {
      if (violationDate === todayStr()) {
        await driver.update({ riskScore: Math.max(0, (driver.riskScore || 0) - violation.penaltyApplied) });
      } else {
        await recomputeScoreForDate(driver.id, driver.userId, violationDate);
      }
    }

    const { syncToFirebase } = require('../services/firebase-sync');
    syncToFirebase('driver', driver.toJSON());

    if (admin && admin.apps.length) {
      try {
        await admin.firestore().collection('incidents').doc(violationId.toString()).delete();
      } catch (fbErr) {
        console.error(`Failed to delete violation ${violationId} from Firestore:`, fbErr.message);
      }
    }

    res.json({ success: true, message: 'Violation deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
