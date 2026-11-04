import './setup-env.js';

// Small limits so size tests stay fast. Fake Cloudinary credentials: every network call
// is mocked, and signing URLs is an offline operation, so nothing reaches Cloudinary.
process.env.MAX_UPLOAD_SIZE_MB = '0.0625'; // 64 KB
process.env.MAX_UPLOAD_FILES = '3';
process.env.MAX_UPLOAD_TOTAL_MB = '0.125'; // 128 KB
process.env.MAX_CONCURRENT_UPLOADS = '2';
process.env.FILE_URL_TTL_SECONDS = '120';
process.env.STORAGE_PROVIDER = 'cloudinary';
process.env.CLOUDINARY_CLOUD_NAME = 'tendi-test-cloud';
process.env.CLOUDINARY_API_KEY = '000000000000000';
process.env.CLOUDINARY_API_SECRET = 'test-only-cloudinary-secret-value';
process.env.CLOUDINARY_FOLDER = 'tendi-test';
