import test from 'node:test';
import assert from 'node:assert/strict';
import { readExperienceDraft, saveExperienceDraft } from '../src/experience-drafts.mjs';

test('drafts stay with their user/customer and preserve local attachments across account switches', t => {
  const rows=new Map(),descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)}});
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;});
  const draft={text:'A draft',images:[{name:'private.png',url:'blob:local'}],file:new Blob(['audio']),messages:[{owner:'A:org',serviceId:'standard:service',answer:'done'}]};
  saveExperienceDraft('A:org','text',draft);
  assert.deepEqual(readExperienceDraft('B:org','text'),{});
  assert.deepEqual(readExperienceDraft('A:other-org','text'),{});
  assert.equal(readExperienceDraft('A:org','text').file,draft.file);
  const persisted=JSON.parse(rows.get('moma-5120-draft:A:org:text'));
  assert.equal(persisted.text,'A draft'); assert.equal(persisted.images,undefined);assert.equal(persisted.file,undefined);assert.equal(persisted.messages[0].owner,'A:org');
  saveExperienceDraft('','text',{text:'anonymous'});assert.equal(rows.size,1);
});

test('corrupt drafts and failed storage writes surface errors without replacing persisted data', t => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),rows=new Map([['moma-5120-draft:broken:voice','{invalid']]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>rows.get(key)??null,setItem:()=>{throw Error('quota');}}});
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;});
  assert.throws(()=>readExperienceDraft('broken','voice'));
  assert.throws(()=>saveExperienceDraft('quota','voice',{text:'recover in this tab'}),/quota/);
  assert.equal(rows.get('moma-5120-draft:broken:voice'),'{invalid');
  assert.equal(rows.size,1);
});
