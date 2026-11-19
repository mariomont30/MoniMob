import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import { apiRequest } from './academicApi.js';
export const MAX_MATERIAL_BYTES = 5 * 1024 * 1024;
export async function pickMaterialFile() {
  const result = await File.pickFileAsync({ multipleFiles: false, mimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] });
  if (result.canceled) return null;
  const selected = result.result;
  if (!selected) throw new Error('Não foi possível selecionar o arquivo. Tente novamente.');
  if (selected.size > MAX_MATERIAL_BYTES) throw new Error('Selecione um arquivo de até 5 MB.');
  const suffix = {'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','text/plain':'txt','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx'}[selected.type];
  let name;
  try { name = decodeURIComponent(selected.name || '').split('/').pop().split(':').pop().replace(/[\x00-\x1f\\]/g, '_'); } catch { name = ''; }
  if (!/\.(pdf|png|jpe?g|txt|docx|pptx|xlsx)$/i.test(name)) {
    if (!suffix) throw new Error('Use PDF, PNG, JPG, TXT, DOCX, PPTX ou XLSX.');
    name = 'material.' + suffix;
  }
  const operationId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const cache = new File(Paths.cache, 'monimob-upload-' + operationId + '-' + name);
  try {
    // Both the URI grant and cache directory now come from the same native
    // module. Expo Go must not read another experience's unscoped picker cache.
    await selected.copy(cache);
    const size = cache.size;
    if (!Number.isFinite(size) || size <= 0 || size > MAX_MATERIAL_BYTES) throw new Error('Selecione um arquivo de até 5 MB, que não esteja vazio.');
    const data = await cache.base64();
    return { name, size, data, operationId };
  } catch (error) {
    if (/permission|permiss|EACCES|READ/i.test(error?.message || '')) throw new Error('Não foi possível ler o arquivo selecionado. Selecione-o novamente pelo botão Trocar arquivo.');
    throw error;
  } finally { try { await cache.delete(); } catch {} }
}
export async function uploadMaterialFile({
  token,
  role,
  file,
  title,
  disciplineId,
  materialId,
  expectedRevision
}) {
  const submission = JSON.stringify([role, title, disciplineId, materialId, expectedRevision]);
  if (file.submission && file.submission !== submission) file.operationId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  file.submission = submission;
  if (typeof file.data !== 'string' || !file.data) throw new Error('Selecione o arquivo novamente antes de enviar.');
  const data = file.data;
  const response = await apiRequest('/api/materials/upload?role=' + role, {
    token,
    method: 'POST',
    body: {
      operationId: file.operationId,
      name: file.name,
      data,
      title,
      disciplineId,
      materialId,
      expectedRevision
    }
  });
  return response.result;
}
export async function openAcademicMaterial({
  token,
  role,
  material
}) {
  if (!material.fileId) {
    if (!/^https:\/\//i.test(material.url || '')) throw new Error('Este material não possui um endereço seguro disponível.');
    await Linking.openURL(material.url);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('O compartilhamento de arquivos não está disponível neste aparelho.');
  const bytes = await apiRequest('/api/materials/' + encodeURIComponent(material.id) + '/file?role=' + role, {
    token,
    responseType: 'bytes'
  });
  const name = (material.fileName || 'material.pdf').replace(/[^\p{L}\p{N}._-]/gu, '_');
  const file = new File(Paths.cache, Date.now() + '-' + name);
  await file.create({ overwrite: true });
  await file.write(bytes);
  // Android can close its chooser before the receiving app reads the URI.
  // Keep this OS-managed cache file available for that recipient. The app
  // never reuses it: every new opening authorizes and downloads again above.
  await Sharing.shareAsync(file.uri, {
    mimeType: material.mimeType || 'application/octet-stream',
    dialogTitle: material.title
  });
}
