import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mobile = fileURLToPath(new URL('../mobile-expo/', import.meta.url));
const cli = fileURLToPath(new URL('../mobile-expo/node_modules/expo/bin/cli', import.meta.url));
const child = spawn(process.execPath, [cli, 'start', ...process.argv.slice(2)], {
  cwd: mobile, stdio: 'inherit',
  env: { ...process.env, MONIMOB_DEV_API_ORIGIN: process.env.MONIMOB_DEV_API_ORIGIN || 'http://127.0.0.1:8787' }
});
child.on('error', () => { console.error('Não foi possível iniciar o Expo. Instale as dependências do aplicativo.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
