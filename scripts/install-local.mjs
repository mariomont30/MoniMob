import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './local-config.mjs';
import { missingDependencies } from './dependencies.mjs';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Execute este instalador com npm run instalar.');
const cache = path.join(root, '.local-runtime', 'npm-cache');
const temporary = path.join(root, '.local-runtime', 'tmp');
const env = { ...process.env, npm_config_cache: cache, TEMP: temporary, TMP: temporary, TMPDIR: temporary };
async function install(folder) {
  return new Promise((resolve, reject) => {
    let locked = false, tail = '';
    const child = spawn(process.execPath, [npm, 'ci', '--prefix', folder, '--cache', cache, '--no-audit', '--no-fund'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const forward = output => data => {
      output.write(data);
      tail = (tail + data.toString()).slice(-12000);
      locked ||= /\b(?:EPERM|EBUSY|ENOTEMPTY)\b/.test(tail);
    };
    child.stdout.on('data', forward(process.stdout));
    child.stderr.on('data', forward(process.stderr));
    child.on('error', reject);
    child.on('exit', code => resolve({ code, locked }));
  });
}
async function main() {
  for (const directory of [cache, temporary]) fs.mkdirSync(directory, { recursive: true });
  console.log('Cache e temporários da instalação: ' + path.join(root, '.local-runtime'));
  const requested = process.argv.slice(2).filter(value => value.startsWith('--only=')).map(value => value.slice(7));
  if (requested.some(folder => !['backend', 'mobile-expo'].includes(folder))) throw new Error('Pasta de instalação inválida.');
  for (const folder of requested.length ? [...new Set(requested)] : ['backend', 'mobile-expo']) {
    console.log('Instalando dependências: ' + folder);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await install(folder);
      const missing = result.code === 0 ? missingDependencies(folder) : [];
      if (result.code === 0 && !missing.length) break;
      if (attempt === 0 && (result.locked || missing.length)) {
        console.log('Arquivos bloqueados ou instalação incompleta. Aguardando para repetir a instalação de ' + folder + ' uma única vez.');
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      throw new Error('Instalação de ' + folder + ' não foi concluída' + (missing.length ? ': ' + missing.join(', ') : ' (código ' + result.code + ')') + '. Confira a mensagem do npm acima. Em caso de ENOSPC, verifique o espaço livre no disco do projeto. Se houver EPERM/EBUSY persistente, feche os processos que estejam usando essa pasta antes de repetir.');
    }
    console.log('Dependências verificadas: ' + folder + '.');
  }
  console.log('Instalação concluída. Execute npm run diagnostico e depois npm run iniciar.');
}
main().catch(error => { console.error('MoniMob: ' + error.message); process.exitCode = 1; });
