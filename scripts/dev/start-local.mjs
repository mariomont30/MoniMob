import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig, saveMobileEnv, root, backend, mobile } from './local-config.mjs';
import { ensureDependencies } from './dependencies.mjs';
import { publishConnection } from '../firebase/publish-connection.mjs';
import { ensureTunnelTool } from './tunnel-tool.mjs';
const { backendEnv, mobileEnv, projectId } = loadConfig();
const port = Number(backendEnv.PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT inválida em backend/.env.');
const tools = path.join(root, 'tools'), runtime = path.join(root, '.local-runtime');
fs.mkdirSync(runtime, { recursive: true });
const temporary = path.join(runtime, 'tmp');
fs.mkdirSync(temporary, { recursive: true });
const debuggerCache = path.join(runtime, 'dotslash');
fs.mkdirSync(debuggerCache, { recursive: true });
const expoCache = path.join(runtime, 'expo-cache');
fs.mkdirSync(expoCache, { recursive: true });
const temporaryEnv = { TEMP: temporary, TMP: temporary, TMPDIR: temporary, DOTSLASH_CACHE: debuggerCache, __UNSAFE_EXPO_HOME_DIRECTORY: expoCache };
const env = { ...process.env, ...backendEnv, ...temporaryEnv, FIRESTORE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' };
const tunnelFile = await ensureTunnelTool();
const children = [];
let closing = false;
function start(command, args, options = {}) {
  const child = spawn(command, args, { windowsHide: true, env, ...options });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!closing) { console.error('Um serviço foi encerrado (código ' + code + ').'); stop(code || 1); } });
  return child;
}
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1200).unref();
}
async function health(origin, expectedProject, attempts = 80) {
  for (let index = 0; index < attempts; index++) {
    if (closing) throw new Error('Os serviços foram encerrados.');
    try { const response = await fetch(origin + '/health', { signal: AbortSignal.timeout(2500) }); const body = await response.json(); if (response.ok && body.projectId === expectedProject) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  throw new Error('O servidor não respondeu corretamente: confira a porta e a conexão de internet.');
}
async function main() {
  await ensureDependencies({ includeMobile: !process.argv.includes('--sem-expo') });
  console.log('Iniciando MoniMob — Firebase ' + projectId);
  start(process.execPath, ['src/server.js'], { cwd: backend, stdio: 'inherit' });
  await health('http://127.0.0.1:' + port, projectId);
  start(process.execPath, ['scripts/run-reminders.mjs', '--apply'], { cwd: backend, stdio: 'inherit' });
  console.log('Rotina local de lembretes iniciada, com verificação a cada hora.');
  const output = fs.createWriteStream(path.join(runtime, 'tunnel.log'), { flags: 'w' });
  const tunnel = start(tunnelFile, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:' + port], { stdio: ['ignore', 'pipe', 'pipe'] });
  let url = '', log = '';
  const capture = data => { output.write(data); log = (log + data.toString()).slice(-20000); url ||= log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] || ''; };
  tunnel.stdout.on('data', capture); tunnel.stderr.on('data', capture);
  for (let index = 0; index < 100 && !url && !closing; index++) await new Promise(resolve => setTimeout(resolve, 500));
  if (!url) throw new Error('Não foi possível abrir o túnel HTTPS. Consulte .local-runtime/tunnel.log.');
  await health(url, projectId);
  await publishConnection({ apiUrl: url, projectId, credentialPath: backendEnv.GOOGLE_APPLICATION_CREDENTIALS });
  saveMobileEnv({ ...mobileEnv, EXPO_PUBLIC_MONIMOB_API_URL: url });
  fs.writeFileSync(path.join(runtime, 'conexao.json'), JSON.stringify({ projectId, apiUrl: url, startedAt: new Date().toISOString() }, null, 2));
  console.log('\nSERVIDOR HTTPS: ' + url);
  console.log('Conexão automática publicada e verificada. Expo Go e APK estão prontos, sem copiar endereços.');
  console.log('O computador e este terminal precisam permanecer ligados. Ctrl+C encerra os serviços.\n');
  if (process.argv.includes('--sem-expo')) return console.log('Backend pronto para o APK.');
  const cli = path.join(mobile, 'node_modules/expo/bin/cli');
  if (!fs.existsSync(cli)) throw new Error('Instale as dependências com npm run instalar.');
  start(process.execPath, [cli, 'start', '--go', '--lan', '--clear', '--port', '8081'], { cwd: mobile, stdio: 'inherit', env: { ...process.env, ...mobileEnv, ...temporaryEnv, EXPO_PUBLIC_MONIMOB_API_URL: url, EXPO_PUBLIC_MONIMOB_DEV_PROXY: '1', EXPO_NO_TELEMETRY: '1', MONIMOB_DEV_API_ORIGIN: 'http://127.0.0.1:' + port } });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
main().catch(error => { console.error('MoniMob: ' + error.message); stop(1); });
