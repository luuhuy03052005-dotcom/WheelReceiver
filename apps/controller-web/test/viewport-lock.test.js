import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {viewportBox,applyViewportBox} from '../public/src/viewport-lock.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.resolve(here,'../public');

test('visual viewport drives a stable integer controller surface',()=>{
  const box=viewportBox({innerWidth:844,innerHeight:390,visualViewport:{width:667.4,height:374.6,offsetLeft:0.2,offsetTop:1.1}});
  assert.deepEqual(box,{width:667,height:375,left:0,top:1});
  const values=new Map(),root={style:{setProperty:(key,value)=>values.set(key,value)}};
  applyViewportBox(root,box);
  assert.equal(values.get('--app-width'),'667px');
  assert.equal(values.get('--app-height'),'375px');
  assert.equal(values.get('--app-top'),'1px');
});

test('mobile connection fields cannot trigger focus zoom',()=>{
  const html=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
  const css=fs.readFileSync(path.join(publicDir,'style.css'),'utf8');
  assert.match(html,/maximum-scale=1/);
  assert.match(html,/user-scalable=no/);
  assert.match(css,/font-size:16px/);
  assert.match(css,/-webkit-text-size-adjust:100%/);
});
