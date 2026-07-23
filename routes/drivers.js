const express = require('express');
const Driver = require('../models/Driver');
const User = require('../models/User');
const Violation = require('../models/Violation');
const auth = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('../services/cloudinary');
const bcrypt = require('bcryptjs');
const { viewScope, getAllowedDrivers } = require('../utils/driverScope');
const {
  normalizeName,
  normalizeEmail,
  assertGlobalEmailUnique,
  assertGlobalPhoneUnique,
  assertDriverUniqueFields,
  assertCanAddDriver,
  getFleetUsage,
  parseFleetSize,
  validateEmergencyContact,
  validatePassword,
  handleRouteError,
} = require('../utils/validators');
const router = express.Router();

// Memory storage, not disk — a disk-backed 'uploads/' dir needs a writable
// filesystem, which serverless hosts (Vercel) don't have outside /tmp. Keeping
// the file as an in-memory buffer works identically everywhere and needs no
// special-casing, since cloudinary.uploadFile() streams the buffer directly.
const upload = multer({ storage: multer.memoryStorage() });

async function findOwnedDriver(id, userId) {
  return Driver.findOne({ where: { id, userId } });
}

router.get('/fleet-status', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const fleetSize = parseFleetSize(user?.fleetSize) || 0;
    const { ownCount, demoCount, totalCount } = await getFleetUsage(req.user.id);
    res.json({
      fleetSize,
      ownCount,
      demoCount,
      totalCount,
      remaining: Math.max(0, fleetSize - totalCount),
      canAdd: totalCount < fleetSize,
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const drivers = await getAllowedDrivers(req.user.id);
    res.json(drivers);
  } catch (err) {
    return handleRouteError(res, err);
  }
});

router.post('/', auth, upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'cnicFront', maxCount: 1 },
  { name: 'cnicBack', maxCount: 1 },
  { name: 'licenseFront', maxCount: 1 },
  { name: 'licenseBack', maxCount: 1 }
]), async (req, res) => {
  try {
    await assertCanAddDriver(req.user.id);

    const name = normalizeName(req.body.name);
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Driver name is required.',
        errors: [{ field: 'firstName', message: 'Driver name is required.' }],
      });
    }

    validatePassword(req.body.password);
    const email = await assertGlobalEmailUnique(req.body.email);
    const phone = await assertGlobalPhoneUnique(req.body.phone, { field: 'phone' });
    const uniqueFields = await assertDriverUniqueFields(req.body);
    const emergency = validateEmergencyContact({
      name: req.body.emergencyContactName,
      phone: req.body.emergencyContactNumber,
      driverName: name,
      driverPhone: phone,
    });

    let hashedPassword = null;
    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(req.body.password, salt);
    }

    const driver = await Driver.create({
      name,
      email,
      password: hashedPassword,
      phone,
      licenseNumber: uniqueFields.licenseNumber,
      vehiclePlate: uniqueFields.vehiclePlate,
      cnicNumber: uniqueFields.cnicNumber,
      photoUrl: await cloudinary.uploadFile(req.files?.['photo']?.[0], 'drivers'),
      cnicFrontUrl: await cloudinary.uploadFile(req.files?.['cnicFront']?.[0], 'drivers'),
      cnicBackUrl: await cloudinary.uploadFile(req.files?.['cnicBack']?.[0], 'drivers'),
      licenseFrontUrl: await cloudinary.uploadFile(req.files?.['licenseFront']?.[0], 'drivers'),
      licenseBackUrl: await cloudinary.uploadFile(req.files?.['licenseBack']?.[0], 'drivers'),
      emergencyContactName: emergency.emergencyContactName,
      emergencyContactNumber: emergency.emergencyContactNumber,
      status: 'Off Duty',
      userId: req.user.id,
    });

    const { syncToFirebase } = require('../services/firebase-sync');
    syncToFirebase('driver', driver.toJSON());

    res.status(201).json(driver);
  } catch (err) {
    return handleRouteError(res, err);
  }
});

router.put('/:id', auth, upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'cnicFront', maxCount: 1 },
  { name: 'cnicBack', maxCount: 1 },
  { name: 'licenseFront', maxCount: 1 },
  { name: 'licenseBack', maxCount: 1 }
]), async (req, res) => {
  try {
    const driver = await findOwnedDriver(req.params.id, req.user.id);
    if (!driver) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit drivers you created. Demo drivers are read-only.',
        errors: [{ field: 'general', message: 'Demo drivers are read-only.' }],
      });
    }

    const name = normalizeName(req.body.name);
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Driver name is required.',
        errors: [{ field: 'firstName', message: 'Driver name is required.' }],
      });
    }

    const email = await assertGlobalEmailUnique(req.body.email, { excludeDriverId: driver.id });
    const phone = await assertGlobalPhoneUnique(req.body.phone, { field: 'phone', excludeDriverId: driver.id });
    const uniqueFields = await assertDriverUniqueFields(req.body, driver.id);
    const emergency = validateEmergencyContact({
      name: req.body.emergencyContactName,
      phone: req.body.emergencyContactNumber,
      driverName: name,
      driverPhone: phone,
    });

    const updateData = {
      name,
      email,
      phone,
      licenseNumber: uniqueFields.licenseNumber,
      vehiclePlate: uniqueFields.vehiclePlate,
      cnicNumber: uniqueFields.cnicNumber,
      emergencyContactName: emergency.emergencyContactName,
      emergencyContactNumber: emergency.emergencyContactNumber,
    };

    if (req.body.password) {
      validatePassword(req.body.password);
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(req.body.password, salt);
    }

    const photoUrl = await cloudinary.uploadFile(req.files?.['photo']?.[0], 'drivers');
    if (photoUrl) updateData.photoUrl = photoUrl;

    const cnicFrontUrl = await cloudinary.uploadFile(req.files?.['cnicFront']?.[0], 'drivers');
    if (cnicFrontUrl) updateData.cnicFrontUrl = cnicFrontUrl;

    const cnicBackUrl = await cloudinary.uploadFile(req.files?.['cnicBack']?.[0], 'drivers');
    if (cnicBackUrl) updateData.cnicBackUrl = cnicBackUrl;

    const licenseFrontUrl = await cloudinary.uploadFile(req.files?.['licenseFront']?.[0], 'drivers');
    if (licenseFrontUrl) updateData.licenseFrontUrl = licenseFrontUrl;

    const licenseBackUrl = await cloudinary.uploadFile(req.files?.['licenseBack']?.[0], 'drivers');
    if (licenseBackUrl) updateData.licenseBackUrl = licenseBackUrl;

    await driver.update(updateData);

    const { syncToFirebase } = require('../services/firebase-sync');
    syncToFirebase('driver', driver.toJSON());

    res.json(driver);
  } catch (err) {
    return handleRouteError(res, err);
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const driver = await findOwnedDriver(req.params.id, req.user.id);
    if (!driver) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete drivers you created. Demo drivers are read-only.',
        errors: [{ field: 'general', message: 'Demo drivers are read-only.' }],
      });
    }

    // Violations are keyed by driverId with no FK cascade — deleting the driver without
    // also clearing these leaves orphaned rows that every admin query silently excludes
    // (queries scope by "driverId IN (drivers I currently have)"), so they'd sit invisible
    // in Pending forever with no error anywhere.
    const orphanedViolations = await Violation.findAll({ where: { driverId: req.params.id }, attributes: ['id'] });
    await Violation.destroy({ where: { driverId: req.params.id } });

    await driver.destroy();

    const admin = require('../services/firebase');
    if (admin && admin.apps.length) {
      try {
        await admin.firestore().collection('drivers').doc(req.params.id.toString()).delete();
      } catch (fbErr) {
        console.error(`Failed to delete driver ${req.params.id} from Firestore:`, fbErr.message);
      }
      for (const v of orphanedViolations) {
        try {
          await admin.firestore().collection('incidents').doc(v.id.toString()).delete();
        } catch (fbErr) {
          console.error(`Failed to delete violation ${v.id} from Firestore:`, fbErr.message);
        }
      }
    }
    res.json({ success: true, message: 'Driver deleted' });
  } catch (err) {
    return handleRouteError(res, err);
  }
});

module.exports = router;
