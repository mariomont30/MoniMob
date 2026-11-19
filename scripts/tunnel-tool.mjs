import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root } from './local-config.mjs';

const binary = {
  url: 'https://github.com/cloudflare/cloudflared/releases/download/2026.11.1/cloudflared-windows-amd64.exe',
  sha256: '341deda3db5ec498a0482254d6c38c0b7cf01a30c37bb5dd95d2216d08955e35',
};

export async function ensureTunnelTool() {
  const target = process.env.MONIMOB_CLOUDFLARED || path.join(root, 'tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  try { await fs.access(target); return target; } catch {}
  if (process.env.MONIMOB_CLOUDFLARED || process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Instale cloudflared e informe o caminho em MONIMOB_CLOUDFLARED. Consulte docs/CONFIGURACAO.md.');
  }
  console.log('Preparando cloudflared oficial para Windows x64. Aguarde o download.');
  const response = await fetch(binary.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('Não foi possível baixar cloudflared. Tente novamente.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== binary.sha256) {
    throw new Error('A integridade do cloudflared não foi confirmada. O arquivo não será executado.');
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = target + '.download';
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, target);
  return target;
}
