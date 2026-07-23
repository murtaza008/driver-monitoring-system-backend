require('dotenv').config();
const bcrypt = require('bcryptjs');
const cloudinary = require('../services/cloudinary');
const Driver = require('../models/Driver');
const Violation = require('../models/Violation');
const User = require('../models/User');
const sequelize = require('../config/database');

const SEED_PASSWORD = 'password';

async function start() {
  try {
    console.log('--- TEST SEED START (NO FIREBASE) ---');
    await sequelize.sync();
    console.log('DB Synced');

    let user = await User.findOne({ where: { email: 'admin@test.com' } });
    if (!user) {
        // Hashed so this account can actually log in via POST /api/auth/login
        // (auth.js compares with bcrypt.compare) — a prior version stored this
        // in plaintext, which meant the seeded login never worked.
        const hashedPassword = await bcrypt.hash(SEED_PASSWORD, await bcrypt.genSalt(10));
        user = await User.create({ name: 'Admin', email: 'admin@test.com', password: hashedPassword });
    }
    console.log(`User OK (login: admin@test.com / ${SEED_PASSWORD})`);

    const result = await cloudinary.uploader.upload('https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg', { folder: 'test' });
    console.log('Cloudinary OK:', result.secure_url);

    const driver = await Driver.create({
        name: 'Test Driver',
        email: 'driver@test.com',
        phone: '12345',
        licenseNumber: 'LIC123',
        vehiclePlate: 'ABC-123',
        cnicNumber: '111',
        status: 'Active',
        riskScore: 45,
        userId: user.id
    });
    console.log('Driver OK');

    const violation = await Violation.create({
        driverId: driver.id,
        driverName: driver.name,
        type: 'Drowsiness Detected (Test)',
        severity: 'Critical',
        imageUrl: result.secure_url
    });
    console.log('Violation OK');

    console.log('--- TEST SEED SUCCESS ---');
    console.log('Note: Firebase was skipped because service account is missing.');
    process.exit(0);
  } catch (err) {
    console.error('SEED FAILED:', err);
    process.exit(1);
  }
}

start();
