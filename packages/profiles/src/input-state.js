import { BUTTONS } from '../../protocol/src/index.js';
import { ACTIONS } from './index.js';
/** Edges survive at least one successful snapshot. No events cross a reset. */
export class InputState {
  constructor(){this.reset();}
  reset(){this.held=new Set();this.pulses=new Map();this.sent=new Set();this.gear=null;}
  press(id,now=performance.now()){
    if(this.held.has(id))return;
    this.held.add(id);this.pulses.set(id,now+60);this.sent.delete(id);
  }
  release(id){this.held.delete(id);}
  clear(id){this.held.delete(id);this.pulses.delete(id);this.sent.delete(id);}
  setMode(mode){if(mode==='AT'){['shiftUp','shiftDown','clutchQuick','clutchTap'].forEach(id=>this.clear(id));this.gear=null;}}
  snapshot(now=performance.now()){
    const active=new Set(this.held);
    for(const [id,until] of this.pulses){
      if(now<until||(!this.sent.has(id)&&now<until+200))active.add(id);
      else if(!this.held.has(id)){this.pulses.delete(id);this.sent.delete(id);}
    }
    if(active.has('handbrake'))active.add('parkingBrake');
    if(this.gear)active.add(this.gear);
    let extended=0n,buttons=0;
    for(const a of ACTIONS)if(active.has(a.id))extended|=1n<<BigInt(a.index);
    const primary={
      shiftUp:BUTTONS.SHIFT_UP,
      shiftDown:BUTTONS.SHIFT_DOWN,
      handbrake:BUTTONS.HANDBRAKE,
      clutchQuick:BUTTONS.CLUTCH,
      clutchTap:BUTTONS.CLUTCH,
      camera:BUTTONS.CAMERA,
      cameraPrimary:BUTTONS.CAMERA,
      nitro:BUTTONS.NITRO,
      dpadUp:BUTTONS.DPAD_UP,
      dpadDown:BUTTONS.DPAD_DOWN,
      dpadLeft:BUTTONS.DPAD_LEFT,
      dpadRight:BUTTONS.DPAD_RIGHT,
      DPAD_UP:BUTTONS.DPAD_UP,
      DPAD_DOWN:BUTTONS.DPAD_DOWN,
      DPAD_LEFT:BUTTONS.DPAD_LEFT,
      DPAD_RIGHT:BUTTONS.DPAD_RIGHT,
      park:BUTTONS.DPAD_UP,
      reverse:BUTTONS.DPAD_DOWN,
      neutral:BUTTONS.DPAD_LEFT,
      drive:BUTTONS.DPAD_RIGHT
    };
    for(const [id,mask]of Object.entries(primary))if(active.has(id))buttons|=mask;
    return {extended,buttons,active};
  }
  acknowledge(snapshot){for(const id of snapshot.active)this.sent.add(id);}
}
