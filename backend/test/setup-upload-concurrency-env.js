import './setup-upload-env.js';

// Room for a second user while one user is at their per-user cap.
process.env.MAX_CONCURRENT_UPLOADS = '3';
process.env.MAX_CONCURRENT_UPLOADS_PER_USER = '2';
process.env.UPLOAD_BODY_TIMEOUT_SECONDS = '1';
