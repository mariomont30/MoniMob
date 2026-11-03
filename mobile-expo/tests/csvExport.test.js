import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCsvFile } from '../src/services/csvExport.js';

test('native sharing waits for a complete UTF-8 CSV file and preserves accents', async () => {
  let release, written, shared=false;
  const operation=exportCsvFile('Disciplina,Código\n"Computação","CC"', {
    timestamp:123, canShare:async()=>true,
    createFile:name=>{assert.equal(name,'monimob-relatorio-123.csv');return {uri:'file:///cache/'+name,write:async value=>{written=value;await new Promise(resolve=>release=resolve);}};},
    shareFile:async(uri,options)=>{shared=true;assert.match(uri,/\.csv$/);assert.equal(options.mimeType,'text/csv');assert.match(written,/Computação/);}
  });
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(shared,false);assert.equal(written.charCodeAt(0),0xFEFF);release();await operation;assert.equal(shared,true);
});
test('unavailable native sharing does not create a misleading export', async()=>{
  await assert.rejects(exportCsvFile('header',{canShare:async()=>false,createFile:()=>assert.fail('should not create a file')}),/não está disponível/);
});
test('a disk-write failure never opens the share chooser', async()=>{
  await assert.rejects(exportCsvFile('header',{canShare:async()=>true,createFile:()=>({write:async()=>{throw new Error('Disk full');}}),shareFile:()=>assert.fail('must not share an incomplete file')}),/Disk full/);
});
test('native sharing errors propagate and an existing BOM is not duplicated', async()=>{
  await assert.rejects(exportCsvFile('\uFEFFheader',{canShare:async()=>true,createFile:()=>({uri:'file:///x.csv',write:async text=>assert.equal(text,'\uFEFFheader')}),shareFile:async()=>{throw new Error('Native failure');}}),/Native failure/);
});
