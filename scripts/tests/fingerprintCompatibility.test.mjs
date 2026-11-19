import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const mobileRequire = createRequire(new URL('../../mobile-expo/package.json', import.meta.url));
const { isIgnoredPath, buildPathMatchObjects, isIgnoredPathWithMatchObjects } =
  mobileRequire('@expo/fingerprint/build/utils/Path.js');

test('Expo fingerprint preserves ignored paths and negations with the patched matcher', () => {
  const patterns = [
    '**/node_modules/**', '**/.git/**', '**/*.log', '!src/keep.log',
    'android/build/**', '**/*.{png,jpg}',
  ];
  const cases = [
    ['src/App.js', false],
    ['node_modules/expo/index.js', true],
    ['src/node_modules/test/index.js', true],
    ['.git/config', true],
    ['app.log', true],
    ['src/keep.log', false],
    ['android/build/outputs/app.apk', true],
    ['assets/icon.png', true],
    ['assets/icon.jpg', true],
    ['src/test[1].js', false],
    ['../shared/component.js', false],
  ];
  const matchers = buildPathMatchObjects(patterns);
  for (const [file, expected] of cases) {
    assert.equal(isIgnoredPath(file, patterns), expected, file);
    assert.equal(isIgnoredPathWithMatchObjects(file, matchers), expected, file);
  }
});
