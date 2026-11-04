import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env.js';

// "authenticated" assets cannot be fetched by public URL; every delivery needs a signature.
const DELIVERY_TYPE = 'authenticated';
const RESOURCE_TYPES = new Set(['image', 'raw']);
const UPLOAD_TIMEOUT_MS = 120_000;

let configured = false;

function ensureConfigured() {
  if (configured) return;
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

function resourceTypeOf(value) {
  if (!RESOURCE_TYPES.has(value)) throw new TypeError(`Unsupported resource type "${value}"`);
  return value;
}

export const cloudinaryProvider = {
  name: 'cloudinary',

  isConfigured() {
    return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
  },

  /**
   * file: { buffer, storedName, ext, mimeType, size, originalName, resourceType }.
   * storedName is a server-generated random id; the client filename is never sent.
   */
  upload(file, { folder }) {
    ensureConfigured();
    const resourceType = resourceTypeOf(file.resourceType);
    // Raw public ids keep the extension so downloads have the right type; image ids do not.
    const publicId = resourceType === 'raw' ? `${file.storedName}.${file.ext}` : file.storedName;

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: resourceType,
          type: DELIVERY_TYPE,
          use_filename: false,
          unique_filename: false,
          overwrite: false,
          // Bounds how long a stuck provider call can hold an upload slot (ms).
          timeout: UPLOAD_TIMEOUT_MS,
        },
        (error, result) => {
          if (error) return reject(error);
          return resolve({
            provider: 'cloudinary',
            key: result.public_id,
            resourceType,
            deliveryType: DELIVERY_TYPE,
            format: file.ext,
            mimeType: file.mimeType,
            size: file.size,
            originalName: file.originalName,
          });
        },
      );
      stream.end(file.buffer);
    });
  },

  async remove(key, { resourceType = 'raw' } = {}) {
    ensureConfigured();
    await cloudinary.uploader.destroy(key, {
      resource_type: resourceTypeOf(resourceType),
      type: DELIVERY_TYPE,
      invalidate: true,
    });
  },

  /** Signed, expiring download link. Only call after the caller's access was authorised. */
  getSignedUrl(key, { resourceType = 'raw', format, expiresInSeconds }) {
    ensureConfigured();
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const type = resourceTypeOf(resourceType);
    const url = cloudinary.utils.private_download_url(key, type === 'raw' ? '' : format, {
      resource_type: type,
      type: DELIVERY_TYPE,
      expires_at: expiresAt,
      attachment: true,
    });
    return { url, expiresAt: new Date(expiresAt * 1000) };
  },
};
