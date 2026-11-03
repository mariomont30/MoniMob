import test from 'node:test';
import assert from 'node:assert/strict';
import {focusedScrollOffset,multilineBounds} from '../src/services/keyboardLayout.js';

test('Android overlay keyboard uses its real top rather than the unresized window bottom',()=>{
  const next=focusedScrollOffset({offset:200,viewportTop:24,viewportHeight:312,keyboardTop:121,inputTop:168,inputHeight:64});
  assert.equal(168-(next-200)+64,113);
  assert.ok(168-(next-200)>=32);
});
test('an already resized viewport is not reduced by a second full keyboard height',()=>{
  assert.equal(focusedScrollOffset({offset:100,viewportTop:24,viewportHeight:97,keyboardTop:121,inputTop:60,inputHeight:55}),102);
});
test('a visible input is left in place, and an input above the viewport can scroll back into view',()=>{
  assert.equal(focusedScrollOffset({offset:200,viewportTop:24,viewportHeight:312,keyboardTop:121,inputTop:40,inputHeight:55}),200);
  const next=focusedScrollOffset({offset:300,viewportTop:24,viewportHeight:97,keyboardTop:121,inputTop:-100,inputHeight:55});
  assert.equal(-100-(next-300),32);
});
test('scroll correction never requests a negative offset or a movement in an empty viewport',()=>{
  assert.equal(focusedScrollOffset({offset:0,viewportTop:24,viewportHeight:97,keyboardTop:121,inputTop:20,inputHeight:55}),0);
  assert.equal(focusedScrollOffset({offset:80,viewportTop:24,viewportHeight:0,inputTop:20,inputHeight:55}),80);
});
test('focused-field placement stays within the available keyboard band across portrait and landscape geometries',()=>{
  for(const viewportHeight of [97,152,240,420])for(const inputHeight of [50,64,72])for(const inputTop of [-50,60,180,500]){
    const offset=1000,viewportTop=24,keyboardTop=viewportTop+viewportHeight;
    const next=focusedScrollOffset({offset,viewportTop,viewportHeight,keyboardTop,inputTop,inputHeight});
    const actualTop=inputTop-(next-offset);
    assert.ok(actualTop>=32-0.001);
    assert.ok(actualTop+inputHeight<=keyboardTop-8+0.001);
  }
});
test('multiline editors become shorter in a low landscape keyboard viewport and grow back after it closes',()=>{
  assert.deepEqual(multilineBounds(97),{minHeight:73,maxHeight:73});
  assert.deepEqual(multilineBounds(520),{minHeight:110,maxHeight:260});
});
