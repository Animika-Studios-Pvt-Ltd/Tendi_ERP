/**
 * Idempotent bootstrap: upserts the system roles and creates the first Super Admin
 * from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. Safe to run repeatedly.
 *   npm run seed
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { DEFAULT_ROLES, ROLES, toPermissionEntries } from '../config/rbac.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

async function seedRoles() {
  for (const role of DEFAULT_ROLES) {
    await Role.findOneAndUpdate(
      { key: role.key },
      {
        $set: {
          name: role.name,
          description: role.description,
          dataScope: role.dataScope,
          permissions: toPermissionEntries(role.permissions),
          isSystem: true,
          isActive: true,
        },
      },
      { upsert: true, runValidators: true },
    );
  }
  logger.info(`Seeded ${DEFAULT_ROLES.length} system roles`);
}

async function seedSuperAdmin() {
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    logger.warn('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set; skipping Super Admin creation');
    return;
  }

  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  if (await User.exists({ email })) {
    logger.info(`Super Admin ${email} already exists; left unchanged`);
    return;
  }

  const role = await Role.findOne({ key: ROLES.SUPER_ADMIN });
  await User.create({
    firstName: env.SEED_ADMIN_FIRST_NAME,
    lastName: env.SEED_ADMIN_LAST_NAME,
    email,
    password: env.SEED_ADMIN_PASSWORD,
    role: role._id,
    designation: 'Super Admin',
  });
  logger.info(`Created Super Admin ${email}. Change the password after first sign-in.`);
}

try {
  await connectDatabase(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME, maxAttempts: 3 });
  await Promise.all([Role.syncIndexes(), User.syncIndexes()]);
  await seedRoles();
  await seedSuperAdmin();
} catch (error) {
  logger.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
