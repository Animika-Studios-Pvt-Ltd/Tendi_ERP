// Must be imported before any src/ module. dotenv never overrides variables that are
// already set, so these test values win over backend/.env and no real database is used.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/tendi_erp_test';
process.env.MONGODB_DB_NAME = 'tendi_erp_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-characters-long';
process.env.CLIENT_URL = 'http://localhost:5173';
