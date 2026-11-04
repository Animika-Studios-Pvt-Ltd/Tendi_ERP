import CFB from 'cfb';
import yauzl from 'yauzl';
import { ApiError } from '../../utils/ApiError.js';

const MAX_ZIP_ENTRIES = 2000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const MAX_CONTENT_TYPES_BYTES = 512 * 1024;

const OOXML_RULES = Object.freeze({
  docx: {
    label: 'Word document',
    mainPart: 'word/document.xml',
    mainContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  },
  xlsx: {
    label: 'Excel workbook',
    mainPart: 'xl/workbook.xml',
    mainContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  },
});

const malformed = (label) => new ApiError(400, `The ${label} is damaged or not a valid Office file`, { code: 'MALFORMED_FILE' });
const macroRejected = (label) =>
  new ApiError(415, `${label}s containing macros are not allowed`, { code: 'UNSUPPORTED_FILE_TYPE' });

function openZip(buffer) {
  return new Promise((resolve, reject) => {
    // yauzl rejects absolute paths, "..", backslashes and inconsistent entry sizes.
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) =>
      error ? reject(error) : resolve(zip),
    );
  });
}

function readEntry(zip, entry, maxBytes) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks = [];
      let total = 0;
      stream.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          stream.destroy(new Error('entry too large'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}

/** Reads the central directory without inflating anything except [Content_Types].xml. */
async function readOoxmlManifest(buffer) {
  const zip = await openZip(buffer);
  if (zip.entryCount > MAX_ZIP_ENTRIES) {
    zip.close();
    throw new Error('too many entries');
  }

  return new Promise((resolve, reject) => {
    const names = new Set();
    let totalUncompressed = 0;
    let contentTypes = null;
    const fail = (error) => {
      zip.close();
      reject(error);
    };

    zip.on('error', fail);
    zip.on('end', () => resolve({ names, contentTypes }));
    zip.on('entry', async (entry) => {
      try {
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new Error('encrypted entry');
        if (![0, 8].includes(entry.compressionMethod)) throw new Error('unsupported compression');
        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) throw new Error('uncompressed size limit');
        if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO) {
          throw new Error('compression ratio limit');
        }
        const name = entry.fileName;
        if (names.has(name)) throw new Error('duplicate entry');
        names.add(name);
        if (name === '[Content_Types].xml') {
          contentTypes = (await readEntry(zip, entry, MAX_CONTENT_TYPES_BYTES)).toString('utf8');
        }
        zip.readEntry();
      } catch (error) {
        fail(error);
      }
    });
    zip.readEntry();
  });
}

/**
 * DOCX/XLSX must be a well-formed ZIP that is really the expected Office package:
 * mandatory parts present, the correct main content type, and no VBA project.
 * An arbitrary ZIP renamed to .docx or .xlsx fails here.
 */
export async function inspectOoxml(buffer, kind) {
  const rules = OOXML_RULES[kind];
  let manifest;
  try {
    manifest = await readOoxmlManifest(buffer);
  } catch {
    throw malformed(rules.label);
  }

  const { names, contentTypes } = manifest;
  if (!contentTypes || !names.has('_rels/.rels') || !names.has(rules.mainPart)) {
    throw malformed(rules.label);
  }
  if (!contentTypes.includes(rules.mainContentType)) {
    throw malformed(rules.label);
  }
  if (/macroEnabled|vbaProject/i.test(contentTypes) || [...names].some((name) => /vbaProject\.bin$/i.test(name))) {
    throw macroRejected(rules.label);
  }
}

const LEGACY_RULES = Object.freeze({
  doc: { label: 'Word document', requiredStreams: ['WordDocument'] },
  xls: { label: 'Excel workbook', requiredStreams: ['Workbook', 'Book'] },
});

/**
 * DOC/XLS share the OLE compound-file container. Parse its directory and require the
 * stream that identifies a Word or Excel file; reject VBA macro storages and
 * password-encrypted OOXML packages (which also use this container).
 */
export function inspectLegacyOffice(buffer, kind) {
  const rules = LEGACY_RULES[kind];
  let container;
  try {
    container = CFB.read(buffer, { type: 'buffer' });
  } catch {
    throw malformed(rules.label);
  }

  const entryNames = new Set((container.FileIndex ?? []).map((entry) => entry.name));
  if (!rules.requiredStreams.some((name) => entryNames.has(name))) {
    throw malformed(rules.label);
  }
  if (entryNames.has('EncryptionInfo') || entryNames.has('EncryptedPackage')) {
    throw malformed(rules.label);
  }
  if (['Macros', '_VBA_PROJECT_CUR', 'VBA', '_VBA_PROJECT'].some((name) => entryNames.has(name))) {
    throw macroRejected(rules.label);
  }
}
