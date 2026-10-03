import assert from 'node:assert/strict';
import fs from 'node:fs';
import {forecast} from '../static/workshop-model.mjs';
import {coldFactor} from '../static/cold-reference.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../static/data/p28a-temperature.json',import.meta.url)));
const config={target:.8,ambient:22,loadW:2,chargerW:12,connected:true,startHour:22};
const events=[{minute:0,config},{minute:120,config:{...config,connected:false,ambient:5}}];
const a=forecast(events,data),b=forecast(events,data);
assert.deepEqual(a,b);
assert.equal(a.length,1441);
assert.equal(a[119].config.connected,true);assert.equal(a[120].config.connected,false);
for(const s of a){assert(s.energy>=0&&s.energy<=15);assert(Math.abs(s.balanceError??0)<1e-8);assert(Number.isFinite(s.batteryC));}
assert(coldFactor(data,0)>.92&&coldFactor(data,0)<.93);
assert.equal(coldFactor(data,23),1);assert.equal(coldFactor(data,-41),null);
const cold=forecast([{minute:0,config:{...config,connected:false,ambient:-10}}],data);
assert(cold.at(-1).energy>0);assert(cold.at(-1).unservedWh>0);
assert(Math.abs(cold.at(-1).balanceError)<1e-8);
console.log('Workshop determinism, cold bounds, timeline snapshots and energy balance passed');
