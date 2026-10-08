import net from 'node:net';
import {EventEmitter} from 'node:events';
import {RESET,CONFIG,BINDING,BUTTONS,decodeFrame,decodeExtensions,encodeSnapshot} from '@lan-racing-wheel/protocol';
import {ACTIONS} from '@lan-racing-wheel/profiles';

export const MAX_QUEUE_ITEMS = 16;
export const MAX_QUEUE_BYTES = 4096;
export const MAX_AGE_MS = 100;

// Direct transmission gear indices (0-9)
const GEAR_MASK = 0x3FFn;

// Pulse action buttons in primary mask (Shift Up, Shift Down, Camera)
const PULSE_BUTTONS_MASK = (BUTTONS.SHIFT_UP || 0x2000) | (BUTTONS.SHIFT_DOWN || 0x4000) | (BUTTONS.CAMERA || 0x0200);

// Pulse action extended indices mask
let pulseExtMask = 0n;
for (const a of ACTIONS) {
  if (a.kind === 'pulse') pulseExtMask |= (1n << BigInt(a.index));
}
const PULSE_EXTENDED_MASK = pulseExtMask;

export class PipeClient extends EventEmitter {
  constructor(pipePath='\\\\.\\pipe\\lan_racing_wheel_ipc'){
    super();this.pipePath=pipePath;this.socket=null;this.isConnected=false;this.ready=false;
    this.capabilities={backend:'none',buttons:0,keyboard:false};this.isClosedManually=false;this.reconnectTimer=null;
    this.lastFrame={sequence:0,steering:0,brake:0,throttle:0,clutch:0,gearMode:0,extended:'0',buttons:0};
    this.needDrain=false;
    this.queue=[];
    this.epoch=0;
    this.lastEnqueuedState=null;
  }

  get pendingSnapshot() {
    return this.queue.length > 0 ? this.queue[this.queue.length - 1].state : null;
  }

  bindSocket(socket){
    this.socket=socket;
    socket.on('drain',()=>{
      this.needDrain=false;
      this._flushQueue();
    });
    socket.on('data',chunk=>{
      let pending='';pending+=chunk.toString();if(pending.length>65536){socket.destroy();return;}
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
      this.queue=[];
      this.epoch++;
      this.lastEnqueuedState=null;
      this.emit('disconnected');
      if(!this.isClosedManually){this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;this.connect();},1000);this.reconnectTimer.unref();}
    });
  }

  connect(){
    if(this.socket||this.isClosedManually)return;
    const socket=net.createConnection(this.pipePath);
    socket.on('connect',()=>{
      this.isConnected=true;
      this.needDrain=false;
      this.epoch++;
      this.queue=[];
      this.lastEnqueuedState=null;
      this.sendNeutral();
      this.emit('connected');
    });
    this.bindSocket(socket);
  }

  _flushQueue(){
    if(!this.isConnected||!this.socket||this.socket.destroyed||this.needDrain)return;
    const now=Date.now();
    while(this.queue.length>0){
      const item=this.queue[0];
      if(item.epoch!==this.epoch){
        this.queue.shift();
        continue;
      }
      if(now-item.enqueuedAt>MAX_AGE_MS){
        // Discard stale frame exceeding age limit
        this.queue.shift();
        continue;
      }
      this.queue.shift();
      const payload=Buffer.concat(item.frames.map(b=>Buffer.from(b)));
      const ok=this.socket.write(payload);
      if(!ok){
        this.needDrain=true;
        break;
      }
    }
  }

  sendFrames(frames){
    if(!this.isConnected||!this.socket||this.socket.destroyed)return false;
    if(this.socket.writableLength>MAX_QUEUE_BYTES){
      this.failSafe('Socket buffer overflow');
      return false;
    }
    const header=frames[0]?.[0];
    if(header===RESET||header===CONFIG||header===BINDING){
      this.queue=[];
      this.lastEnqueuedState=null;
      const payload=Buffer.concat(frames.map(b=>Buffer.from(b)));
      const ok=this.socket.write(payload);
      if(!ok)this.needDrain=true;
      return true;
    }
    const state=decodeFrame(frames.at(-1));
    if(!state)return false;

    const ext=decodeExtensions(frames);
    this.lastFrame={...state,clutch:ext.clutch,gearMode:ext.gearMode,extended:ext.extended.toString()};
    this.emit('input',this.lastFrame);

    // If socket is writeable and no queued items, write immediately
    if(!this.needDrain&&this.queue.length===0){
      const payload=Buffer.concat(frames.map(b=>Buffer.from(b)));
      const ok=this.socket.write(payload);
      if(!ok)this.needDrain=true;
      this.lastEnqueuedState={
        buttons:state.buttons,
        extended:ext.extended,
        gear:ext.extended&GEAR_MASK
      };
      return true;
    }

    // Under backpressure: enqueue with semantic classification
    if(this.queue.length>=MAX_QUEUE_ITEMS){
      this.failSafe('Queue overflow');
      return false;
    }

    const prevPulseButtons=(this.lastEnqueuedState?.buttons??0)&PULSE_BUTTONS_MASK;
    const nextPulseButtons=state.buttons&PULSE_BUTTONS_MASK;
    const prevPulseExt=(this.lastEnqueuedState?.extended??0n)&PULSE_EXTENDED_MASK;
    const nextPulseExt=ext.extended&PULSE_EXTENDED_MASK;

    const hasPulseTransition=(prevPulseButtons!==nextPulseButtons)||(prevPulseExt!==nextPulseExt);

    if(hasPulseTransition||this.queue.length===0){
      // Edge transition or first queued item: must be preserved distinctly
      this.queue.push({
        frames,
        state,
        ext,
        enqueuedAt:Date.now(),
        epoch:this.epoch
      });
      this.lastEnqueuedState={
        buttons:state.buttons,
        extended:ext.extended,
        gear:ext.extended&GEAR_MASK
      };
    }else{
      // Coalesce continuous state into the last queue item
      const item=this.queue[this.queue.length-1];
      const currentGear=ext.extended&GEAR_MASK;
      const nonGearExtended=ext.extended&~GEAR_MASK;
      // Direct gear: latest gear selection replaces prior selection (strictly at most 1 gear bit)
      const coalescedExtended=nonGearExtended|currentGear;

      const coalescedState={
        sequence:state.sequence,
        steering:state.steering,
        brake:state.brake,
        throttle:state.throttle,
        clutch:ext.clutch,
        gearMode:ext.gearMode,
        buttons:state.buttons,
        extended:coalescedExtended
      };

      item.frames=encodeSnapshot(coalescedState);
      item.state=decodeFrame(item.frames.at(-1));
      item.ext={...ext,extended:coalescedExtended};
      item.enqueuedAt=Date.now();

      this.lastEnqueuedState={
        buttons:state.buttons,
        extended:coalescedExtended,
        gear:currentGear
      };
    }
    return true;
  }

  sendFrame(frame){return this.sendFrames([frame]);}

  sendNeutral(){
    this.queue=[];
    this.lastEnqueuedState=null;
    this.epoch++;
    const reset=new Uint8Array(8);reset[0]=RESET;
    if(this.isConnected&&this.socket&&!this.socket.destroyed){
      const ok=this.socket.write(Buffer.from(reset));
      if(!ok)this.needDrain=true;
    }
    this.lastFrame={sequence:0,steering:0,brake:0,throttle:0,clutch:0,gearMode:0,extended:'0',buttons:0};
    this.emit('input',this.lastFrame);
  }

  failSafe(reason){
    this.queue=[];
    this.lastEnqueuedState=null;
    this.needDrain=false;
    this.epoch++;
    this.sendNeutral();
    this.emit('backpressure_overflow',{reason});
  }

  close(){
    this.isClosedManually=true;clearTimeout(this.reconnectTimer);
    this.sendNeutral();this.socket?.end?.();this.isConnected=false;this.ready=false;
  }
}


