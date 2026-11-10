import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ACTION_LIST, MODULE_LIST } from '../config/rbac.js';

const { Schema } = mongoose;

export const USER_STATUS = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive', SUSPENDED: 'suspended' });

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const permissionOverrideSchema = new Schema(
  {
    module: { type: String, enum: MODULE_LIST, required: true },
    action: { type: String, enum: ACTION_LIST, required: true },
    granted: { type: Boolean, required: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, trim: true, maxlength: 60, default: '' },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    phone: { type: String, trim: true, maxlength: 20 },
    designation: { type: String, trim: true, maxlength: 80 },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE, index: true },

    // Record-level access: used when role.dataScope is "assigned".
    assignedProjects: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
    // Portal links for external users (role.dataScope "own").
    contractor: { type: Schema.Types.ObjectId, ref: 'Contractor' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    employee: { type: Schema.Types.ObjectId, ref: 'Employee' },

    avatar: {
      url: String,
      key: String,
      provider: String,
    },

    permissionOverrides: {
      type: [permissionOverrideSchema],
      default: [],
    },

    lastLoginAt: Date,
    passwordChangedAt: Date,
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpiresAt;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.index({ assignedProjects: 1 });
userSchema.index({ firstName: 'text', lastName: 'text', email: 'text' });

userSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});

userSchema.virtual('isLocked').get(function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil.getTime() > Date.now());
});

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, env.BCRYPT_SALT_ROUNDS);
  if (!this.isNew) this.passwordChangedAt = new Date(Date.now() - 1000);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.registerFailedLogin = async function registerFailedLogin() {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  if (this.failedLoginAttempts >= MAX_FAILED_LOGINS) {
    this.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
    this.failedLoginAttempts = 0;
  }
  await this.save({ validateModifiedOnly: true });
};

userSchema.methods.registerSuccessfulLogin = async function registerSuccessfulLogin() {
  this.failedLoginAttempts = 0;
  this.lockUntil = undefined;
  this.lastLoginAt = new Date();
  await this.save({ validateModifiedOnly: true });
};

/** Issues a single-use reset token. Only its SHA-256 hash is stored. */
userSchema.methods.createPasswordResetToken = function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetTokenHash = hashToken(token);
  this.passwordResetExpiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  return token;
};

/**
 * Evaluates whether this user has permission for (module, action).
 * 1. Checks individual permission overrides first (explicit grant or deny).
 * 2. If no override exists, falls back to role default.
 * 3. If neither grants it, returns false (denied by default).
 */
userSchema.methods.can = function can(module, action) {
  if (Array.isArray(this.permissionOverrides)) {
    const override = this.permissionOverrides.find(
      (o) => o.module === module && o.action === action,
    );
    if (override !== undefined) {
      return Boolean(override.granted);
    }
  }

  if (this.role && typeof this.role.can === 'function') {
    return this.role.can(module, action);
  }

  if (this.role && Array.isArray(this.role.permissions)) {
    return this.role.permissions.some(
      (grant) => grant.module === module && grant.actions.includes(action),
    );
  }

  return false;
};

/**
 * Returns a complete { [module]: actions[] } map representing the user's active permissions.
 * Starts from role defaults and applies individual user overrides (grants add, denies remove).
 */
userSchema.methods.toEffectivePermissionMap = function toEffectivePermissionMap() {
  const map = {};
  for (const mod of MODULE_LIST) {
    map[mod] = [];
  }

  if (this.role) {
    const roleMap =
      typeof this.role.toPermissionMap === 'function'
        ? this.role.toPermissionMap()
        : Array.isArray(this.role.permissions)
          ? Object.fromEntries(this.role.permissions.map((g) => [g.module, [...g.actions]]))
          : {};

    for (const [mod, acts] of Object.entries(roleMap)) {
      if (Array.isArray(acts)) {
        map[mod] = [...acts];
      }
    }
  }

  if (Array.isArray(this.permissionOverrides)) {
    for (const override of this.permissionOverrides) {
      const { module: mod, action: act, granted } = override;
      if (!map[mod]) map[mod] = [];
      if (granted) {
        if (!map[mod].includes(act)) {
          map[mod].push(act);
        }
      } else {
        map[mod] = map[mod].filter((a) => a !== act);
      }
    }
  }

  return map;
};

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const User = mongoose.models.User || mongoose.model('User', userSchema);
