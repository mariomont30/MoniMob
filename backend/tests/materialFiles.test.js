import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { validateMaterialFile } from '../src/materialFiles.js';
import { createMoniMobHandler } from '../src/app.js';
const file = (name, data) => ({
  name,
  data: Buffer.from(data).toString('base64')
});
test('file validation accepts bounded PDF/image/text/Office and rejects forged types and unsafe names', () => {
  for (const [name, bytes] of [['a.pdf', '%PDF-1.7\ntext'], ['a.txt', 'Olá, material'], ['a.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])], ['a.jpg', Buffer.from([255, 216, 255])], ['a.docx', Buffer.from([80, 75, 3, 4])], ['a.pptx', Buffer.from([80, 75, 3, 4])], ['a.xlsx', Buffer.from([80, 75, 3, 4])]]) assert.ok(validateMaterialFile(file(name, bytes)).size > 0);
  for (const input of [null, file('../x.pdf', '%PDF-'), file('x.exe', 'test'), file('x.pdf', 'wrong'), file('x.txt', 'a\0b'), file('x.txt', Buffer.from([255, 254])), {
    name: 'x.txt',
    data: 'a==='
  }, {
    name: 'x.txt',
    data: ''
  }, file('x.txt', Buffer.alloc(5 * 1024 * 1024 + 1, 97))]) assert.throws(() => validateMaterialFile(input));
  assert.equal(validateMaterialFile(file('max.txt', Buffer.alloc(5 * 1024 * 1024, 97))).size, 5 * 1024 * 1024);
});
async function request(handler, {
  url = '/api/materials/upload?role=monitor',
  method = 'POST',
  body = {},
  verified = true,
  roles = ['monitor'],
  token = 'valid.id.token'
} = {}) {
  const headers = {};
  const req = Readable.from(method === 'GET' ? [] : [JSON.stringify(body)]);
  Object.assign(req, {
    method,
    url,
    headers: {
      authorization: token ? 'Bearer ' + token : ''
    },
    socket: {
      remoteAddress: 'unit'
    }
  });
  return new Promise(resolve => handler(req, {
    setHeader: (k, v) => headers[k.toLowerCase()] = v,
    writeHead(status) {
      this.status = status;
    },
    end(data) {
      resolve({
        status: this.status || 200,
        data,
        headers
      });
    }
  }));
}
test('file HTTP routes validate identity, verified email, selected role and body limit before service access', async () => {
  let calls = 0;
  const options = {
    verifyFirebaseToken: async () => ({
      userId: 'm',
      emailVerified: true
    }),
    getFirebaseRoles: async () => ['monitor'],
    materialFileService: {
      upload: async () => {
        calls++;
        return {
          result: {
            id: 'm'
          }
        };
      }
    }
  };
  assert.equal((await request(createMoniMobHandler(options), {
    token: ''
  })).status, 401);
  assert.equal((await request(createMoniMobHandler({
    ...options,
    verifyFirebaseToken: async () => ({
      userId: 'm',
      emailVerified: false
    })
  }))).status, 403);
  assert.equal((await request(createMoniMobHandler(options), {
    url: '/api/materials/upload?role=professor'
  })).status, 403);
  assert.equal((await request(createMoniMobHandler(options), {
    body: {
      data: 'a'.repeat(7 * 1024 * 1024)
    }
  })).status, 413);
  assert.equal(calls, 0);
  assert.equal((await request(createMoniMobHandler(options))).status, 200);
  assert.equal(calls, 1);
});
test('download route returns exact binary and safe content headers; deletion uses file service', async () => {
  const bytes = Buffer.from('%PDF-1.7\nmaterial'),
    handler = createMoniMobHandler({
      verifyFirebaseToken: async () => ({
        userId: 'p',
        emailVerified: true
      }),
      getFirebaseRoles: async () => ['professor'],
      academicService: {
        execute: () => assert.fail('must route through cleanup')
      },
      materialFileService: {
        download: async () => ({
          name: 'Aula de lógica.pdf',
          mimeType: 'application/pdf',
          bytes
        }),
        deleteMaterial: async () => ({
          id: 'm',
          status: 'deleted'
        })
      }
    });
  const result = await request(handler, {
    url: '/api/materials/m/file?role=professor',
    method: 'GET'
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, bytes);
  assert.match(result.headers['content-disposition'], /filename\*=UTF-8/);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['content-type'], 'application/pdf');
  const deletion = await request(handler, {
    url: '/api/actions',
    body: {
      role: 'professor',
      command: {
        action: 'deleteMaterial'
      }
    }
  });
  assert.equal(JSON.parse(deletion.data).result.status, 'deleted');
});
