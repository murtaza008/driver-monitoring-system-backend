const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Violation = require('../models/Violation');
const ScoreHistory = require('../models/ScoreHistory');
const Setting = require('../models/Setting');
const auth = require('../middleware/auth');
const admin = require('../services/firebase');
const {
  validateCompanyRegistration,
  validatePassword,
  normalizeName,
  normalizeEmail,
  normalizePhone,
  parseFleetSize,
  assertGlobalEmailUnique,
  assertGlobalPhoneUnique,
  handleRouteError,
} = require('../utils/validators');
const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    validateCompanyRegistration(req.body);
    validatePassword(req.body.password);

    const email = await assertGlobalEmailUnique(req.body.email);
    const phone = await assertGlobalPhoneUnique(req.body.phone, { field: 'phone' });

    const { adminName, name, companyName, industry, fleetSize, address, ntnNumber } = req.body;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    const user = await User.create({
      name: normalizeName(name || adminName),
      adminName: normalizeName(adminName),
      companyName: normalizeName(companyName),
      email,
      password: hashedPassword,
      phone,
      industry,
      fleetSize: String(parseFleetSize(fleetSize)),
      address: normalizeName(address),
      ntnNumber: String(ntnNumber || '').trim(),
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });

    res.json({ success: true, data: { token, user: { id: user.id, email: user.email, name: user.name, companyName: user.companyName } } });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    let user = await User.findOne({ where: { email: normalizedEmail } });
    let isDriver = false;

    if (!user) {
      user = await Driver.findOne({ where: { email: normalizedEmail } });
      if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials' });
      isDriver = true;
    }

    if (!user.password) {
      return res.status(400).json({ success: false, message: 'Invalid credentials or no password set for this account.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });

    const userData = isDriver ? {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      isDriver: true
    } : {
      id: user.id,
      email: user.email,
      name: user.name,
      adminName: user.adminName,
      companyName: user.companyName,
      phone: user.phone,
      industry: user.industry
    };

    res.json({ success: true, data: { token, user: userData } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Forgot/reset password — shared by both the admin dashboard and the driver mobile
// app (an account is either a User or a Driver, same as /login). No email/SMS
// provider is configured for this project, so identity is proven by matching the
// account's email AND phone together instead of a mailed reset link.
router.post('/reset-password', async (req, res) => {
  try {
    const { email, phone, newPassword } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedEmail || !normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Email and phone are required.',
        errors: [{ field: 'email', message: 'Email and phone are required.' }],
      });
    }

    let account = await User.findOne({ where: { email: normalizedEmail } });
    if (!account) {
      account = await Driver.findOne({ where: { email: normalizedEmail } });
    }

    // Same generic message whether the email doesn't exist at all or the phone just
    // doesn't match it — never reveal which registered emails exist.
    if (!account || normalizePhone(account.phone) !== normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'No account found with that email and phone combination.',
        errors: [{ field: 'phone', message: 'No account found with that email and phone combination.' }],
      });
    }

    validatePassword(newPassword);

    const salt = await bcrypt.genSalt(10);
    account.password = await bcrypt.hash(newPassword, salt);
    await account.save();

    res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// Get Firebase Custom Token
router.get('/firebase-token', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    let role = null;
    const adminUser = await User.findByPk(userId);
    if (adminUser) {
      role = 'admin';
    } else {
      const driverUser = await Driver.findByPk(userId);
      if (driverUser) {
        role = 'driver';
      }
    }

    if (!role) {
      return res.status(404).json({ success: false, message: 'User not found in either Users or Drivers table.' });
    }

    if (admin && admin.apps.length) {
      const customToken = await admin.auth().createCustomToken(String(userId), { role });
      res.json({ success: true, data: { firebaseToken: customToken } });
    } else {
      res.status(500).json({ success: false, message: 'Firebase Admin SDK not initialized.' });
    }
  } catch (err) {
    console.error('Firebase Token Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get company profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        adminName: user.adminName,
        companyName: user.companyName,
        phone: user.phone,
        industry: user.industry,
        fleetSize: user.fleetSize,
        address: user.address,
        ntnNumber: user.ntnNumber,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update company profile
router.put('/profile', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { companyName, adminName, phone, industry, fleetSize, address, ntnNumber } = req.body;

    if (!parseFleetSize(fleetSize)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid fleet size.',
        errors: [{ field: 'fleetSize', message: 'Fleet size must be a number of at least 1.' }],
      });
    }

    const normalizedPhone = await assertGlobalPhoneUnique(phone, { field: 'phone', excludeUserId: user.id });

    await user.update({
      companyName: normalizeName(companyName),
      adminName: normalizeName(adminName),
      name: normalizeName(adminName),
      phone: normalizedPhone,
      industry,
      fleetSize: String(parseFleetSize(fleetSize)),
      address: normalizeName(address),
      ntnNumber: String(ntnNumber || '').trim(),
    });

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        adminName: user.adminName,
        companyName: user.companyName,
        phone: user.phone,
        industry: user.industry,
        fleetSize: user.fleetSize,
        address: user.address,
        ntnNumber: user.ntnNumber,
      },
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

// Delete the currently authenticated admin's account, along with every driver they
// own and all data scoped to those drivers/that account — irreversible. Demo/system
// drivers (owned by the shared admin-system tenant) are never touched here, only this
// admin's own drivers.
router.delete('/account', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found' });

    const drivers = await Driver.findAll({ where: { userId: user.id } });
    const driverIds = drivers.map(d => d.id);

    let orphanedViolations = [];
    if (driverIds.length > 0) {
      orphanedViolations = await Violation.findAll({ where: { driverId: { [Op.in]: driverIds } }, attributes: ['id'] });
      await Violation.destroy({ where: { driverId: { [Op.in]: driverIds } } });
      await ScoreHistory.destroy({ where: { driverId: { [Op.in]: driverIds } } });
    }
    await Driver.destroy({ where: { userId: user.id } });

    // Settings rows are scoped as `${userId}:penalties`, `${userId}:notifications`, etc.
    await Setting.destroy({ where: { key: { [Op.like]: `${user.id}:%` } } });

    if (admin && admin.apps.length) {
      for (const id of driverIds) {
        try {
          await admin.firestore().collection('drivers').doc(id.toString()).delete();
        } catch (fbErr) {
          console.error(`Failed to delete driver ${id} from Firestore:`, fbErr.message);
        }
      }
      for (const v of orphanedViolations) {
        try {
          await admin.firestore().collection('incidents').doc(v.id.toString()).delete();
        } catch (fbErr) {
          console.error(`Failed to delete violation ${v.id} from Firestore:`, fbErr.message);
        }
      }
      try {
        await admin.auth().deleteUser(user.id.toString());
      } catch (fbErr) {
        // Fine if this admin never had a Firebase Auth user (e.g. never opened the mobile-linked flow)
        console.error(`Failed to delete Firebase Auth user ${user.id}:`, fbErr.message);
      }
    }

    await user.destroy();

    res.json({ success: true, message: 'Account and all associated data deleted' });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

module.exports = router;
