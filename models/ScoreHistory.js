const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// One row per driver per calendar day — archives that day's final safety
// score right before dailyScore.ensureDailyReset() rolls it back to 100%,
// so the Safety Score Trend chart can be reconstructed from company signup
// to today without needing a live cron job.
const ScoreHistory = sequelize.define('ScoreHistory', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    // STRING, not UUID — same reason as Driver.userId: can hold the SYSTEM_USER_ID
    // sentinel ('admin-system') as well as a real admin User.id.
    type: DataTypes.STRING,
    allowNull: false
  },
  driverId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  score: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  indexes: [
    { unique: true, fields: ['driverId', 'date'] }
  ]
});

module.exports = ScoreHistory;
