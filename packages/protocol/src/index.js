/** Fixed 8-byte v1 frames. Extensions are staged and committed by the state frame. */
export const PROTOCOL_VERSION = 1;
export const MESSAGE_TYPE_STATE = 1;
export const FRAME_HEADER = 0x11;
export const FRAME_SIZE = 8;
export const EXT_A = 0x12, EXT_B = 0x13, BINDING = 0x14, CONFIG = 0x15, RESET = 0x1f;
export const BUTTONS = Object.freeze({
  NONE:0, CLUTCH:0x0100, CLUTCH_QUICK:0x0100, LB:0x0100,
  CAMERA:0x0200, RB:0x0200,
  DPAD_UP:0x0001, DPAD_DOWN:0x0002, DPAD_LEFT:0x0004, DPAD_RIGHT:0x0008,
  HANDBRAKE:0x1000, A:0x1000,
  SHIFT_UP:0x2000, B:0x2000, PADDLE_UP:0x2000,
  SHIFT_DOWN:0x4000, X:0x4000, PADDLE_DOWN:0x4000, NITRO:0x8000, Y:0x8000
});
// Transmission mode identifiers sent in EXT_A byte 3
export const GEAR_MODES = Object.freeze({AT:1,MT:2,MTC:3,H:4});
const integer=(v,min,max)=>Number.isFinite(v)?Math.max(min,Math.min(max,Math.round(v))):0;
export function encodeFrame({sequence=0,buttons=0,steering=0,brake=0,throttle=0}={}) {
  const bytes=new Uint8Array(8), view=new DataView(bytes.buffer);
  bytes[0]=FRAME_HEADER; bytes[1]=sequence&255;
  view.setUint16(2,integer(buttons,0,65535),true);
  view.setInt16(4,integer(steering,-32768,32767),true);
  bytes[6]=integer(brake,0,255); bytes[7]=integer(throttle,0,255);
  return bytes;
}
export function decodeFrame(raw) {
  if(!raw || raw.byteLength!==8) return null;
  const view=raw instanceof DataView?raw:raw instanceof ArrayBuffer?new DataView(raw):new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
  if(view.getUint8(0)!==FRAME_HEADER) return null;
  return {header:FRAME_HEADER,sequence:view.getUint8(1),buttons:view.getUint16(2,true),
    steering:view.getInt16(4,true),brake:view.getUint8(6),throttle:view.getUint8(7)};
}
export function encodeExtensions({sequence=0,clutch=0,gearMode=0,extended=0n}={}) {
  const a=new Uint8Array(8),b=new Uint8Array(8);
  a[0]=EXT_A;b[0]=EXT_B;a[1]=b[1]=sequence&255;
  a[2]=integer(clutch,0,255);a[3]=integer(gearMode,0,255);
  const bits=BigInt.asUintN(64,BigInt(extended));
  new DataView(a.buffer).setUint32(4,Number(bits&0xffffffffn),true);
  new DataView(b.buffer).setUint32(2,Number(bits>>32n),true);
  return [a,b];
}
export function decodeExtensions(frames=[]) {
  let clutch=0,gearMode=0,lower=0n,upper=0n;
  for(const raw of frames){
    if(!raw||raw.byteLength!==8)continue;
    const view=raw instanceof DataView?raw:raw instanceof ArrayBuffer?new DataView(raw):new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
    const header=view.getUint8(0);
    if(header===EXT_A){clutch=view.getUint8(2);gearMode=view.getUint8(3);lower=BigInt(view.getUint32(4,true));}
    else if(header===EXT_B){upper=BigInt(view.getUint32(2,true));}
  }
  return {clutch,gearMode,extended:(upper<<32n)|lower};
}
export function encodeSnapshot(state={}) {return [...encodeExtensions(state),encodeFrame(state)];}
export function createNeutralFrame(sequence=0){return encodeFrame({sequence});}
export function compareSequence(next,last) {
  const delta=(next-last+256)%256;
  return {delta,isNewer:delta>=1&&delta<=127,isDuplicate:delta===0,isStale:delta>=128};
}
export function validInputFrame(raw) {
  return raw?.byteLength===8 && (raw[0]===FRAME_HEADER || raw[0]===EXT_A ||
    (raw[0]===EXT_B && raw[6]===0 && raw[7]===0));
}
export function configFrames(profile,foregroundPid=0) {
  const config=new Uint8Array(8);config[0]=CONFIG;
  config[1]=profile.backend==='xinput'?1:profile.backend==='vjoy'?2:0;
  new DataView(config.buffer).setUint32(4,foregroundPid>>>0,true);
  const frames=[config];
  const defaults={0:49,1:50,2:51,3:52,4:53,5:54,6:55,7:48,8:68,9:78,11:76,12:75,13:74,16:219,17:221,18:70,20:80,21:88,25:72,26:69,27:83,34:32,35:67,46:86,48:188,49:190,50:222,51:186,52:66,54:84,57:79,58:57,59:112,60:113,61:114,62:27,63:82};
  for(let index=0;index<64;index++){
    const b=new Uint8Array(8);b[0]=BINDING;b[1]=index;
    const isGear=index<10;
    const defaultKey=(isGear&&profile.backend==='vjoy')?0:(defaults[index]||0);
    b[2]=profile.keys?.[index]||defaultKey;
    frames.push(b);
  }
  return frames;
}
