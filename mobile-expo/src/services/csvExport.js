// Keep report construction in the authorized domain layer. This function only
// prepares the UTF-8 document and hands the completed file to the native chooser.
export async function exportCsvFile(csv, { createFile, canShare, shareFile, timestamp = Date.now() }) {
  if (!await canShare()) throw new Error('O compartilhamento de arquivos não está disponível neste aparelho.');
  const filename = `monimob-relatorio-${timestamp}.csv`;
  const file = createFile(filename);
  await file.write('\uFEFF' + String(csv).replace(/^\uFEFF/, ''), { encoding: 'utf8' });
  await shareFile(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Exportar relatório CSV' });
}
