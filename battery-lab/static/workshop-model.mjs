// Illustrative two-node thermal model, not calibrated to any phone.
import {coldFactor} from './cold-reference.mjs';
export const PARAMETERS = Object.freeze({capacityWh:15, voltage:3.85, resistance:.12,
  efficiency:.9, batteryHeatCapacity:75, shellHeatCapacity:100, conductance:.6,
  airConductance:.25, deviceLossFraction:.5, maxHours:24});
export const LOADS = Object.freeze({standby:.3,video:2,navigation:3,game:5});
export function initialState(config={}) {
  const ambient=config.ambient??22;
  return {seconds:0,energy:PARAMETERS.capacityWh*(config.initialSoc??.35),batteryC:ambient,shellC:ambient,
    gridWh:0,loadWh:0,lossWh:0,unservedWh:0,chargeW:0,peakC:ambient,initialEnergy:PARAMETERS.capacityWh*(config.initialSoc??.35),events:[],trace:[],lastMinute:-1,done:false};
}
export function advance(state, config, elapsed, reference=null) {
  const p=PARAMETERS,s={...state,events:[...state.events],trace:[...state.trace]};
  const target=Math.max(.05,Math.min(1,config.target)), ambient=config.ambient;
  let remaining=Math.min(Math.max(0,elapsed),p.maxHours*3600-s.seconds);
  while(remaining>1e-8) {
    const dt=Math.min(1,remaining),clock=((config.startHour??22)+s.seconds/3600)%24;
    const activeWindow=config.scheduleEnabled ? ((clock-(config.chargeHour??23)+24)%24)<(config.chargeDuration??4) : true;
    const permitted=config.connected&&activeWindow&&s.batteryC>=0&&s.batteryC<45;
    const load=config.loadW??LOADS.standby;
    let input=permitted?(config.chargerW??12)*(s.energy/p.capacityWh>=.8?.5:1):0;
    // At or near target, charger can serve the load without increasing stored energy.
    input=Math.min(input,Math.max(0,(p.capacityWh*target-s.energy)*3600/dt+load)/p.efficiency);
    const current=(input*p.efficiency-load)/p.voltage;
    const joule=current*current*p.resistance;
    const requested=(load+joule)*dt/3600;
    const factor=reference?coldFactor(reference,s.batteryC):1;
    s.coldFactor=factor;
    // Cold makes a fraction inaccessible; it does not destroy stored energy.
    const blocked=p.capacityWh*(1-(factor??1));
    const stored=s.energy+input*p.efficiency*dt/3600;
    const available=Math.max(0,stored-blocked);
    const ratio=requested>0?Math.min(1,available/requested):1;
    const delivered=load*ratio,jouleActual=joule*ratio;
    s.energy=Math.max(0,Math.min(p.capacityWh,stored-requested*ratio));
    s.accessibleWh=Math.max(0,s.energy-blocked);
    s.gridWh+=input*dt/3600;s.loadWh+=delivered*dt/3600;
    s.lossWh+=(input*(1-p.efficiency)+jouleActual)*dt/3600;
    s.unservedWh+=(load-delivered)*dt/3600;
    const transfer=p.conductance*(s.batteryC-s.shellC);
    const cooling=p.airConductance*(s.shellC-ambient);
    // Only an assumed fraction of charging losses occurs inside the phone.
    const shellHeat=delivered+input*(1-p.efficiency)*p.deviceLossFraction;
    s.batteryC+=(jouleActual-transfer)*dt/p.batteryHeatCapacity;
    s.shellC+=(shellHeat+transfer-cooling)*dt/p.shellHeatCapacity;
    s.peakC=Math.max(s.peakC,s.batteryC,s.shellC);s.chargeW=input;
    s.seconds+=dt;remaining-=dt;
    const minute=Math.floor(s.seconds/60);
    s.lastMinute=minute;
  }
  s.done=s.seconds>=p.maxHours*3600;
  s.balanceError=s.initialEnergy+s.gridWh-s.loadWh-s.lossWh-s.energy;
  return s;
}

// Replay events at exact minute boundaries. Each snapshot includes environment and controls.
export function forecast(events,reference){
  const sorted=[...events].sort((a,b)=>a.minute-b.minute);
  let config={...sorted[0].config},state=initialState(config),index=1;
  state.coldFactor=coldFactor(reference,state.batteryC);
  state.accessibleWh=Math.max(0,state.energy-PARAMETERS.capacityWh*(1-(state.coldFactor??1)));
  const snapshots=[];
  for(let minute=0;minute<=1440;minute++){
    while(index<sorted.length&&sorted[index].minute<=minute)config={...sorted[index++].config};
    snapshots.push({...state,config:{...config}});
    if(minute<1440)state=advance(state,config,60,reference);
  }
  return snapshots;
}
