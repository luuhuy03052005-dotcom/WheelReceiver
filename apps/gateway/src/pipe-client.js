import net from 'node:net';
import {EventEmitter} from 'node:events';
import {RESET,CONFIG,BINDING,decodeFrame,decodeExtensions,encodeSnapshot} from '@lan-racing-wheel/protocol';
export class PipeClient extends EventEmitter {
  constructor(pipePath='\\\\.\\pipe\\lan_racing_wheel_ipc'){
    super();this.pipePath=pipePath;this.socket=null;this.isConnected=false;this.ready=false;
    this.capabilities={backend:'none',buttons:0,keyboard:false};this.isClosedManually=false;this.reconnectTimer=null;
    this.lastFrame={sequence:0,steering:0,brake:0,throttle:0,clutch:0,gearMode:0,extended:'0',buttons:0};
    this.needDrain=false;
    this.pendingSnapshot=null;
    this.latchedButtons=0;
    this.latchedExtended=0n;
  }
  connect(){
    if(this.socket||this.isClosedManually)return;
    const socket=this.socket=net.createConnection(this.pipePath);let pending='';
    socket.on('connect',()=>{this.isConnected=true;this.needDrain=false;this.sendNeutral();this.emit('connected');});
    socket.on('drain',()=>{
      this.needDrain=false;
      this._flushMailbox();
    });
    socket.on('data',chunk=>{
      pending+=chunk.toString();if(pending.length>65536){socket.destroy();return;}
      let newline;while((newline=pending.indexOf('\n'))>=0){
        const line=pending.slice(0,newline);pending=pending.slice(newline+1);
        try{const msg=JSON.parse(line);this.capabilities={backend:msg.backend,buttons:msg.buttons||0,keyboard:!!msg.keyboard,error:msg.error};
          this.ready=!!msg.connected;this.emit('status',msg);
        }catch{}
      }
    });
    socket.on('error',()=>socket.destroy());
    socket.on('close',()=>{
      if(this.socket!==socket)return;
      this.socket=null;this.isConnected=false;this.ready=false;this.needDrain=false;
      this.pendingSnapshot=null;this.latchedButtons=0;this.latchedExtended=0n;
      this.emit('disconnected');
      if(!this.isClosedManually){this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;this.connect();},1000);this.reconnectTimer.unref();}
    });
  }
  _flushMailbox(){
    if(!this.isConnected||!this.socket||this.socket.destroyed||!this.pendingSnapshot)return;
    const snapshot=this.pendingSnapshot;
    this.pendingSnapshot=null;
    this.latchedButtons=0;
    this.latchedExtended=0n;
    const frames=encodeSnapshot(snapshot);
    const ok=this.socket.write(Buffer.concat(frames.map(b=>Buffer.from(b))));
    if(!ok)this.needDrain=true;
  }
  sendFrames(frames){
    if(!this.isConnected||!this.socket||this.socket.destroyed)return false;
    if(this.socket.writableLength>4096){this.socket.destroy();return false;}
    const header=frames[0]?.[0];
    if(header===RESET||header===CONFIG||header===BINDING){
      this.pendingSnapshot=null;
      this.latchedButtons=0;
      this.latchedExtended=0n;
      const ok=this.socket.write(Buffer.concat(frames.map(b=>Buffer.from(b))));
      if(!ok)this.needDrain=true;
      return true;
    }
    const state=decodeFrame(frames.at(-1));
    if(state){
      const ext=decodeExtensions(frames);
      this.lastFrame={...state,clutch:ext.clutch,gearMode:ext.gearMode,extended:ext.extended.toString()};
      this.emit('input',this.lastFrame);

      if(!this.needDrain){
        const ok=this.socket.write(Buffer.concat(frames.map(b=>Buffer.from(b))));
        if(!ok)this.needDrain=true;
      }else{
        this.latchedButtons|=state.buttons;
        this.latchedExtended|=ext.extended;
        this.pendingSnapshot={
          sequence:state.sequence,
          steering:state.steering,
          brake:state.brake,
          throttle:state.throttle,
          clutch:ext.clutch,
          gearMode:ext.gearMode,
          buttons:this.latchedButtons,
          extended:this.latchedExtended
        };
      }
    }
    return true;
  }
  sendFrame(frame){return this.sendFrames([frame]);}
  sendNeutral(){
    this.pendingSnapshot=null;
    this.latchedButtons=0;
    this.latchedExtended=0n;
    const reset=new Uint8Array(8);reset[0]=RESET;this.sendFrame(reset);
    this.lastFrame={sequence:0,steering:0,brake:0,throttle:0,clutch:0,gearMode:0,extended:'0',buttons:0};
    this.emit('input',this.lastFrame);
  }
  close(){
    this.isClosedManually=true;clearTimeout(this.reconnectTimer);
    this.sendNeutral();this.socket?.end?.();this.isConnected=false;this.ready=false;
  }
}

