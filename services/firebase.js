const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

const path = require('path');

// The service account JSON file is gitignored (it's a private key — never belongs
// in version control), so on Vercel there's no file to point FIREBASE_SERVICE_ACCOUNT_PATH
// at. FIREBASE_SERVICE_ACCOUNT_JSON holds the same key's full JSON content directly
// as an env var instead. Local dev / traditional hosting (where the file does exist
// on disk) keeps working unchanged via the file-path fallback below.
function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '../config/firebase-service-account.json';
  const resolvedPath = path.isAbsolute(serviceAccountPath)
    ? serviceAccountPath
    : path.join(process.cwd(), serviceAccountPath);
  return require(resolvedPath);
}

try {
  const serviceAccount = loadServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://drivermonitoringsystem-7948e-default-rtdb.firebaseio.com/'
  });
  console.log('Firebase Admin SDK initialized');
} catch (error) {
  console.error('Firebase initialization failed:', error.message);
}

module.exports = admin;
