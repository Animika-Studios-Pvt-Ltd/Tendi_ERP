import zlib from 'node:zlib';
import CFB from 'cfb';

/* Minimal but genuine files for each accepted format, built in memory. */

export const pdf = () =>
  Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1');

export const png = () =>
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );

export const jpeg = () =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from('JFIF\0', 'latin1'),
    Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    Buffer.alloc(64, 0),
    Buffer.from([0xff, 0xd9]),
  ]);

export const webp = () => {
  const vp8 = Buffer.concat([Buffer.from('VP8L', 'latin1'), Buffer.from([0x0a, 0, 0, 0]), Buffer.from([0x2f, 0, 0, 0, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88])]);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + vp8.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, vp8]);
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Writes a ZIP archive. entries: [{ name, data, deflate? }] */
export function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, deflate = false } of entries) {
    const raw = Buffer.from(data);
    const body = deflate ? zlib.deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

const RELS = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
const contentTypes = (mainType, mainPart, extra = '') =>
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/${mainPart}" ContentType="${mainType}"/>${extra}</Types>`;

export const DOCX_MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
export const XLSX_MAIN = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';

export function docx({ omit = [], extraEntries = [], mainType = DOCX_MAIN, deflate = true } = {}) {
  return zip(
    [
      { name: '[Content_Types].xml', data: contentTypes(mainType, 'word/document.xml') },
      { name: '_rels/.rels', data: RELS },
      { name: 'word/document.xml', data: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>', deflate },
      ...extraEntries,
    ].filter((entry) => !omit.includes(entry.name)),
  );
}

export function xlsx({ omit = [], extraEntries = [], mainType = XLSX_MAIN } = {}) {
  return zip(
    [
      { name: '[Content_Types].xml', data: contentTypes(mainType, 'xl/workbook.xml') },
      { name: '_rels/.rels', data: RELS },
      { name: 'xl/workbook.xml', data: '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>', deflate: true },
      ...extraEntries,
    ].filter((entry) => !omit.includes(entry.name)),
  );
}

function compoundFile(streams) {
  const container = CFB.utils.cfb_new();
  for (const [name, data] of Object.entries(streams)) CFB.utils.cfb_add(container, `/${name}`, Buffer.from(data));
  return Buffer.from(CFB.write(container, { type: 'buffer' }));
}

export const doc = (extra = {}) => compoundFile({ WordDocument: Buffer.alloc(512, 1), ...extra });
export const xls = (extra = {}) => compoundFile({ Workbook: Buffer.alloc(512, 2), ...extra });

export const MIME = Object.freeze({
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
});
