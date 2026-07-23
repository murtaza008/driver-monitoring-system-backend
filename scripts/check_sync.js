require('dotenv').config();
const Driver = require('../models/Driver');
const Violation = require('../models/Violation');
const sequelize = require('../config/database');

async function checkData() {
  try {
    const drivers = await Driver.findAll();
    const violations = await Violation.findAll();
    console.log(`Current SQLite Data:`);
    console.log(`Drivers: ${drivers.length}`);
    console.log(`Violations: ${violations.length}`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkData();
