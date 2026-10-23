import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SmartPlacementService } from '../src/main/services/smartPlacement';
import { changedScreenFraction, windowLayoutBounds } from '../src/shared/windowLayout';

const area = { x: -1920, y: 30, width: 1920, height: 1080 };
const capture = { image: 'data:image/jpeg;base64,fixture', area, bounds: { x: -1800, y: 60, width: 500, height: 400 }, owner: 'user:model' };
const placement = { xRatio: .7, yRatio: .1, widthRatio: .25, heightRatio: .6, confidence: .9, reason: 'Unused right margin.' };

test('placement stays within offset displays and rejects malformed or overflowing rectangles', () => {
  assert.deepEqual(windowLayoutBounds(area, placement), { x: -576, y: 138, width: 480, height: 648 });
  assert.deepEqual(windowLayoutBounds({x:0,y:0,width:200,height:140}, {xRatio:0,yRatio:0,widthRatio:0,heightRatio:0}), {x:0,y:0,width:200,height:140});
  for (const input of [null, {}, {...placement,xRatio:NaN}, {...placement,xRatio:-1}, {...placement,widthRatio:1}, {...placement,heightRatio:'0.5'}]) assert.throws(() => windowLayoutBounds(area,input));
});

test('AutoDetect validates model output and applies only readable, confident, bounded placements', async () => {
  const applied: unknown[] = []; let output = JSON.stringify(placement);
  const service = new SmartPlacementService({ capture:async()=>capture,sample:async()=>({pixels:new Uint8Array(16),key:'one'}),analyze:async()=>output,apply:bounds=>{applied.push(bounds);} });
  assert.equal(service.snapshot().enabled,false);
  await service.detect();assert.equal(applied.length,1);assert.equal(service.snapshot().reason,placement.reason);
  output=JSON.stringify({...placement,confidence:.3});await service.detect();assert.equal(applied.length,1);assert.match(service.snapshot().reason,/Kept/);
  for (const invalid of ['not JSON', JSON.stringify({...placement,xRatio:2}), JSON.stringify({...placement,widthRatio:.05}),JSON.stringify({...placement,xRatio:0,yRatio:0,widthRatio:1,heightRatio:1})]) {
    output=invalid; await service.detect(); assert(service.snapshot().error); assert.equal(applied.length,1);
  }
  assert.equal(service.snapshot().busy,false);service.dispose();
});

test('disabling Auto Smart cancels an in-flight result and duplicate requests never run together', async () => {
  let complete!: (value:string)=>void;let calls=0,applied=0;
  const service = new SmartPlacementService({capture:async()=>capture,sample:async()=>({pixels:new Uint8Array(16),key:'one'}),analyze:async()=>{calls++;return new Promise(resolve=>{complete=resolve;});},apply:()=>{applied++;}});
  const pending=service.detect();await new Promise(resolve=>setImmediate(resolve));await service.detect();assert.equal(calls,1);
  service.setEnabled(false);complete(JSON.stringify(placement));await pending;assert.equal(applied,0);assert.equal(service.snapshot().busy,false);
});

test('a desktop change while the model is analyzing never applies a stale placement', async () => {
  let pixels = new Uint8Array(16), applied = false;
  const service = new SmartPlacementService({capture:async()=>capture,sample:async()=>({pixels:new Uint8Array(pixels),key:'display'}),analyze:async()=>{pixels.fill(255);return JSON.stringify(placement);},apply:()=>{applied=true;}});
  const result = await service.detect();assert.equal(applied,false);assert.match(result.reason,/screen changed/);assert.equal(result.busy,false);
});

test('manually moving or resizing the window cancels an earlier AutoDetect request', async () => {
  let complete!: (value:string)=>void, applied=false;
  const service=new SmartPlacementService({capture:async()=>capture,sample:async()=>({pixels:new Uint8Array(16),key:'display'}),analyze:()=>new Promise(resolve=>{complete=resolve;}),apply:()=>{applied=true;}});
  const pending=service.detect();await new Promise(resolve=>setImmediate(resolve));service.pause();complete(JSON.stringify(placement));
  await pending;assert.equal(applied,false);assert.equal(service.snapshot().busy,false);
});

test('Auto Smart ignores small or unstable pixel changes and waits for a substantial stable change', async t => {
  let now=100000; t.mock.method(Date,'now',()=>now);
  let pixels=new Uint8Array(400),calls=0;
  const service=new SmartPlacementService({capture:async()=>capture,sample:async()=>({pixels:new Uint8Array(pixels),key:'display'}),analyze:async()=>{calls++;return JSON.stringify(placement);},apply:()=>{}});
  service.setEnabled(true);await service.check();
  pixels.fill(255,0,8);await service.check();await service.check();assert.equal(calls,0);
  pixels.fill(255);await service.check();assert.equal(calls,0,'wait for stable screen');await service.check();assert.equal(calls,1);
  pixels.fill(0);await service.check();await service.check();assert.equal(calls,1,'cooldown prevents repeated requests');
  now+=31000;await service.check();await service.check();assert.equal(calls,2);service.dispose();
  assert.equal(changedScreenFraction(new Uint8Array(4),new Uint8Array([5,5,5,255])),0,'minor noise and alpha are ignored');
});
