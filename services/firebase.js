const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

const path = require('path');
try {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '../config/firebase-service-account.json';
  const resolvedPath = path.isAbsolute(serviceAccountPath)
    ? serviceAccountPath
    : path.join(process.cwd(), serviceAccountPath);

  const serviceAccount = require(resolvedPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://drivermonitoringsystem-7948e-default-rtdb.firebaseio.com/'
  });
  console.log('Firebase Admin SDK initialized');
} catch (error) {
  console.error('Firebase initialization failed:', error.message);
}

module.exports = admin;
