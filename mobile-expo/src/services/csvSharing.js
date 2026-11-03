import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { exportCsvFile } from './csvExport.js';

export function shareCsvReport(csv) {
  return exportCsvFile(csv, {
    createFile: filename => new File(Paths.cache, filename),
    canShare: () => Sharing.isAvailableAsync(),
    shareFile: (uri, options) => Sharing.shareAsync(uri, options)
  });
}
