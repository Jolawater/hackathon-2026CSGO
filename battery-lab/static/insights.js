const f = (v, n=1) => Number(v).toFixed(n);
const p = v => `${f(v*100)}%`;
const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const zh = () => document.documentElement.lang.startsWith('zh');
function cards(title, items, note) {
  return `<section class="result-explainer"><div class="explainer-heading"><span>✦</span><h2>${esc(title)}</h2></div><div class="insight-grid">${items.map(([heading,body],i)=>`<article><span class="insight-index">0${i+1}</span><h3>${esc(heading)}</h3><p>${esc(body)}</p></article>`).join('')}</div><p class="insight-note">${esc(note)}</p></section>`;
}

export function deviceExplanation(r, alternative) {
  const m=r.metrics,s=r.input,items=[],isZh=zh();
  let status;
  if(m.feasible) status=isZh
    ? `在这 ${s.days} 天的模拟中，所有用电任务都完成了，最低备用电量和出发电量要求也都满足。`
    : `Across this ${s.days}-day simulation, all energy tasks, minimum reserve and departure requirements were met.`;
  else {
    const reasons=[];
    if(m.unmet_wh>1e-7)reasons.push(isZh?`有 ${f(m.unmet_wh,2)} Wh 的用电需求未完成`:`${f(m.unmet_wh,2)} Wh of demand went unserved`);
    if(m.min_soc+1e-7<s.reserve)reasons.push(isZh?`最低电量 ${p(m.min_soc)} 低于你设定的 ${p(s.reserve)} 备用线`:`minimum SOC ${p(m.min_soc)} was below your ${p(s.reserve)} reserve`);
    if(m.departure_soc+1e-7<s.departure_min)reasons.push(isZh?`最低出发电量 ${p(m.departure_soc)} 没达到 ${p(s.departure_min)} 的要求`:`lowest departure SOC ${p(m.departure_soc)} missed your ${p(s.departure_min)} requirement`);
    status=(isZh?'这个方案还需要调整：':'This strategy needs adjustment: ')+reasons.join(isZh?'；':'; ')+(isZh?'。':'.');
  }
  items.push([isZh?'够不够用？':'Will it cover your needs?',status]);
  items.push([isZh?'曲线怎么读？':'How do I read the curve?',isZh
    ? `上升表示电量在增加，下降表示电量在减少，水平段表示变化很小。虚线备用线是你预留的 ${p(s.reserve)}；低于它不一定已经关机，但应急余量已不够。结束时还剩 ${p(m.final_soc)}。`
    : `Rising means stored energy increases; falling means it decreases; a flat segment means little change. The dashed ${p(s.reserve)} reserve line is your emergency margin, not the shutdown level. Final SOC is ${p(m.final_soc)}.`]);
  if(alternative) {
    const b=alternative.metrics,delta=(v,n=1)=>`${v>0?'+':''}${f(v,n)}`;
    items.push([isZh?'换成 B，会有什么变化？':'What changes with strategy B?',isZh
      ? `相对 A，B 的最低出发电量变化 ${delta((b.departure_soc-m.departure_soc)*100)} 个百分点，累计充电时间变化 ${delta(b.charge_hours-m.charge_hours,2)} 小时，电费变化 HKD ${delta(b.cost-m.cost,3)}。B ${b.feasible?'满足全部约束':'仍有约束未满足'}。结束时 A 剩 ${p(m.final_soc)}、B 剩 ${p(b.final_soc)}；较低费用可能只是留下的储能更少，并不等于能效提高。`
      : `Compared with A, B changes lowest departure SOC by ${delta((b.departure_soc-m.departure_soc)*100)} percentage points, total charging by ${delta(b.charge_hours-m.charge_hours,2)} hours, and cost by HKD ${delta(b.cost-m.cost,3)}. B ${b.feasible?'meets every constraint':'still misses a constraint'}. Final SOC is ${p(m.final_soc)} for A and ${p(b.final_soc)} for B; lower cost can simply leave less energy stored, not mean higher efficiency.`]);
  } else items.push([isZh?'这段时间付出了什么？':'What does this period require?',isZh
    ? `累计发生 ${m.sessions} 次充电，共 ${f(m.charge_hours,2)} 小时，电费 HKD ${f(m.cost,3)}。${f(m.energy_cycles,2)} 个能量等效循环表示累计放出了多少额定电池能量，不是插拔充电器的次数。`
    : `${m.sessions} charging sessions total ${f(m.charge_hours,2)} hours and HKD ${f(m.cost,3)}. The ${f(m.energy_cycles,2)} energy-equivalent cycles describe cumulative discharged energy, not charger plug-ins.`]);
  if(s.cold_capacity_factor<1||s.heating_w>0)items.push([isZh?'冬天的影响在哪？':'Where does winter make a difference?',isZh
    ? `按你输入的假设，同样是 100% 电量，可用能量从 ${f(m.warm_full_wh)} Wh 变为 ${f(m.full_usable_wh)} Wh；使用期间取暖另需 ${f(m.heating_demand_wh)} Wh。这不代表永久健康度又下降了。`
    : `Under your assumptions, 100% SOC provides ${f(m.full_usable_wh)} Wh instead of ${f(m.warm_full_wh)} Wh, while active-period heating requires ${f(m.heating_demand_wh)} Wh. This is not an additional permanent loss of health.`]);
  return cards(isZh?'这次模拟告诉你什么':'What this simulation tells you',items,isZh
    ? '说明对应本次提交的输入和完整模拟时段。修改输入后请重新运行；图表采样点用于展示，最低电量等指标由完整计算得到。'
    : 'Explanation refers to the submitted inputs and full run. Rerun after editing. The chart displays sampled points; minimum SOC and other metrics use the full computation.');
}

export function agingExplanation(a) {
  const isZh=zh();
  if(!a.curve.length)return cards(isZh?'为什么没有寿命数字？':'Why is there no lifespan number?',[[isZh?'条件超出了依据':'Conditions exceed the evidence',isZh
    ? '下面仍会显示输入的电量轨迹，但当前条件不满足这个参考电芯模型的适用范围。“未输出”不等于“没有损耗”。请根据提示调整电芯温度、循环深度或充放电倍率。'
    : 'The input SOC trace is still shown, but this reference-cell model does not support the selected conditions. Missing output does not mean zero wear. Adjust cell temperature, cycle depth or rates according to the reasons above.']],isZh?'环境温度不能直接当作电芯温度。':'Ambient temperature is not automatically cell temperature.');
  const last=a.curve.at(-1);
  return cards(isZh?'怎样理解这条寿命曲线':'Understanding the aging curve',[
    [isZh?'容量保持率，不是剩余电量':'Capacity retention, not charge level',isZh
      ? `模拟到第 ${last.day} 天，参考电芯容量保持率为 ${p(last.soh)}。相对初始容量减少了 ${f((1-last.soh)*100)} 个百分点；这不表示现在只充到了 ${p(last.soh)}。`
      : `At day ${last.day}, the reference cell retains ${p(last.soh)} of its initial capacity, a loss of ${f((1-last.soh)*100)} percentage points. This does not mean its current charge level is ${p(last.soh)}.`],
    [isZh?'损耗来自哪里？':'What contributes to the loss?',isZh
      ? `模型中，随时间累积的日历损耗为 ${f(last.calendar_loss*100)} 个百分点，充放电相关的循环损耗为 ${f(last.cycle_loss*100)} 个百分点。两项相加构成此处的容量损失。`
      : `The model attributes ${f(last.calendar_loss*100)} percentage points to calendar aging over time and ${f(last.cycle_loss*100)} to cycling. Together they form the capacity loss shown here.`],
    [isZh?'什么时候算达到 80%？':'What does the 80% line mean?',a.threshold_day!=null
      ? (isZh?`在第 ${a.threshold_day} 天首次达到或低于 80%。这是容量参考阈值，不是电池死亡或安全界限。`:`Capacity first reaches or falls below 80% on day ${a.threshold_day}. This is a reporting threshold, not battery death or a safety limit.`)
      : (isZh?`在已完成的 ${last.day} 天内尚未达到 80%。不能据此推断还能用多少年。${a.status==='stopped_at_boundary'?'实验已经到达适用边界，后续不再预测。':''}`:`The completed ${last.day} days do not reach 80%. This does not establish remaining years of life.${a.status==='stopped_at_boundary'?' The evidence boundary was reached, so the forecast stops here.':''}`)],
  ],isZh?'本结果只描述参考电芯。图上明确标示纵轴范围；下方 SOC 图描述充放电，SOH 图描述长期容量变化。':'These results describe the reference cell only. The vertical range is explicitly labeled; SOC shows charging/discharging, while SOH shows long-term capacity change.');
}
