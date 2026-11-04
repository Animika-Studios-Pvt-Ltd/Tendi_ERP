import mongoose from 'mongoose';
import { ACTION_LIST, DATA_SCOPES, MODULE_LIST } from '../config/rbac.js';

const { Schema } = mongoose;

const permissionGrantSchema = new Schema(
  {
    module: { type: String, enum: MODULE_LIST, required: true },
    actions: [{ type: String, enum: ACTION_LIST, required: true }],
  },
  { _id: false },
);

const roleSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z][a-z0-9_]*$/, 'Role key may only contain lowercase letters, numbers and underscores'],
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    dataScope: { type: String, enum: Object.values(DATA_SCOPES), default: DATA_SCOPES.ASSIGNED },
    permissions: { type: [permissionGrantSchema], default: [] },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** Returns { module: actions[] } for quick lookups and for sending to the client. */
roleSchema.methods.toPermissionMap = function toPermissionMap() {
  return Object.fromEntries(this.permissions.map((grant) => [grant.module, [...grant.actions]]));
};

roleSchema.methods.can = function can(module, action) {
  return this.permissions.some((grant) => grant.module === module && grant.actions.includes(action));
};

export const Role = mongoose.models.Role || mongoose.model('Role', roleSchema);
