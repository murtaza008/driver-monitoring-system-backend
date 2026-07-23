const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Driver = sequelize.define('Driver', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true // True to avoid breaking existing driver records
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  licenseNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  photoUrl: {
    type: DataTypes.STRING
  },
  cnicFrontUrl: {
    type: DataTypes.STRING
  },
  cnicBackUrl: {
    type: DataTypes.STRING
  },
  licenseFrontUrl: {
    type: DataTypes.STRING
  },
  licenseBackUrl: {
    type: DataTypes.STRING
  },
  vehiclePlate: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  cnicNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  status: {
    type: DataTypes.ENUM('Active', 'Off Duty'),
    defaultValue: 'Off Duty'
  },
  riskScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Tracks the calendar day riskScore currently represents — see
  // utils/dailyScore.js. Null until the driver's first violation/telemetry
  // touch after this feature shipped.
  lastRiskResetDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  emergencyContactName: {
    type: DataTypes.STRING
  },
  emergencyContactNumber: {
    type: DataTypes.STRING
  },
  userId: {
    // STRING, not UUID: this holds either a real admin User.id (a UUID) or the
    // literal sentinel SYSTEM_USER_ID ('admin-system') for the shared demo tenant.
    // Postgres's native uuid type strictly validates format at query time (unlike
    // SQLite, which stored this loosely as TEXT) — a strict UUID column here would
    // throw "invalid input value for uuid" on every query that compares against
    // the sentinel via viewScope()'s Op.or, which is most driver-scoped queries.
    type: DataTypes.STRING,
    allowNull: false
  }
});

module.exports = Driver;
