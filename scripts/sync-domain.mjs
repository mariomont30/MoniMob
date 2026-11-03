import { copyFileSync } from 'node:fs';
copyFileSync(new URL('../mobile-expo/src/domain/monitoring.js', import.meta.url), new URL('../backend/src/domain/monitoring.js', import.meta.url));
