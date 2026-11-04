import './setup-env.js';

// Fewer bcrypt rounds keeps seeding fast; the minimum allowed by env validation.
process.env.BCRYPT_SALT_ROUNDS = '10';
