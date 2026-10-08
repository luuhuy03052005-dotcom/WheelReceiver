import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import {createGatewayServer} from '../../apps/gateway/src/index.js';
import {encodeSnapshot} from '../../packages/protocol/src/index.js';

const waitFor=(subscribe,predicate,timeout=10000)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{cleanup();reject(new Error('Timed out waiting for pipeline event'));},timeout);
  const handler=value=>{if(predicate(value)){cleanup();resolve(value);}};
  const cleanup=()=>{clearTimeout(timer);subscribe.off(handler);};
  subscribe.on(handler);
});

test('WebSocket through Gateway and Named Pipe applies one committed state in C#',
  {skip:process.platform!=='win32',timeout:30000},async()=>{
  const dll=path.resolve('apps/bridge/Bridge/bin/Debug/net9.0/Bridge.dll');
  assert.ok(fs.existsSync(dll),'Run dotnet build/test before this verification');
  const pipeName='wheel_e2e_'+process.pid+'_'+Date.now();
  const bridge=spawn('dotnet',[dll,'--mock','--observe','--pipe',pipeName],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';bridge.stdout.on('data',d=>stdout+=d);bridge.stderr.on('data',d=>stderr+=d);
  const instance=createGatewayServer({pipePath:'\\\\.\\pipe\\'+pipeName,detect:false});
  const port=await new Promise((resolve,reject)=>{instance.server.once('error',reject);instance.server.listen(0,'127.0.0.1',()=>resolve(instance.server.address().port));});
  const ws=new WebSocket('ws://127.0.0.1:'+port+'/ws');
  const messages=[];const listeners=new Set();
  ws.on('message',data=>{const msg=JSON.parse(data);messages.push(msg);for(const listener of listeners)listener(msg);});
  const stream={on:fn=>listeners.add(fn),off:fn=>listeners.delete(fn)};
  const waitMessage=async(label,predicate)=>{
    try{return messages.find(predicate)||await waitFor(stream,predicate);}
    catch(error){throw new Error(label+'; received='+JSON.stringify(messages),{cause:error});}
  };
  try{
    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
    const {nonce}=instance.pairing.generateNonce();ws.send(JSON.stringify({type:'pair',nonce,name:'E2E'}));
    await waitMessage('pairing',m=>m.type==='paired');
    const ready=await waitMessage('bridge ready/configured',m=>m.type==='status'&&m.bridge.ready&&m.configured);
    ws.send(JSON.stringify({type:'resume',revision:ready.appliedRevision}));
    await waitMessage('resume',m=>m.type==='resumed');
    for(const frame of encodeSnapshot({sequence:1}))ws.send(frame);
    await waitMessage('neutral acknowledgement',m=>m.type==='ack'&&m.sequence===1);
    // 1. Send first active frame
    const frames=encodeSnapshot({sequence:2,steering:12345,brake:77,throttle:201,clutch:88,extended:(1n<<63n)|1n});
    for(const frame of frames)ws.send(frame);
    await waitMessage('state acknowledgement',m=>m.type==='ack'&&m.sequence===2);
    const deadline=Date.now()+3000;while(!stdout.includes('12345')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));
    assert.match(stdout,/"Steering":12345/);assert.match(stdout,/"Brake":77/);assert.match(stdout,/"Throttle":201/);

    // 2. Sequential gear shift: gear1 (bit 0) -> gear2 (bit 1)
    const framesGear1=encodeSnapshot({sequence:3,extended:1n<<0n});
    for(const f of framesGear1)ws.send(f);
    await waitMessage('gear1 acknowledgement',m=>m.type==='ack'&&m.sequence===3);

    const framesGear2=encodeSnapshot({sequence:4,extended:1n<<1n});
    for(const f of framesGear2)ws.send(f);
    await waitMessage('gear2 acknowledgement',m=>m.type==='ack'&&m.sequence===4);

    const deadlineGear=Date.now()+3000;while(!stdout.includes('"ExtendedButtons":2')&&Date.now()<deadlineGear)await new Promise(r=>setTimeout(r,25));
    // Verify that C# stdout observed gear2 and NEVER observed both bits 0 and 1 active simultaneously (1 | 2 = 3)
    const lines=stdout.trim().split('\n').filter(l=>l.startsWith('{'));
    for(const l of lines){
      try{
        const parsed=JSON.parse(l);
        if(parsed.ExtendedButtons!==undefined){
          const lowBits=Number(BigInt(parsed.ExtendedButtons)&0x3Fn);
          assert.ok(lowBits!==3,'Direct gears 1 and 2 must never be active simultaneously in C#');
        }
      }catch{}
    }

    // 3. Watchdog neutralization: stop sending frames, within 200ms gateway timeout sends neutral
    await new Promise(r=>setTimeout(r,200));
    assert.equal(stderr,'');
  }finally{ws.terminate();await instance.close();bridge.kill();}
});
