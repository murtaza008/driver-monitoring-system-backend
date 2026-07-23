require('dotenv').config();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');

async function createAdmin() {
  try {
    await sequelize.sync();
    
    const email = 'admin@admin.com';
    const password = 'admin';
    const name = 'Admin User';

    let user = await User.findOne({ where: { email } });
    if (user) {
      console.log('User already exists. Updating password...');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (user) {
      await user.update({ password: hashedPassword });
    } else {
      user = await User.create({
        name,
        adminName: name,
        companyName: 'Admin Corp',
        email,
        password: hashedPassword,
        phone: '12345',
        industry: 'Other'
      });
    }

    console.log(`Success! Login with:`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to create admin:', err);
    process.exit(1);
  }
}

createAdmin();
