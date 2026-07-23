const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a multer in-memory file (multer.memoryStorage(), so `file.buffer` —
 * not `file.path`, there is no on-disk staged copy) to Cloudinary via a stream.
 * Streaming the buffer directly avoids ever touching disk, which serverless
 * hosts (Vercel) don't allow outside of /tmp anyway.
 */
function uploadFile(file, folder) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) return reject(err);
      resolve(result.secure_url);
    });
    uploadStream.end(file.buffer);
  });
}

module.exports = cloudinary;
module.exports.uploadFile = uploadFile;
