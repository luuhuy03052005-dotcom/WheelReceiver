import test from 'node:test';
import assert from 'node:assert/strict';
import {RECEIVER_PORT,isManagedReceiverProcess,prepareReceiverPort} from '../port-manager.js';

test('dedicated Receiver port is stable and process takeover is narrowly scoped',()=>{
  assert.equal(RECEIVER_PORT,32178);
  assert.equal(isManagedReceiverProcess({name:'LAN Racing Wheel Receiver.exe'}),true);
  assert.equal(isManagedReceiverProcess({name:'node.exe',commandLine:'node apps/receiver/src/index.js'}),true);
  assert.equal(isManagedReceiverProcess({name:'electron.exe',commandLine:'electron apps/desktop/bundle.cjs'}),true);
  assert.equal(isManagedReceiverProcess({name:'node.exe',commandLine:'node another-server.js'}),false);
  assert.equal(isManagedReceiverProcess({name:'chrome.exe',commandLine:'chrome --remote-debugging-port=32178'}),false);
});

test('invalid Receiver ports are rejected before process inspection',async()=>{
  await assert.rejects(()=>prepareReceiverPort(80),/không hợp lệ/);
  await assert.rejects(()=>prepareReceiverPort(70000),/không hợp lệ/);
});

test('foreign port owners are preserved while stale Wheel owners are released',async()=>{
  const foreignRunner=(_file,_args,_options,callback)=>callback(null,JSON.stringify({processId:444,name:'database.exe',commandLine:'database --port 32178'}));
  await assert.rejects(()=>prepareReceiverPort(RECEIVER_PORT,{runner:foreignRunner}),/không tự ý kết thúc/);

  const calls=[],outputs=[JSON.stringify({processId:555,name:'LAN Racing Wheel Receiver.exe'}),'',''];
  const wheelRunner=(_file,args,_options,callback)=>{calls.push(args.at(-1));callback(null,outputs.shift());};
  const result=await prepareReceiverPort(RECEIVER_PORT,{runner:wheelRunner});
  assert.equal(result.released,true);assert.match(calls[1],/Stop-Process -Id 555/);assert.equal(calls.length,3);
});
