import { copyFileSync } from 'node:fs';
copyFileSync(new URL('../../mobile-expo/src/domain/monitoring.js', import.meta.url), new URL('../../backend/src/domain/monitoring.js', import.meta.url));

copyFileSync(new URL('../../mobile-expo/src/domain/workflow.js', import.meta.url), new URL('../../backend/src/domain/workflow.js', import.meta.url));
copyFileSync(new URL('../../mobile-expo/src/domain/sessionAuthorization.js', import.meta.url), new URL('../../backend/src/domain/sessionAuthorization.js', import.meta.url));

for (const file of ['favorites.js', 'materialAccess.js']) copyFileSync(new URL('../../mobile-expo/src/domain/' + file, import.meta.url), new URL('../../backend/src/domain/' + file, import.meta.url));

copyFileSync(new URL('../../mobile-expo/src/domain/review.js', import.meta.url), new URL('../../backend/src/domain/review.js', import.meta.url));
