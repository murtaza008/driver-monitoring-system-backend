const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Violation = sequelize.define('Violation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  driverId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  driverName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  severity: {
    type: DataTypes.ENUM('Low', 'Medium', 'High', 'Critical'),
    allowNull: false
  },
  imageUrl: {
    type: DataTypes.STRING
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    // 'Rejected' is kept for backward compatibility with historical rows —
    // rejections now hard-delete the row instead of flagging it, so no new
    // row will ever be created with this status going forward.
    type: DataTypes.ENUM('Pending', 'Valid', 'Rejected'),
    defaultValue: 'Pending'
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  // Penalty percentage actually deducted when this violation was confirmed
  // (per the admin's Penalty Settings at that moment) — recorded so deleting
  // an already-confirmed violation later can revert exactly this amount,
  // regardless of any subsequent changes to Penalty Settings.
  penaltyApplied: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  idempotencyKey: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

module.exports = Violation;

