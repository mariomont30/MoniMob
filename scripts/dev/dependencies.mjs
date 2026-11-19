import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { root } from './local-config.mjs';
export function dependencyLockMismatches(expected, installed) {
  return Object.entries(installed.packages || {}).filter(([name, item]) => name && (
    !expected.packages?.[name] || expected.packages[name].version !== item.version
    || (expected.packages[name].integrity && item.integrity && expected.packages[name].integrity !== item.integrity)
  )).map(([name]) => name);
}
export function missingDependencies(folder) {
  if (!['backend', 'mobile-expo'].includes(folder)) throw new Error('Pasta de dependências inválida.');
  const directory = path.join(root, folder);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const expected = { ...manifest.dependencies, ...manifest.devDependencies };
  const missing = Object.keys(expected).filter(name => !fs.existsSync(path.join(directory, 'node_modules', name, 'package.json')));
  if (missing.length) return missing;
  try {
    const expectedLock = JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
    const installedLock = JSON.parse(fs.readFileSync(path.join(directory, 'node_modules', '.package-lock.json'), 'utf8'));
    if (dependencyLockMismatches(expectedLock, installedLock).length) return ['dependências diferentes do package-lock.json'];
  } catch { return ['registro da instalação ausente ou inválido']; }
  if (folder === 'backend') {
    const probe = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('firebase-admin/app'); await import('firebase-admin/firestore');"], { cwd: directory, stdio: 'ignore', windowsHide: true });
    if (probe.status !== 0) return ['firebase-admin ou suas dependências'];
  } else {
    const require = createRequire(path.join(directory, 'package.json'));
    for (const [name, from] of [['@react-native/gradle-plugin/package.json', 'react-native/package.json'], ['expo-modules-autolinking/package.json', 'expo/package.json']]) {
      try { require.resolve(name, { paths: [require.resolve(from)] }); } catch { missing.push(name); }
    }
  }
  return missing;
}
export async function ensureDependencies({ includeMobile = true } = {}) {
  const folders = (includeMobile ? ['backend', 'mobile-expo'] : ['backend']).filter(folder => missingDependencies(folder).length);
  if (!folders.length) return;
  console.log('Dependências ausentes ou incompletas: ' + folders.join(', ') + '.');
  console.log('Preparando a instalação automaticamente. Aguarde antes de executar outro comando de instalação.');
  if (!process.env.npm_execpath) throw new Error('Execute npm.cmd run iniciar na raiz do MoniMob.');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/dev/install-local.mjs'), ...folders.map(folder => '--only=' + folder)], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('A instalação automática não terminou. Confira o erro do npm acima; o servidor não foi iniciado.')));
  });
  for (const folder of folders) if (missingDependencies(folder).length) throw new Error('As dependências de ' + folder + ' continuam incompletas. Execute npm.cmd run instalar.');
}
