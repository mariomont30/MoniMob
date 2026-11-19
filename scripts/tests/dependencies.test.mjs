import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyLockMismatches } from '../dev/dependencies.mjs';

test('startup detects installed versions and integrity that differ from the delivered lock', () => {
  const expected = { packages: { 'node_modules/firebase': {version:'13.3.0',integrity:'new'}, 'node_modules/platform-only':{version:'1.0.0',optional:true} } };
  assert.deepEqual(dependencyLockMismatches(expected,{packages:{'node_modules/firebase':{version:'13.0.0',integrity:'old'}}}),['node_modules/firebase']);
  assert.deepEqual(dependencyLockMismatches(expected,{packages:{'node_modules/firebase':{version:'13.3.0',integrity:'old'}}}),['node_modules/firebase']);
  assert.deepEqual(dependencyLockMismatches(expected,{packages:{'node_modules/firebase':{version:'13.3.0',integrity:'new'}}}),[]);
});

test('removed dependencies trigger a clean install without requiring optional platform packages', () => {
  const expected={packages:{'node_modules/needed':{version:'1.0.0'},'node_modules/optional':{version:'1.0.0',optional:true}}};
  assert.deepEqual(dependencyLockMismatches(expected,{packages:{'node_modules/needed':{version:'1.0.0'},'node_modules/removed':{version:'1.0.0'}}}),['node_modules/removed']);
});
