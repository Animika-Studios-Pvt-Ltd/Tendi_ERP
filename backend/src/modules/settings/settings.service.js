import { CompanySettings } from '../../models/CompanySettings.js';

export function toSettingsDto(doc) {
  const s = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(s._id),
    companyProfile: s.companyProfile,
    preferences: s.preferences,
    numberingSeries: s.numberingSeries,
    approvalLimits: s.approvalLimits,
    masterData: s.masterData,
    updatedAt: s.updatedAt,
  };
}

export async function getSettings() {
  const doc = await CompanySettings.getSettings();
  return toSettingsDto(doc);
}

export async function updateSettings(user, input) {
  const doc = await CompanySettings.getSettings();

  if (input.companyProfile) {
    doc.companyProfile = { ...doc.companyProfile.toObject(), ...input.companyProfile };
  }

  if (input.preferences) {
    doc.preferences = { ...doc.preferences.toObject(), ...input.preferences };
  }

  if (input.numberingSeries) {
    const existingSeries = doc.numberingSeries.toObject();
    for (const [key, rule] of Object.entries(input.numberingSeries)) {
      if (rule) {
        existingSeries[key] = { ...existingSeries[key], ...rule };
      }
    }
    doc.numberingSeries = existingSeries;
  }

  if (input.approvalLimits) {
    doc.approvalLimits = input.approvalLimits;
  }

  if (input.masterData) {
    const existingMaster = doc.masterData.toObject();
    if (input.masterData.units) {
      existingMaster.units = [...new Set(input.masterData.units)];
    }
    if (input.masterData.materialCategories) {
      existingMaster.materialCategories = [...new Set(input.masterData.materialCategories)];
    }
    if (input.masterData.costHeads) {
      existingMaster.costHeads = [...new Set(input.masterData.costHeads)];
    }
    doc.masterData = existingMaster;
  }

  doc.updatedBy = user._id;
  await doc.save();

  return toSettingsDto(doc);
}

