import './setup-upload-env.js';
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getActiveUploadCount } from '../src/middleware/upload.js';
import { resolveFolder } from '../src/services/storage/index.js';
import * as fx from './helpers/fixtures.js';
import {
  addFileRecord,
  buildUploadApp,
  cloudinaryBehaviour,
  cloudinaryCalls,
  installMocks,
  projectA,
  projectB,
  resetCalls,
  seenRequests,
  tokenFor,
  users,
} from './helpers/uploadApp.js';

const KB = 1024;
let server;
let port;
let baseUrl;

before(async () => {
  installMocks();
  server = buildUploadApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
  resetCalls();
  seenRequests.length = 0;
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const auth = (user) => ({ authorization: `Bearer ${tokenFor(user)}` });

function form(files, fields = {}, field = 'files') {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  for (const { name, data, type } of files) body.append(field, new Blob([data], { type }), name);
  return body;
}

async function upload(files, { user = users.admin, fields, field, headers } = {}) {
  const res = await fetch(`${baseUrl}/documents`, {
    method: 'POST',
    headers: { ...(user ? auth(user) : {}), ...headers },
    body: form(files, fields, field),
  });
  return { status: res.status, body: await res.json() };
}

async function expectRejected(files, status, code, options) {
  const { status: actual, body } = await upload(files, options);
  assert.equal(actual, status, `expected ${status} ${code}, got ${actual} ${JSON.stringify(body)}`);
  assert.equal(body.success, false);
  assert.equal(body.error.code, code);
  assert.equal(body.error.debug, undefined, 'no stack/debug details');
  assert.equal(cloudinaryCalls.uploads.length, 0, 'nothing reached storage');
  return body;
}

const paddedPdf = (bytes) =>
  Buffer.concat([Buffer.from('%PDF-1.4\n%', 'latin1'), Buffer.alloc(bytes, 0x41), Buffer.from('\ntrailer\n%%EOF\n', 'latin1')]);

describe('1-3. valid uploads', () => {
  it('stores a valid PDF privately under a random server-side name', async () => {
    const { status, body } = await upload([{ name: 'Site Report.pdf', data: fx.pdf(), type: fx.MIME.pdf }], {
      fields: { project: String(projectA) },
    });
    assert.equal(status, 201, JSON.stringify(body));
    const [stored] = body.data.files;
    assert.equal(stored.mimeType, fx.MIME.pdf);
    assert.equal(stored.originalName, 'Site Report.pdf');
    assert.equal(stored.deliveryType, 'authenticated');
    assert.equal(stored.scanStatus, 'not_scanned');
    assert.equal(stored.url, undefined, 'no public URL is returned');
    assert.ok(!JSON.stringify(body).includes('should-not-leak'));

    const [{ options, bytes }] = cloudinaryCalls.uploads;
    assert.equal(options.type, 'authenticated');
    assert.equal(options.resource_type, 'raw');
    assert.equal(options.folder, `tendi-test/documents/${projectA}`);
    assert.match(options.public_id, /^[a-f0-9]{32}\.pdf$/);
    assert.equal(options.use_filename, false);
    assert.equal(options.overwrite, false);
    assert.ok(!JSON.stringify(options).includes('Site Report'), 'original filename never sent to storage');
    assert.equal(bytes, fx.pdf().length);
  });

  for (const [name, kind] of [
    ['photo.jpg', 'jpeg'],
    ['photo.JPEG', 'jpeg'],
    ['plan.png', 'png'],
    ['plan.webp', 'webp'],
  ]) {
    it(`accepts ${name} as an image resource`, async () => {
      const { status, body } = await upload([{ name, data: fx[kind](), type: fx.MIME[kind] }]);
      assert.equal(status, 201, JSON.stringify(body));
      assert.equal(cloudinaryCalls.uploads[0].options.resource_type, 'image');
      assert.match(cloudinaryCalls.uploads[0].options.public_id, /^[a-f0-9]{32}$/);
    });
  }

  for (const kind of ['docx', 'xlsx', 'doc', 'xls']) {
    it(`accepts a genuine ${kind.toUpperCase()}`, async () => {
      const { status, body } = await upload([{ name: `boq.${kind}`, data: fx[kind](), type: fx.MIME[kind] }]);
      assert.equal(status, 201, JSON.stringify(body));
      assert.match(cloudinaryCalls.uploads[0].options.public_id, new RegExp(`^[a-f0-9]{32}\\.${kind}$`));
    });
  }

  it('accepts several files in one request up to the limit', async () => {
    const files = ['a.pdf', 'b.pdf', 'c.pdf'].map((name) => ({ name, data: fx.pdf(), type: fx.MIME.pdf }));
    const { status } = await upload(files);
    assert.equal(status, 201);
    const ids = cloudinaryCalls.uploads.map((call) => call.options.public_id);
    assert.equal(new Set(ids).size, 3, 'every file gets its own random name');
  });
});

describe('4. unsupported extensions', () => {
  for (const name of ['setup.exe', 'invoice.pdf.exe', 'drawing.svg', 'page.html', 'archive.zip', 'script.js', 'README', '.pdf']) {
    it(`rejects "${name}"`, () =>
      expectRejected([{ name, data: fx.pdf(), type: 'application/octet-stream' }], 415, 'UNSUPPORTED_FILE_TYPE'));
  }

  it('rejects a format outside the per-route allowlist', async () => {
    // FILE_TYPES.documents includes PDFs; a route limited to images must not.
    const { createUpload, FILE_TYPES } = await import('../src/middleware/upload.js');
    const { checkDeclaredType } = await import('../src/services/upload/fileValidation.js');
    assert.ok(createUpload({ allowedTypes: FILE_TYPES.images }));
    assert.equal(checkDeclaredType({ originalname: 'a.pdf', mimetype: fx.MIME.pdf }, FILE_TYPES.images).code, 'UNSUPPORTED_FILE_TYPE');
  });
});

describe('5. MIME type spoofing', () => {
  it('rejects a declared MIME type that does not match the extension', () =>
    expectRejected([{ name: 'report.pdf', data: fx.pdf(), type: 'image/png' }], 415, 'MIME_TYPE_MISMATCH'));

  it('rejects a generic octet-stream declaration for an allowed extension', () =>
    expectRejected([{ name: 'report.pdf', data: fx.pdf(), type: 'application/octet-stream' }], 415, 'MIME_TYPE_MISMATCH'));

  it('rejects an executable disguised with a matching extension and MIME type', () =>
    expectRejected([{ name: 'report.pdf', data: Buffer.from('MZ\x90\x00\x03\x00\x00\x00PE\0\0', 'latin1'), type: fx.MIME.pdf }], 415, 'INVALID_FILE_SIGNATURE'));

  it('rejects HTML/script content declared as an image', () =>
    expectRejected([{ name: 'avatar.png', data: Buffer.from('<html><script>alert(1)</script></html>'), type: fx.MIME.png }], 415, 'INVALID_FILE_SIGNATURE'));
});

describe('6. extension and content mismatch', () => {
  it('rejects PNG bytes named .jpg', () =>
    expectRejected([{ name: 'photo.jpg', data: fx.png(), type: fx.MIME.jpeg }], 415, 'FILE_CONTENT_MISMATCH'));

  it('rejects a PDF named .docx', () =>
    expectRejected([{ name: 'contract.docx', data: fx.pdf(), type: fx.MIME.docx }], 415, 'FILE_CONTENT_MISMATCH'));

  it('rejects a DOCX named .xlsx', () =>
    expectRejected([{ name: 'sheet.xlsx', data: fx.docx(), type: fx.MIME.xlsx }], 415, 'FILE_CONTENT_MISMATCH'));

  it('rejects an arbitrary ZIP named .docx', () =>
    expectRejected([{ name: 'contract.docx', data: fx.zip([{ name: 'payload.txt', data: 'hello' }]), type: fx.MIME.docx }], 415, 'FILE_CONTENT_MISMATCH'));

  it('rejects an XLS compound file named .doc', () =>
    expectRejected([{ name: 'letter.doc', data: fx.xls(), type: fx.MIME.doc }], 400, 'MALFORMED_FILE'));
});

describe('7. invalid file signatures', () => {
  it('rejects random bytes named .pdf', () =>
    expectRejected([{ name: 'scan.pdf', data: Buffer.alloc(2048, 0x5a), type: fx.MIME.pdf }], 415, 'INVALID_FILE_SIGNATURE'));

  it('rejects random bytes named .webp', () =>
    expectRejected([{ name: 'img.webp', data: Buffer.from('RIFF0000AVI LIST', 'latin1'), type: fx.MIME.webp }], 415, 'INVALID_FILE_SIGNATURE'));

  it('rejects a truncated PDF without an end-of-file marker', () =>
    expectRejected([{ name: 'scan.pdf', data: Buffer.from('%PDF-1.7\n1 0 obj\n<<', 'latin1'), type: fx.MIME.pdf }], 400, 'MALFORMED_FILE'));
});

describe('8. empty files', () => {
  it('rejects a zero-byte file', () => expectRejected([{ name: 'empty.pdf', data: Buffer.alloc(0), type: fx.MIME.pdf }], 400, 'EMPTY_FILE'));

  it('rejects a request with no file', async () => {
    const { status, body } = await upload([], { fields: { project: String(projectA) } });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'NO_FILE');
  });
});

describe('9. size limits', () => {
  it('rejects a single file over MAX_UPLOAD_SIZE_MB', () =>
    expectRejected([{ name: 'big.pdf', data: paddedPdf(70 * KB), type: fx.MIME.pdf }], 413, 'FILE_TOO_LARGE'));

  it('rejects files that together exceed MAX_UPLOAD_TOTAL_MB', () =>
    expectRejected(
      ['a.pdf', 'b.pdf', 'c.pdf'].map((name) => ({ name, data: paddedPdf(50 * KB), type: fx.MIME.pdf })),
      413,
      'UPLOAD_TOO_LARGE',
    ));

  function rawRequest(headers, body = '') {
    return new Promise((resolve, reject) => {
      const req = http.request({ port, method: 'POST', path: '/documents', headers: { ...auth(users.admin), ...headers } }, (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
      });
      req.on('error', reject);
      req.end(body);
    });
  }

  it('rejects a declared Content-Length beyond the aggregate limit before reading the body', async () => {
    // Only a few bytes of the declared 50 MB are ever sent; the server must answer anyway.
    const { status, body } = await new Promise((resolve) => {
      const headers = { ...auth(users.admin), 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(50 * 1024 * 1024) };
      const req = http.request({ port, method: 'POST', path: '/documents', headers }, (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => {
          req.destroy();
          resolve({ status: res.statusCode, body: JSON.parse(text) });
        });
      });
      req.on('error', () => {});
      req.write('--x\r\n');
    });
    assert.equal(status, 413);
    assert.equal(body.error.code, 'UPLOAD_TOO_LARGE');
  });

  it('rejects chunked uploads without a declared length', async () => {
    const { status, body } = await rawRequest({ 'content-type': 'multipart/form-data; boundary=x', 'transfer-encoding': 'chunked' }, '--x--\r\n');
    assert.equal(status, 411);
    assert.equal(body.error.code, 'LENGTH_REQUIRED');
  });

  it('rejects non-multipart bodies', async () => {
    const { status, body } = await rawRequest({ 'content-type': 'application/json', 'content-length': '2' }, '{}');
    assert.equal(status, 415);
    assert.equal(body.error.code, 'MALFORMED_UPLOAD');
  });

  it('rejects a multipart body that ends early', async () => {
    const partial = '--x\r\nContent-Disposition: form-data; name="files"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4';
    const { status, body } = await rawRequest({ 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(partial.length) }, partial);
    assert.equal(status, 400);
    assert.equal(body.error.code, 'MALFORMED_UPLOAD');
  });
});

describe('10. file count limits', () => {
  it('rejects more than MAX_UPLOAD_FILES files', () =>
    expectRejected(
      ['a', 'b', 'c', 'd'].map((n) => ({ name: `${n}.pdf`, data: fx.pdf(), type: fx.MIME.pdf })),
      400,
      'TOO_MANY_FILES',
    ));

  it('rejects files sent in an unexpected field', () =>
    expectRejected([{ name: 'a.pdf', data: fx.pdf(), type: fx.MIME.pdf }], 400, 'UNEXPECTED_FILE_FIELD', { field: 'avatar' }));
});

describe('11. malformed Office files', () => {
  const docxCase = (title, data, status = 400, code = 'MALFORMED_FILE') =>
    it(title, () => expectRejected([{ name: 'contract.docx', data, type: fx.MIME.docx }], status, code));

  docxCase('rejects a DOCX without word/document.xml', fx.docx({ omit: ['word/document.xml'] }));
  docxCase('rejects a DOCX without _rels/.rels', fx.docx({ omit: ['_rels/.rels'] }));
  docxCase('rejects a DOCX whose main part has the wrong content type', fx.docx({ mainType: 'application/xml' }), 415, 'FILE_CONTENT_MISMATCH');
  docxCase('rejects a truncated DOCX', fx.docx().subarray(0, 120), 415, 'FILE_CONTENT_MISMATCH');
  docxCase('rejects a DOCX with a "../" entry (zip slip)', fx.docx({ extraEntries: [{ name: '../../evil.sh', data: 'x' }] }));
  docxCase(
    'rejects a DOCX with an extreme compression ratio (zip bomb)',
    fx.docx({ extraEntries: [{ name: 'word/media/bomb.bin', data: Buffer.alloc(4 * 1024 * 1024, 0), deflate: true }] }),
  );
  docxCase(
    'rejects a DOCX carrying a VBA macro project',
    fx.docx({ extraEntries: [{ name: 'word/vbaProject.bin', data: 'vba' }] }),
    415,
    'UNSUPPORTED_FILE_TYPE',
  );
  docxCase('rejects a password-encrypted package named .docx', fx.doc({ EncryptionInfo: 'x', EncryptedPackage: 'y' }), 415, 'FILE_CONTENT_MISMATCH');

  it('rejects an XLSX that is really a DOCX package', () =>
    expectRejected([{ name: 'sheet.xlsx', data: fx.docx(), type: fx.MIME.xlsx }], 415, 'FILE_CONTENT_MISMATCH'));

  it('rejects an OLE file without a WordDocument stream named .doc', () =>
    expectRejected([{ name: 'letter.doc', data: fx.xls().subarray(0), type: fx.MIME.doc }], 400, 'MALFORMED_FILE'));

  it('rejects an XLS with a VBA macro storage', () =>
    expectRejected([{ name: 'rates.xls', data: fx.xls({ _VBA_PROJECT_CUR: 'vba' }), type: fx.MIME.xls }], 415, 'UNSUPPORTED_FILE_TYPE'));

  it('rejects a damaged OLE container', () =>
    expectRejected([{ name: 'letter.doc', data: fx.doc().subarray(0, 600), type: fx.MIME.doc }], 400, 'MALFORMED_FILE'));
});

describe('12. filename and path traversal', () => {
  it('rejects a NUL byte in the multipart filename header as a malformed upload', () =>
    expectRejected([{ name: 'na\u0000me.pdf', data: fx.pdf(), type: fx.MIME.pdf }], 400, 'MALFORMED_UPLOAD'));

  it('sanitises display names: no directories, control characters or leading dots', async () => {
    const { sanitizeDisplayName } = await import('../src/services/upload/fileValidation.js');
    assert.equal(sanitizeDisplayName('../../etc/passwd.pdf'), 'passwd.pdf');
    assert.equal(sanitizeDisplayName('..\\..\\boot.ini.pdf'), 'boot.ini.pdf');
    assert.equal(sanitizeDisplayName('re\u0000po\u0007rt.pdf'), 'report.pdf');
    assert.equal(sanitizeDisplayName('invoice\u202efdp.exe'), 'invoicefdp.exe', 'bidi override removed');
    assert.equal(sanitizeDisplayName('..'), 'file');
    assert.equal(sanitizeDisplayName('a<b>:"c|?*.pdf'), 'a_b___c___.pdf');
    assert.ok(sanitizeDisplayName(`${'x'.repeat(500)}.pdf`).endsWith('.pdf'));
    assert.ok(sanitizeDisplayName(`${'x'.repeat(500)}.pdf`).length <= 200);
  });

  for (const name of ['../../etc/passwd.pdf', '..\\..\\windows\\system32\\evil.pdf', '/var/www/html/shell.pdf', 'C:\\temp\\x.pdf', 'साइट रिपोर्ट.pdf']) {
    it(`never uses "${JSON.stringify(name)}" as a storage path`, async () => {
      const { status, body } = await upload([{ name, data: fx.pdf(), type: fx.MIME.pdf }], { fields: { project: String(projectA) } });
      assert.equal(status, 201, JSON.stringify(body));
      const { options } = cloudinaryCalls.uploads[0];
      assert.match(options.public_id, /^[a-f0-9]{32}\.pdf$/);
      assert.equal(options.folder, `tendi-test/documents/${projectA}`);
      const display = body.data.files[0].originalName;
      assert.ok(!/[/\\\u0000-\u001f]/.test(display), `display name is sanitised: ${display}`);
      assert.ok(!display.startsWith('.'));
    });
  }

  it('keeps non-ASCII display names intact', async () => {
    const { body } = await upload([{ name: 'साइट रिपोर्ट.pdf', data: fx.pdf(), type: fx.MIME.pdf }]);
    assert.equal(body.data.files[0].originalName, 'साइट रिपोर्ट.pdf');
  });

  it('client-supplied project ids cannot inject folder paths', async () => {
    const { status } = await upload([{ name: 'a.pdf', data: fx.pdf(), type: fx.MIME.pdf }], { fields: { project: '../../other' } });
    assert.equal(status, 404);
    assert.equal(cloudinaryCalls.uploads.length, 0);
  });

  it('server-side folder validation rejects traversal', () => {
    for (const folder of ['../x', 'documents/../../x', '/abs', 'a\\b', '', 'documents/']) {
      assert.throws(() => resolveFolder(folder), TypeError, folder);
    }
    assert.equal(resolveFolder(`documents/${projectA}`), `tendi-test/documents/${projectA}`);
  });
});

describe('13. unauthorized uploads', () => {
  it('rejects an anonymous upload with 401 before buffering', () =>
    expectRejected([{ name: 'a.pdf', data: fx.pdf(), type: fx.MIME.pdf }], 401, 'UNAUTHENTICATED', { user: null }));

  it('rejects an invalid token', () =>
    expectRejected([{ name: 'a.pdf', data: fx.pdf(), type: fx.MIME.pdf }], 401, 'UNAUTHENTICATED', { user: null, headers: { authorization: 'Bearer not-a-jwt' } }));

  it('rejects a role without documents:create (customer portal)', () =>
    expectRejected([{ name: 'a.pdf', data: fx.pdf(), type: fx.MIME.pdf }], 403, 'FORBIDDEN', { user: users.customerA }));

  it('rejects a role without any documents permission', () =>
    expectRejected([{ name: 'a.pdf', data: fx.pdf(), type: fx.MIME.pdf }], 403, 'FORBIDDEN', { user: users.noDocuments }));

  it('rejects uploading into a project the user is not assigned to', () =>
    expectRejected([{ name: 'a.pdf', data: fx.pdf(), type: fx.MIME.pdf }], 404, 'NOT_FOUND', { user: users.pmA, fields: { project: String(projectB) } }));

  it('allows uploading into an assigned project', async () => {
    const { status } = await upload([{ name: 'a.pdf', data: fx.pdf(), type: fx.MIME.pdf }], { user: users.pmA, fields: { project: String(projectA) } });
    assert.equal(status, 201);
  });
});

async function download(id, user) {
  const res = await fetch(`${baseUrl}/documents/${id}/download`, { headers: user ? auth(user) : {} });
  return { status: res.status, headers: res.headers, body: await res.json() };
}

describe('14. unauthorized downloads', () => {
  let fileId;
  before(() => {
    fileId = addFileRecord({ project: projectA, uploadedBy: users.pmA });
  });

  it('rejects anonymous downloads', async () => {
    const { status, body } = await download(fileId);
    assert.equal(status, 401);
    assert.equal(body.data, undefined);
  });

  it('rejects a role without documents:read', async () => {
    assert.equal((await download(fileId, users.noDocuments)).status, 403);
  });

  it('rejects malformed identifiers without touching storage', async () => {
    for (const id of ['abc', '../../etc/passwd', '0'.repeat(25), '{"$ne":null}']) {
      const { status } = await download(encodeURIComponent(id), users.admin);
      assert.equal(status, 404, id);
    }
  });

  it('returns 404 for an unknown but well-formed id', async () => {
    assert.equal((await download('0123456789abcdef01234567', users.admin)).status, 404);
  });
});

describe('15. cross-project and cross-owner access (IDOR/BOLA)', () => {
  let fileInA;
  let fileInB;
  let unscopedByPmB;
  let customerAFile;

  before(() => {
    fileInA = addFileRecord({ project: projectA, uploadedBy: users.pmA });
    fileInB = addFileRecord({ project: projectB, uploadedBy: users.pmB });
    unscopedByPmB = addFileRecord({ project: null, uploadedBy: users.pmB });
    customerAFile = addFileRecord({ project: projectA, uploadedBy: users.pmA, owner: { customer: users.customerA.customer } });
  });

  it('an assigned user gets a short-lived signed URL for a file in their project', async () => {
    const { status, headers, body } = await download(fileInA, users.pmA);
    assert.equal(status, 200);
    assert.equal(headers.get('cache-control'), 'no-store');
    const url = new URL(body.data.url);
    assert.equal(url.hostname, 'api.cloudinary.com');
    const expiresAt = Number(url.searchParams.get('expires_at'));
    const ttl = expiresAt - Math.floor(Date.now() / 1000);
    assert.ok(ttl > 0 && ttl <= 120, `expires in ${ttl}s`);
    assert.ok(url.searchParams.get('signature'));
    assert.equal(url.searchParams.get('type'), 'authenticated');
    const text = JSON.stringify(body);
    assert.ok(!text.includes('test-only-cloudinary-secret-value'), 'API secret never returned');
    assert.equal(body.data.key, undefined);
    assert.equal(body.data.provider, undefined);
  });

  it('a user assigned to project A cannot fetch a project B file by changing the id', async () => {
    const { status, body } = await download(fileInB, users.pmA);
    assert.equal(status, 404);
    assert.equal(body.data, undefined);
  });

  it('a user assigned to project B cannot fetch a project A file', async () => {
    assert.equal((await download(fileInA, users.pmB)).status, 404);
  });

  it('a company-wide role can read files in every project', async () => {
    assert.equal((await download(fileInB, users.admin)).status, 200);
  });

  it('files outside any project are private to their uploader for scoped roles', async () => {
    assert.equal((await download(unscopedByPmB, users.pmA)).status, 404);
    assert.equal((await download(unscopedByPmB, users.pmB)).status, 200);
  });

  it('a portal customer can read their own file but not another customer\'s in the same project', async () => {
    assert.equal((await download(customerAFile, users.customerA)).status, 200);
    assert.equal((await download(customerAFile, users.customerB)).status, 404);
    assert.equal((await download(fileInA, users.customerA)).status, 404, 'project file not owned by the customer');
  });
});

describe('16. cleanup after failures', () => {
  it('releases buffers and the concurrency slot after a validation failure', async () => {
    await expectRejected([{ name: 'a.pdf', data: fx.png(), type: fx.MIME.pdf }], 415, 'FILE_CONTENT_MISMATCH');
    const [req] = seenRequests;
    assert.equal(req.files, undefined, 'req.files removed');
    assert.equal(req.file, undefined);
    await delay(20);
    assert.equal(getActiveUploadCount(), 0);
  });

  it('releases buffers after a successful upload once the response ends', async () => {
    await upload([{ name: 'a.pdf', data: fx.pdf(), type: fx.MIME.pdf }]);
    await delay(20);
    assert.equal(seenRequests[0].files, undefined);
    assert.equal(getActiveUploadCount(), 0);
  });

  it('rolls back already-stored files when a later file fails to store, without leaking provider errors', async () => {
    cloudinaryBehaviour.failOnUploadNumber = 2;
    const { status, body } = await upload(['a.pdf', 'b.pdf'].map((name) => ({ name, data: fx.pdf(), type: fx.MIME.pdf })));
    assert.equal(status, 502);
    assert.equal(body.error.code, 'UPLOAD_FAILED');
    const text = JSON.stringify(body);
    assert.ok(!/signature|api_key|000000000000000/i.test(text), 'provider response not exposed');

    assert.equal(cloudinaryCalls.uploads.length, 2);
    assert.equal(cloudinaryCalls.destroys.length, 1, 'first stored file removed');
    const firstKey = `${cloudinaryCalls.uploads[0].options.folder}/${cloudinaryCalls.uploads[0].options.public_id}`;
    assert.equal(cloudinaryCalls.destroys[0].key, firstKey);
    assert.equal(cloudinaryCalls.destroys[0].options.type, 'authenticated');
    await delay(20);
    assert.equal(getActiveUploadCount(), 0);
  });

  it('caps concurrent uploads and frees slots when clients disconnect', async () => {
    const hold = () => {
      const req = http.request({
        port,
        method: 'POST',
        path: '/documents',
        headers: { ...auth(users.admin), 'content-type': 'multipart/form-data; boundary=x', 'content-length': '4096' },
      });
      req.on('error', () => {});
      req.write('--x\r\nContent-Disposition: form-data; name="files"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-');
      return req;
    };
    const held = [hold(), hold()];
    for (let i = 0; i < 50 && getActiveUploadCount() < 2; i += 1) await delay(20);
    assert.equal(getActiveUploadCount(), 2);

    const res = await fetch(`${baseUrl}/documents`, { method: 'POST', headers: auth(users.admin), body: form([{ name: 'a.pdf', data: fx.pdf(), type: fx.MIME.pdf }]) });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, 'UPLOAD_BUSY');
    assert.equal(res.headers.get('retry-after'), '5');

    for (const req of held) req.destroy();
    for (let i = 0; i < 50 && getActiveUploadCount() > 0; i += 1) await delay(20);
    assert.equal(getActiveUploadCount(), 0);
  });

  it('security logs omit original filenames and file contents', async (t) => {
    const lines = [];
    t.mock.method(console, 'warn', (...args) => lines.push(args.join(' ')));
    await upload([{ name: 'salary-of-ramesh-kumar.pdf', data: Buffer.from('TOP-SECRET-CONTENT'), type: fx.MIME.pdf }]);
    assert.ok(lines.some((line) => line.includes('upload.rejected')));
    assert.ok(lines.every((line) => !line.includes('ramesh') && !line.includes('TOP-SECRET')));
  });
});
