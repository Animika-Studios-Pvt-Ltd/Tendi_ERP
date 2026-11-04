import './setup-env.js';

// The test client connects from 127.0.0.1 and plays the reverse proxy, so
// X-Forwarded-For selects the client IP the rate limiters see.
process.env.TRUST_PROXY = 'loopback';
