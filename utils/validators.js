const { Op } = require('sequelize');
const User = require('../models/User');
const Driver = require('../models/Driver');
const { SYSTEM_USER_ID } = require('./settingsHelpers');

class ValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.errors = errors;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Pakistan mobile: 11 digits, starts with 03 */
function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) {
    digits = '0' + digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith('3')) {
    digits = '0' + digits;
  }
  return digits;
}

function normalizePlate(plate) {
  return String(plate || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeCnic(cnic) {
  return String(cnic || '').replace(/\D/g, '');
}

function normalizeLicense(license) {
  return String(license || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function validatePakistanPhone(phone, field = 'phone') {
  const normalized = normalizePhone(phone);
  if (!/^03\d{9}$/.test(normalized)) {
    throw new ValidationError('Invalid phone number.', [{
      field,
      message: 'Enter a valid Pakistan mobile number (11 digits, e.g. 03001234567).',
    }]);
  }
  return normalized;
}

function validateCnic(cnic, field = 'cnicNumber') {
  const normalized = normalizeCnic(cnic);
  if (!/^\d{13}$/.test(normalized)) {
    throw new ValidationError('Invalid CNIC.', [{
      field,
      message: 'CNIC must be 13 digits (e.g. 1234512345671).',
    }]);
  }
  return normalized;
}

function validatePassword(password, field = 'password') {
  if (!password || String(password).length < 6) {
    throw new ValidationError('Invalid password.', [{
      field,
      message: 'Password must be at least 6 characters.',
    }]);
  }
}

function parseFleetSize(value) {
  const n = parseInt(String(value || '').replace(/\D/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

async function isEmailTaken(email, { excludeUserId, excludeDriverId } = {}) {
  const normalized = normalizeEmail(email);
  const userWhere = { email: normalized };
  if (excludeUserId) userWhere.id = { [Op.ne]: excludeUserId };

  const driverWhere = { email: normalized };
  if (excludeDriverId) driverWhere.id = { [Op.ne]: excludeDriverId };

  const [user, driver] = await Promise.all([
    User.findOne({ where: userWhere }),
    Driver.findOne({ where: driverWhere }),
  ]);
  return !!(user || driver);
}

async function isPhoneTaken(phone, { excludeUserId, excludeDriverId } = {}) {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  const users = await User.findAll({
    where: excludeUserId ? { id: { [Op.ne]: excludeUserId } } : {},
    attributes: ['id', 'phone'],
  });
  if (users.some(u => u.phone && normalizePhone(u.phone) === normalized)) return true;

  const drivers = await Driver.findAll({
    where: excludeDriverId ? { id: { [Op.ne]: excludeDriverId } } : {},
    attributes: ['id', 'phone'],
  });
  return drivers.some(d => d.phone && normalizePhone(d.phone) === normalized);
}

async function isDriverFieldTaken(field, normalizedValue, excludeDriverId) {
  if (!normalizedValue) return false;
  const where = { [field]: normalizedValue };
  if (excludeDriverId) where.id = { [Op.ne]: excludeDriverId };
  const existing = await Driver.findOne({ where });
  return !!existing;
}

function validateEmergencyContact({ name, phone, driverName, driverPhone }) {
  const errors = [];
  const eName = normalizeName(name);
  const ePhone = phone ? normalizePhone(phone) : '';
  const dPhone = normalizePhone(driverPhone);

  // Both optional — but if either is provided, the other becomes required too.
  if (!eName && !ePhone) {
    return { emergencyContactName: '', emergencyContactNumber: '' };
  }
  if (!eName) {
    errors.push({ field: 'emergencyContactName', message: 'Emergency contact name is required when a number is provided.' });
  }
  if (!ePhone || !/^03\d{9}$/.test(ePhone)) {
    errors.push({ field: 'emergencyContactNumber', message: 'Enter a valid emergency contact number (11 digits).' });
  }
  if (ePhone && ePhone === dPhone) {
    errors.push({ field: 'emergencyContactNumber', message: 'Emergency contact number must differ from the driver phone.' });
  }
  if (errors.length) {
    throw new ValidationError('Emergency contact validation failed.', errors);
  }
  return { emergencyContactName: eName, emergencyContactNumber: ePhone };
}

async function assertGlobalEmailUnique(email, opts) {
  if (await isEmailTaken(email, opts)) {
    throw new ValidationError('Email already in use.', [{
      field: 'email',
      message: 'This email is already registered to a company or driver account.',
    }]);
  }
  return normalizeEmail(email);
}

async function assertGlobalPhoneUnique(phone, opts) {
  const normalized = validatePakistanPhone(phone, opts.field || 'phone');
  if (await isPhoneTaken(normalized, opts)) {
    throw new ValidationError('Phone already in use.', [{
      field: opts.field || 'phone',
      message: 'This phone number is already registered to a company or driver account.',
    }]);
  }
  return normalized;
}

async function assertDriverUniqueFields(data, excludeDriverId) {
  const errors = [];
  const plate = normalizePlate(data.vehiclePlate);
  let cnic = null;
  try {
    cnic = validateCnic(data.cnicNumber, 'cnicNumber');
  } catch (err) {
    if (err.errors) errors.push(...err.errors);
  }
  const license = normalizeLicense(data.licenseNumber);

  if (!plate) {
    errors.push({ field: 'vehiclePlate', message: 'Vehicle plate is required.' });
  }
  if (!license) {
    errors.push({ field: 'licenseNumber', message: 'License number is required.' });
  }

  if (errors.length === 0) {
    if (plate && await isDriverFieldTaken('vehiclePlate', plate, excludeDriverId)) {
      errors.push({ field: 'vehiclePlate', message: 'This vehicle plate is already registered.' });
    }
    if (cnic && await isDriverFieldTaken('cnicNumber', cnic, excludeDriverId)) {
      errors.push({ field: 'cnicNumber', message: 'This CNIC is already registered.' });
    }
    if (license && await isDriverFieldTaken('licenseNumber', license, excludeDriverId)) {
      errors.push({ field: 'licenseNumber', message: 'This license number is already registered.' });
    }
  }

  if (errors.length) {
    throw new ValidationError('Driver details conflict with existing records.', errors);
  }

  return { vehiclePlate: plate, cnicNumber: cnic, licenseNumber: license };
}

async function getFleetUsage(userId) {
  const [ownCount, demoCount] = await Promise.all([
    Driver.count({ where: { userId } }),
    Driver.count({ where: { userId: SYSTEM_USER_ID } }),
  ]);
  return { ownCount, demoCount, totalCount: ownCount + demoCount };
}

async function assertCanAddDriver(userId) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new ValidationError('Company account not found.', [{ field: 'account', message: 'Company account not found.' }]);
  }
  const fleetSize = parseFleetSize(user.fleetSize);
  if (!fleetSize) {
    throw new ValidationError('Fleet size not configured.', [{
      field: 'fleetSize',
      message: 'Update your company fleet size in account settings before adding drivers.',
    }]);
  }
  const { totalCount } = await getFleetUsage(userId);
  if (totalCount >= fleetSize) {
    throw new ValidationError('Fleet limit reached.', [{
      field: 'fleetSize',
      message: `Fleet limit reached (${totalCount}/${fleetSize}). You cannot add more drivers.`,
    }]);
  }
  return { fleetSize, totalCount, remaining: fleetSize - totalCount };
}

function validateCompanyRegistration(body) {
  const errors = [];
  if (!normalizeName(body.companyName)) errors.push({ field: 'companyName', message: 'Company name is required.' });
  if (!normalizeName(body.adminName)) errors.push({ field: 'adminName', message: 'Admin name is required.' });
  if (!normalizeEmail(body.email)) errors.push({ field: 'email', message: 'Valid email is required.' });
  if (!body.password || body.password.length < 6) errors.push({ field: 'password', message: 'Password must be at least 6 characters.' });
  try {
    validatePakistanPhone(body.phone, 'phone');
  } catch (e) {
    if (e.errors) errors.push(...e.errors);
  }
  if (!body.industry) errors.push({ field: 'industry', message: 'Select an industry.' });
  if (!parseFleetSize(body.fleetSize)) errors.push({ field: 'fleetSize', message: 'Fleet size must be a number of at least 1.' });
  if (!normalizeName(body.address)) errors.push({ field: 'address', message: 'Address is required.' });
  if (!String(body.ntnNumber || '').trim()) errors.push({ field: 'ntnNumber', message: 'NTN number is required.' });
  if (errors.length) throw new ValidationError('Please fix the highlighted fields.', errors);
}

function handleRouteError(res, err) {
  if (err.name === 'ValidationError') {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
      errors: err.errors || [],
    });
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      success: false,
      message: 'A record with this value already exists.',
      errors: [{ field: 'general', message: 'Duplicate value detected. Please use unique email, phone, plate, CNIC, or license.' }],
    });
  }
  console.error(err);
  return res.status(500).json({
    success: false,
    message: 'Something went wrong. Please try again.',
    errors: [{ field: 'general', message: err.message }],
  });
}

module.exports = {
  ValidationError,
  normalizeEmail,
  normalizePhone,
  normalizePlate,
  normalizeCnic,
  normalizeLicense,
  normalizeName,
  validatePakistanPhone,
  validateCnic,
  validatePassword,
  parseFleetSize,
  validateEmergencyContact,
  assertGlobalEmailUnique,
  assertGlobalPhoneUnique,
  assertDriverUniqueFields,
  assertCanAddDriver,
  getFleetUsage,
  validateCompanyRegistration,
  handleRouteError,
};
