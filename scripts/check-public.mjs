import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['.git', 'node_modules', '.local-runtime', '.expo', 'coverage']);
const findings = [];
function walk(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).filter(e => !excluded.has(e.name))
    .flatMap(e => e.isDirectory() ? walk(path.join(folder, e.name)) : [path.join(folder, e.name)]);
}
for (const file of walk(root)) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (/(^|\/)(\.env(?:$|\.(?!example$))|credentials\/)|\.(?:pem|p12|pfx|jks|keystore|apk|aab|zip)$/i.test(relative)) findings.push(relative + ': private artifact');
  if (/\.(?:png|jpg|gif|wav|jar|exe)$/i.test(relative)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const patterns = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{80,}?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
    ['Google API key', /\bAIza[A-Za-z0-9_-]{30,}\b/],
    ['npm token', /\bnpm_[A-Za-z0-9]{30,}\b/],
    ['service account', /"type"\s*:\s*"service_account"/],
  ];
  for (const [kind, pattern] of patterns) if (pattern.test(text)) findings.push(relative + ': ' + kind);
}
if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1; }
else console.log('Public source check passed: no forbidden credential artifacts or matching secret patterns.');
