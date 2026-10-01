import test from 'node:test';
import assert from 'node:assert/strict';
import {H_SLOTS,nearestHSlot} from '../public/src/h-shifter.js';
import {GAMES} from '../../../packages/profiles/src/index.js';

test('H-pattern exposes six forward gears and reverse in the expected gates',()=>{
  assert.deepEqual(H_SLOTS.map(slot=>slot.label),['1','2','3','4','5','6','R']);
  assert.equal(nearestHSlot(13,20)?.id,'gear1');assert.equal(nearestHSlot(13,80)?.id,'gear2');
  assert.equal(nearestHSlot(41,20)?.id,'gear3');assert.equal(nearestHSlot(41,80)?.id,'gear4');
  assert.equal(nearestHSlot(69,20)?.id,'gear5');assert.equal(nearestHSlot(69,80)?.id,'gear6');
  assert.equal(nearestHSlot(90,80)?.id,'reverse');assert.equal(nearestHSlot(41,50),null);
});

test('H-pattern does not select an unavailable output',()=>{
  assert.equal(nearestHSlot(90,80,new Set(['gear1'])),null);
});

test('major wheel-compatible game profiles expose H-pattern mode',()=>{
  for(const id of ['forza','beamng','ets2','ats','assetto','dirt'])assert.ok(GAMES.find(game=>game.id===id).modes.includes('H'),id);
});
