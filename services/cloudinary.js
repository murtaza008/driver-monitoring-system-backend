const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a multer-staged file to Cloudinary and removes the local staged copy
 * afterward (previously left behind indefinitely in uploads/ — real driver
 * photo/CNIC/license images with no cleanup).
 */
async function uploadFile(file, folder) {
  if (!file) return null;
  try {
    const result = await cloudinary.uploader.upload(file.path, { folder });
    return result.secure_url;
  } finally {
    fs.unlink(file.path, (err) => {
      if (err) console.error(`Failed to remove staged upload ${file.path}:`, err.message);
    });
  }
}

module.exports = cloudinary;
module.exports.uploadFile = uploadFile;
