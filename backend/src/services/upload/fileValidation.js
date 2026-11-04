import { fileTypeFromBuffer } from 'file-type';
import { ApiError } from '../../utils/ApiError.js';
import { inspectLegacyOffice, inspectOoxml } from './officeValidation.js';

/**
 * The only formats the ERP accepts. Each entry ties together the allowed extensions,
 * the single MIME type a client may declare, and what the content must actually be.
 * Adding a format here is a product decision, not a technical one.
 */
export const FILE_TYPE_SPECS = Object.freeze({
  pdf: { mime: 'application/pdf', extensions: ['pdf'], detectedMime: 'application/pdf', resourceType: 'raw' },
  doc: { mime: 'application/msword', extensions: ['doc'], legacyOffice: 'doc', resourceType: 'raw' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    detectedMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ooxml: 'docx',
    resourceType: 'raw',
  },
  xls: { mime: 'application/vnd.ms-excel', extensions: ['xls'], legacyOffice: 'xls', resourceType: 'raw' },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['xlsx'],
    detectedMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ooxml: 'xlsx',
    resourceType: 'raw',
  },
  jpeg: { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], detectedMime: 'image/jpeg', resourceType: 'image' },
  png: { mime: 'image/png', extensions: ['png'], detectedMime: 'image/png', resourceType: 'image' },
  webp: { mime: 'image/webp', extensions: ['webp'], detectedMime: 'image/webp', resourceType: 'image' },
});

const SPEC_BY_EXTENSION = new Map(
  Object.entries(FILE_TYPE_SPECS).flatMap(([kind, spec]) => spec.extensions.map((ext) => [ext, { kind, ...spec }])),
);
const KNOWN_DETECTED_MIMES = new Set(Object.values(FILE_TYPE_SPECS).map((spec) => spec.detectedMime).filter(Boolean));

const MAX_DISPLAY_NAME_LENGTH = 200;

export const UPLOAD_ERROR_CODES = Object.freeze({
  NO_FILE: 'NO_FILE',
  EMPTY_FILE: 'EMPTY_FILE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  MIME_TYPE_MISMATCH: 'MIME_TYPE_MISMATCH',
  FILE_CONTENT_MISMATCH: 'FILE_CONTENT_MISMATCH',
  INVALID_FILE_SIGNATURE: 'INVALID_FILE_SIGNATURE',
  MALFORMED_FILE: 'MALFORMED_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UPLOAD_TOO_LARGE: 'UPLOAD_TOO_LARGE',
  TOO_MANY_FILES: 'TOO_MANY_FILES',
  UNEXPECTED_FILE_FIELD: 'UNEXPECTED_FILE_FIELD',
  MALFORMED_UPLOAD: 'MALFORMED_UPLOAD',
  LENGTH_REQUIRED: 'LENGTH_REQUIRED',
  UPLOAD_BUSY: 'UPLOAD_BUSY',
  UPLOAD_USER_LIMIT: 'UPLOAD_USER_LIMIT',
  UPLOAD_TIMEOUT: 'UPLOAD_TIMEOUT',
  UPLOAD_ABORTED: 'UPLOAD_ABORTED',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
});

const C = UPLOAD_ERROR_CODES;

export function uploadError(status, code, message) {
  return new ApiError(status, message, { code });
}

/**
 * Reduces a client-supplied filename to a display-only label: no directories, no control
 * characters, bounded length. It is never used as a storage key or path.
 */
export function sanitizeDisplayName(originalName) {
  const base = String(originalName ?? '')
    .normalize('NFC')
    .split(/[/\\]/)
    .pop()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    // Bidi overrides let "invoice\u202Efdp.exe" display as "invoiceexe.pdf".
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^[.\s]+/, '')
    .trim();
  if (!base) return 'file';
  if (base.length <= MAX_DISPLAY_NAME_LENGTH) return base;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot) : '';
  return base.slice(0, MAX_DISPLAY_NAME_LENGTH - ext.length) + ext;
}

export function extensionOf(displayName) {
  const dot = displayName.lastIndexOf('.');
  return dot > 0 ? displayName.slice(dot + 1).toLowerCase() : '';
}

const normalizeMime = (mime) =>
  String(mime ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();

/** Cheap pre-buffer check used by Multer's fileFilter: extension and declared MIME only. */
export function checkDeclaredType(file, allowedMimes) {
  const displayName = sanitizeDisplayName(file.originalname);
  const spec = SPEC_BY_EXTENSION.get(extensionOf(displayName));
  if (!spec || !allowedMimes.includes(spec.mime)) {
    return uploadError(415, C.UNSUPPORTED_FILE_TYPE, 'This file type is not allowed');
  }
  if (normalizeMime(file.mimetype) !== spec.mime) {
    return uploadError(415, C.MIME_TYPE_MISMATCH, 'The file type does not match its extension');
  }
  return null;
}

function assertPdfStructure(buffer) {
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw uploadError(415, C.INVALID_FILE_SIGNATURE, 'The file content is not a valid PDF');
  }
  const tail = buffer.subarray(Math.max(0, buffer.length - 1024)).toString('latin1');
  if (!tail.includes('%%EOF')) {
    throw uploadError(400, C.MALFORMED_FILE, 'The PDF file is incomplete or damaged');
  }
}

/**
 * Full validation of a buffered upload. Throws a client-safe ApiError on any problem and
 * otherwise returns the server-trusted description of the file.
 */
export async function validateUploadedFile(file, { allowedMimes }) {
  const { buffer } = file;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || file.size === 0) {
    throw uploadError(400, C.EMPTY_FILE, 'The file is empty');
  }

  const declaredError = checkDeclaredType(file, allowedMimes);
  if (declaredError) throw declaredError;

  const displayName = sanitizeDisplayName(file.originalname);
  const ext = extensionOf(displayName);
  const spec = SPEC_BY_EXTENSION.get(ext);

  let detected;
  try {
    detected = await fileTypeFromBuffer(buffer);
  } catch {
    detected = undefined;
  }

  if (spec.legacyOffice) {
    if (detected?.ext !== 'cfb') {
      throw contentError(detected);
    }
    inspectLegacyOffice(buffer, spec.legacyOffice);
  } else {
    if (detected?.mime !== spec.detectedMime) {
      throw contentError(detected);
    }
    if (spec.kind === 'pdf') assertPdfStructure(buffer);
    if (spec.ooxml) await inspectOoxml(buffer, spec.ooxml);
  }

  return {
    kind: spec.kind,
    ext: spec.kind === 'jpeg' ? 'jpg' : ext,
    mimeType: spec.mime,
    resourceType: spec.resourceType,
    size: buffer.length,
    originalName: displayName,
  };
}

function contentError(detected) {
  // Content is a different format we know (e.g. a PNG named .pdf) vs. unrecognisable bytes.
  if (detected && (KNOWN_DETECTED_MIMES.has(detected.mime) || ['cfb', 'zip'].includes(detected.ext))) {
    return uploadError(415, C.FILE_CONTENT_MISMATCH, 'The file content does not match its extension');
  }
  return uploadError(415, C.INVALID_FILE_SIGNATURE, 'The file content is not a valid file of this type');
}
