import test from 'node:test';
import assert from 'node:assert/strict';
import {materialDrawerSide} from '../src/admin-v2/model-material-drawer.js';

test('material drawer opens opposite its trigger for mouse and keyboard entry points',()=>{
  assert.equal(materialDrawerSide({left:200,width:120},2000),'right');
  assert.equal(materialDrawerSide({left:1800,width:60},2000),'left');
  assert.equal(materialDrawerSide({left:990,width:40},2000),'left');
  assert.equal(materialDrawerSide({left:10,width:100},390),'right');
  assert.equal(materialDrawerSide({left:300,width:60},390),'left');
});
