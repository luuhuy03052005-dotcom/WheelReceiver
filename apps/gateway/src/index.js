import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {WebSocketServer,WebSocket} from 'ws';
import {compareSequence,decodeFrame,FRAME_HEADER,EXT_A,EXT_B,validInputFrame,configFrames} from '@lan-racing-wheel/protocol';
import {PairingManager} from './pairing.js';
import {PipeClient} from './pipe-client.js';
import {RuntimeManager,privateAddress} from './runtime.js';
const here=typeof __dirname!=='undefined'?path.resolve(__dirname,'../gateway/src'):path.dirname(fileURLToPath(import.meta.url));
export function createGatewayServer(options={}){
  const app=express(),server=http.createServer(app);
  const wss=new WebSocketServer({server,path:'/ws',maxPayload:8192,perMessageDeflate:false,
    verifyClient:({req,origin})=>privateAddress(req.socket.remoteAddress)&&(!origin||origin==='http://'+req.headers.host||origin==='https://'+req.headers.host)});
  const pairing=options.pairing||new PairingManager(options.dataDir&&path.join(options.dataDir,'devices.json'));
  const pipeClient=options.pipeClient||new PipeClient(options.pipePath);
  const runtime=options.runtime||new RuntimeManager({file:options.dataDir&&path.join(options.dataDir,'profiles.json'),detect:options.detect===true,discoverScript:options.discoverScript});
  let owner=null,armed=false,configured=false,profilePending=false,lastSeq=null,lastValid=0,requireNeutral=true,closed=false,neutralizedOnTimeout=false;
  let pendingA=null,pendingB=null,appliedRevision=0,incoherentExtension=false,corruptedSequence=null;
  let connectionEpoch=0,inFlightConfig=null,queuedConfig=null;
  let driveSessionEpoch=1,sequenceCycle=0;
  const send=(ws,msg)=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg));};
  const status=()=>({type:'status',...runtime.status(),
    configured:configured&&!profilePending&&inFlightConfig===null&&queuedConfig===null&&appliedRevision===runtime.revision,
    profilePending:profilePending||inFlightConfig!==null||queuedConfig!==null,
    appliedRevision,armed,
    bridge:{connected:pipeClient.isConnected,ready:pipeClient.ready,...pipeClient.capabilities},
    backpressure:{queueDepth:pipeClient.queue?.length||0,needDrain:pipeClient.needDrain},
    input:pipeClient.lastFrame||null,
    connectionTransport: (()=>{const address=(owner?._socket||owner?.socket)?.localAddress?.replace(/^::ffff:/,'');
      const network=runtime.status().networks.find(n=>n.address===address);
      return network?(network.usbVerified?'Phiên đang qua adapter mạng USB: ':'Phiên đang qua adapter '+network.kind+': ')+network.name+' ('+address+')':address?'Phiên đang qua '+address:null;})()});
  const broadcast=()=>send(owner,status());
  const clear=()=>{lastSeq=null;sequenceCycle=0;pendingA=null;pendingB=null;incoherentExtension=false;corruptedSequence=null;requireNeutral=true;neutralizedOnTimeout=false;};
  const pause=(reason='Đã tạm ngưng')=>{driveSessionEpoch++;armed=false;clear();pipeClient.sendNeutral();send(owner,{type:'paused',reason});broadcast();};
  const dispatchConfig=()=>{
    if(!pipeClient.isConnected){
      configured=false;
      return;
    }
    if(inFlightConfig!==null){
      queuedConfig={
        epoch:connectionEpoch,
        revision:runtime.revision,
        profile:runtime.profile,
        targetPid:runtime.targetPid
      };
      profilePending=true;
      broadcast();
      return;
    }
    configured=false;
    profilePending=false;
    inFlightConfig={
      epoch:connectionEpoch,
      revision:runtime.revision,
      profile:runtime.profile,
      targetPid:runtime.targetPid
    };
    pipeClient.sendFrames(configFrames(inFlightConfig.profile,inFlightConfig.targetPid));
    broadcast();
  };
  const onProfile=()=>{
    if(armed)pause('Đổi cấu hình profile');
    dispatchConfig();
  };
  runtime.on('profile',onProfile);
  runtime.on('focus',focused=>{
    if(!focused&&armed&&runtime.targetPid!==0){
      pause('Game mất focus (Alt-Tab)');
    }else if(focused&&armed){
      requireNeutral=true;
    }
    broadcast();
  });
  runtime.on('status',broadcast);
  pipeClient.on('backpressure_overflow',({reason})=>{
    if(armed)pause('Nghẽn đường truyền IPC: '+reason);
  });
  pipeClient.on('connected',()=>{
    connectionEpoch++;
    inFlightConfig=null;queuedConfig=null;configured=false;
    dispatchConfig();
  });
  pipeClient.on('status',message=>{
    if(message.type==='configured'){
      if(inFlightConfig&&inFlightConfig.epoch===connectionEpoch){
        appliedRevision=inFlightConfig.revision;
        inFlightConfig=null;
        if(queuedConfig){
          const next=queuedConfig;
          queuedConfig=null;
          inFlightConfig=next;
          configured=false;
          profilePending=false;
          pipeClient.sendFrames(configFrames(next.profile,next.targetPid));
        }else{
          configured=true;
          profilePending=false;
        }
      }
    }
    broadcast();
  });
  pipeClient.on('disconnected',()=>{
    connectionEpoch++;
    inFlightConfig=null;queuedConfig=null;configured=false;
    pause('Mất kết nối bridge');
  });
  pairing.on('revoked',()=>{if(owner&&!pairing.validateToken(owner.deviceToken)){pause('Thiết bị đã bị thu hồi');owner.close(1008,'Revoked');}});
  pipeClient.connect();
  app.use(express.static(options.publicDir||path.resolve(here,'../../controller-web/public')));
  app.use('/packages',express.static(options.packagesDir||path.resolve(here,'../../../packages')));
  const imagesDir = path.resolve(here, '../../../images');
  if (fs.existsSync(imagesDir)) {
    app.use('/images', express.static(imagesDir));
  }
  app.get('/api/status',(req,res)=>res.json({status:'ok',pipeConnected:pipeClient.isConnected,hasActiveController:!!owner}));
  // Only the local Receiver may generate a pairing challenge.
  app.post('/api/pairing/generate',(req,res)=>{
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||
      !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host||'')||
      (req.headers.origin&&req.headers.origin!=='http://'+req.headers.host))return res.sendStatus(403);
    res.json(pairing.generateNonce());
  });
  const attempts=new Map();
  const allowPair=ip=>{const now=Date.now();let entry=attempts.get(ip);if(!entry||now-entry.start>60000){entry={start:now,count:0};attempts.set(ip,entry);}return ++entry.count<=10;};
  wss.on('connection',(ws,req)=>{
    ws.on('error',()=>{});
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true,1000);
    let rateStart=Date.now(),binaryCount=0,jsonCount=0;
    ws.on('message',(data,isBinary)=>{
      const now=Date.now();if(now-rateStart>=1000){rateStart=now;binaryCount=0;jsonCount=0;}
      if(isBinary){
        if(++binaryCount>1200)return;
        if(ws!==owner||!pairing.validateToken(ws.deviceToken)||!armed)return;
        const frame=Buffer.from(data);
        if(!validInputFrame(frame)){
          if(pendingA!==null||pendingB!==null){
            incoherentExtension=true;
            corruptedSequence=pendingA?.[1]??pendingB?.[1]??null;
          }
          pendingA=pendingB=null;
          return;
        }
        if(frame[0]===EXT_A){pendingA=frame;pendingB=null;incoherentExtension=false;corruptedSequence=null;return;}
        if(frame[0]===EXT_B){
          if(pendingA?.[1]===frame[1])pendingB=frame;
          else {corruptedSequence=pendingA?.[1]??frame[1];pendingA=null;pendingB=null;incoherentExtension=true;}
          return;
        }
        if(frame[0]!==FRAME_HEADER){pendingA=pendingB=null;incoherentExtension=false;corruptedSequence=null;return;}
        if(incoherentExtension||(corruptedSequence!==null&&frame[1]===corruptedSequence)){
          incoherentExtension=false;corruptedSequence=null;pendingA=pendingB=null;return;
        }
        const state=decodeFrame(frame);
        if(!state){pendingA=pendingB=null;return;}
        if(lastSeq!==null&&!compareSequence(state.sequence,lastSeq).isNewer){pendingA=pendingB=null;return;}

        // Extensions coherence check:
        // If extensions were staged, both EXT_A and EXT_B must be present and match state sequence.
        // If partial/mismatched, do NOT downgrade to state-only! Drop!
        if(pendingA!==null||pendingB!==null){
          if(!pendingA||!pendingB||pendingA[1]!==state.sequence||pendingB[1]!==state.sequence){
            pendingA=pendingB=null;
            return;
          }
        }

        // Track sequence wrap (255 -> 0)
        if(lastSeq!==null&&state.sequence<lastSeq){
          sequenceCycle++;
        }

        let frames;
        let extClutch=0,extHasBits=false;
        if(pendingA&&pendingB&&pendingA[1]===state.sequence&&pendingB[1]===state.sequence){
          extClutch=pendingA[2];
          const lower=pendingA.readUInt32LE(4);
          const upper=pendingB.readUInt32LE(2);
          if(lower!==0||upper!==0)extHasBits=true;
          frames=[pendingA,pendingB,frame];
        }else{
          // Legacy standalone 0x11 without extensions
          frames=[frame];
        }
        pendingA=pendingB=null;

        const neutral=state.buttons===0&&Math.abs(state.steering)<=500&&state.brake===0&&state.throttle===0&&extClutch===0&&!extHasBits;
        if(requireNeutral){
          if(!neutral){
            pipeClient.sendNeutral();
            send(ws,{type:'require_neutral',sequence:state.sequence,sessionEpoch:driveSessionEpoch});
            return;
          }
          requireNeutral=false;
        }
        if(profilePending&&neutral){
          dispatchConfig();
        }
        if(runtime.targetPid!==0&&!runtime.focused){
          pipeClient.sendNeutral();
          lastSeq=state.sequence;
          neutralizedOnTimeout=false;
          send(ws,{type:'ack',sequence:lastSeq,sequenceCycle,sessionEpoch:driveSessionEpoch,revision:appliedRevision});
          return;
        }
        if(pipeClient.sendFrames(frames)){
          lastValid=now;
          lastSeq=state.sequence;
          neutralizedOnTimeout=false;
          send(ws,{type:'ack',sequence:lastSeq,sequenceCycle,sessionEpoch:driveSessionEpoch,revision:appliedRevision});
        }
        else pipeClient.sendNeutral();
        return;
      }
      if(++jsonCount>30)return;
      try{
        const msg=JSON.parse(data.toString());
        if(msg.type==='ping'){send(ws,{type:'pong',clientTime:msg.clientTime});return;}
        if(msg.type==='auth'||msg.type==='pair'){
          if(owner&&owner!==ws){send(ws,{type:'error',message:'Another controller is currently active.'});return;}
          if(!allowPair(req.socket.remoteAddress)){send(ws,{type:'error',message:'Thử ghép đôi quá nhiều. Chờ 60 giây.'});return;}
          let token=msg.token;
          if(msg.type==='pair'){
            const exchange=pairing.exchangeNonce(msg.nonce,msg.name);
            if(!exchange.success){send(ws,{type:'error',message:exchange.reason});return;}token=exchange.token;
          }
          if(!pairing.validateToken(token)){send(ws,{type:'error',message:'Invalid or revoked token'});return;}
          owner=ws;ws.deviceToken=token;clear();pipeClient.sendNeutral();
          armed=false;
          send(ws,{type:msg.type==='pair'?'paired':'auth_ok',...(msg.type==='pair'?{token}:{})});
          broadcast();return;
        }
        if(ws!==owner||!pairing.validateToken(ws.deviceToken))return;
        if(msg.type==='pause'){pause();return;}
        if(msg.type==='profile'){
          runtime.choose(msg);return;
        }
        if(msg.type==='apply-profile'){
          if(armed)pause('Đang áp dụng profile');
          dispatchConfig();return;
        }
        if(msg.type==='resume'){
          if(ws!==owner||!pairing.validateToken(ws.deviceToken)){
            send(ws,{type:'resume_rejected',reason:'unauthorized',message:'Chưa xác thực thiết bị'});return;
          }
          if(!pipeClient.isConnected){
            send(ws,{type:'resume_rejected',reason:'bridge_disconnected',message:'Bridge chưa kết nối'});return;
          }
          if(!pipeClient.ready){
            send(ws,{type:'resume_rejected',reason:'bridge_not_ready',message:'Bridge chưa sẵn sàng'});return;
          }
          if(!configured||profilePending||inFlightConfig!==null||queuedConfig!==null||appliedRevision!==runtime.revision){
            send(ws,{type:'resume_rejected',reason:'configuration_pending',message:'Cấu hình profile chưa hoàn tất'});return;
          }
          if(msg.revision!==undefined&&msg.revision!==appliedRevision){
            send(ws,{type:'resume_rejected',reason:'revision_mismatch',message:'Phiên bản profile yêu cầu đã cũ hoặc không khớp'});return;
          }
          driveSessionEpoch++;
          clear();pipeClient.sendNeutral();armed=true;requireNeutral=true;lastValid=Date.now();
          send(ws,{type:'resumed',revision:appliedRevision,sessionEpoch:driveSessionEpoch});broadcast();return;
        }
      }catch(error){send(ws,{type:'error',message:error.message||'Thông điệp không hợp lệ'});}
    });
    ws.on('close',()=>{if(ws===owner){pause('Mất kết nối điện thoại');owner=null;}});
  });
  const timer=setInterval(()=>{
    if(armed){
      const elapsed=Date.now()-lastValid;
      if(elapsed>=135&&!neutralizedOnTimeout){
        pipeClient.sendNeutral();
        neutralizedOnTimeout=true;
      }
      if(elapsed>5000){
        pause('Mất kết nối điều khiển (>5s)');
      }
    }
    for(const [key,value]of attempts)if(Date.now()-value.start>60000)attempts.delete(key);
  },10);timer.unref();
  const dispose=()=>{if(closed)return;closed=true;clearInterval(timer);runtime.close();pipeClient.close();};
  server.on('close',dispose);
  const close=async()=>{pause('Receiver đang đóng');for(const ws of wss.clients)ws.terminate();dispose();await new Promise(r=>server.listening?server.close(r):r());};
  const gateway={get hasActiveController(){return !!owner&&owner.readyState===WebSocket.OPEN;},status,pause,configure:dispatchConfig};
  return {server,wss,pairing,pipeClient,gateway,runtime,close};
}
if(typeof import.meta.url==='string'&&process.argv[1]===fileURLToPath(import.meta.url)){
  const instance=createGatewayServer({detect:true,dataDir:path.join(os.homedir(),'.lan-racing-wheel')});
  instance.server.listen(Number(process.env.PORT)||32178,'0.0.0.0',()=>console.log('Wheel gateway ready'));
  process.on('SIGINT',()=>instance.close());
}
