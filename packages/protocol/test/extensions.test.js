import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSnapshot,encodeFrame,decodeFrame,validInputFrame,configFrames,BUTTONS,GEAR_MODES} from '../src/index.js';
test('extended snapshot preserves original 8-byte state contract and both 32-bit banks',()=>{
 const [a,b,state]=encodeSnapshot({sequence:255,clutch:201,extended:(1n<<63n)|3n,steering:-32768,throttle:255});
 assert.deepEqual([a.length,b.length,state.length],[8,8,8]);assert.deepEqual([...a],[0x12,255,201,0,3,0,0,0]);
 assert.deepEqual([...b],[0x13,255,0,0,0,128,0,0]);assert.equal(decodeFrame(state).steering,-32768);
 for(const f of [a,b,state])assert.ok(validInputFrame(f));
});
test('gearMode byte is encoded in EXT_A[3] for each transmission mode',()=>{
 for(const [name,expected] of [['AT',1],['MT',2],['MTC',3],['H',4]]){
   const [a]=encodeSnapshot({sequence:1,clutch:0,gearMode:GEAR_MODES[name],extended:0n});
   assert.equal(a[3],expected,`${name} should encode gearMode=${expected} in EXT_A[3]`);
 }
 // Default (no mode) should be 0
 const [a0]=encodeSnapshot({sequence:1});
 assert.equal(a0[3],0,'default gearMode should be 0');
});
test('DPad button masks are distinct and non-overlapping with other button masks',()=>{
 assert.equal(BUTTONS.DPAD_UP,0x0001);assert.equal(BUTTONS.DPAD_DOWN,0x0002);
 assert.equal(BUTTONS.DPAD_LEFT,0x0004);assert.equal(BUTTONS.DPAD_RIGHT,0x0008);
 // Verify no overlap with existing masks
 const dpad=BUTTONS.DPAD_UP|BUTTONS.DPAD_DOWN|BUTTONS.DPAD_LEFT|BUTTONS.DPAD_RIGHT;
 const others=BUTTONS.CLUTCH|BUTTONS.CAMERA|BUTTONS.HANDBRAKE|BUTTONS.SHIFT_UP|BUTTONS.SHIFT_DOWN|BUTTONS.NITRO;
 assert.equal(dpad&others,0,'DPad masks must not overlap with other button masks');
});
test('reject oversized legacy v2 and IPC-only frames from controller',()=>{
 assert.equal(decodeFrame(new Uint8Array([0x11,0,0,0,0,0,0,0,0])),null);
 assert.equal(validInputFrame(new Uint8Array([0x12,0,0,0,0,0,0,0,0,0])),false);
 for(const frame of configFrames({backend:'xinput'}))assert.equal(validInputFrame(frame),false);
});
test('non-finite analog input becomes neutral before encoding',()=>{
 assert.deepEqual(decodeFrame(encodeFrame({steering:Infinity,brake:NaN,throttle:-Infinity})),decodeFrame(encodeFrame()));
});
test('configFrames includes H-pattern gear defaults for xinput backend',()=>{
 const frames=configFrames({backend:'xinput',keys:{}});
 // Index 0 (gear1) should have key 49 ("1"), index 6 (reverse) should have key 55 ("7")
 const binding0=frames[1]; // first binding frame after config
 assert.equal(binding0[0],0x14);assert.equal(binding0[1],0);assert.equal(binding0[2],49);
 const binding6=frames[7]; // 7th binding frame (index 6)
 assert.equal(binding6[0],0x14);assert.equal(binding6[1],6);assert.equal(binding6[2],55);
 // For vjoy backend, gear indices should have key 0 (no keyboard fallback)
 const vjoyFrames=configFrames({backend:'vjoy',keys:{}});
 assert.equal(vjoyFrames[1][2],0,'vjoy backend should not have default keyboard bindings');
});
