const colors = ['#16735b', '#d48636', '#628ccc'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let chartId = 0;
const datasets = new Map();

export function renderChart(series, xLabel, yLabel, maxX, options = {}) {
  const zh = document.documentElement.lang.startsWith('zh');
  const id = `plot-${++chartId}`;
  // Playback generates many frames; discard data belonging to detached charts.
  if (datasets.size > 50) {
    for (const key of datasets.keys()) {
      if (Number(key.slice(5)) < chartId - 20 && !document.getElementById(key)) datasets.delete(key);
    }
  }
  const compact = window.innerWidth <= 760;
  const W = compact ? 420 : 840, H = compact ? 300 : 340;
  const L = compact ? 42 : 62, R = compact ? 16 : 30, T = 44, B = 52;
  const end = maxX || Math.max(1, ...series.flatMap(s => s.points.map(p => p[0])));
  const health = yLabel.startsWith('SOH');
  const lowest = Math.min(100, ...series.flatMap(s => s.points.map(p => p[1])));
  const yMin = health ? Math.max(0, Math.min(80, Math.floor((lowest - 2) / 5) * 5)) : 0;
  const x = v => L + v / end * (W - L - R);
  const y = v => H - B - (v - yMin) / (100 - yMin) * (H - T - B);
  const timeLabel = v => {
    if (health) return `${v.toFixed(v % 1 ? 1 : 0)} ${/EFC|cycle/i.test(xLabel)?'EFC':zh ? '天' : 'days'}`;
    const minutes = Math.round(v * 60), day = Math.floor(minutes / 1440);
    const clock = `${String(Math.floor(minutes % 1440 / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    return day ? `${zh ? '第' : 'Day '}${day + 1}${zh ? '天 ' : ' · '}${clock}` : clock;
  };
  let svg = `<defs><linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors[0]}" stop-opacity=".17"/><stop offset="1" stop-color="${colors[0]}" stop-opacity=".01"/></linearGradient><clipPath id="${id}-clip"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs>`;
  svg += `<text class="axis-title" x="${L}" y="21">${escape(health ? (zh ? '容量保持率 · %' : 'Capacity retention · %') : (zh ? '剩余电量 · %' : 'State of charge · %'))}</text>`;
  for (let i = 0; i <= 4; i++) {
    const value = yMin + (100 - yMin) * i / 4;
    svg += `<line x1="${L}" x2="${W-R}" y1="${y(value)}" y2="${y(value)}" stroke="#e0e8e1" stroke-dasharray="3 5"/><text x="${L-12}" y="${y(value)+4}" text-anchor="end">${Number(value.toFixed(1))}</text>`;
  }
  for (let i = 0; i <= 4; i++) {
    const at = end * i / 4;
    const tick = health ? `${Number(at.toFixed(1))}` : end <= 24 ? (at===24?'24:00':timeLabel(at)) : `${Number((at/24).toFixed(1))}${zh ? '天' : 'd'}`;
    svg += `<line x1="${x(at)}" x2="${x(at)}" y1="${T}" y2="${H-B}" stroke="#edf1ec"/><text x="${x(at)}" y="${H-B+25}" text-anchor="${i===0?'start':i===4?'end':'middle'}">${escape(tick)}</text>`;
  }
  svg += `<text x="${(L+W-R)/2}" y="${H-5}" text-anchor="middle">${escape(xLabel)}</text>`;
  const reference = health ? 80 : options.reserve;
  if (reference != null && reference >= yMin) {
    if (!health) svg += `<rect x="${L}" y="${y(reference)}" width="${W-L-R}" height="${H-B-y(reference)}" fill="#f7dfca" opacity=".3"/>`;
    svg += `<line class="reference-line" x1="${L}" x2="${W-R}" y1="${y(reference)}" y2="${y(reference)}" stroke="#bc7842" stroke-dasharray="7 5"/><text class="reference-label" x="${W-R-4}" y="${y(reference)-7}" text-anchor="end">${escape(health ? (zh ? '80% 容量参考线' : '80% capacity reference') : `${zh ? '备用线' : 'Reserve'} ${reference.toFixed(0)}%`)}</text>`;
  }
  series.forEach((s, i) => {
    if (!s.points.length) return;
    const path = s.points.map((p,j) => `${j?'L':'M'}${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`).join(' ');
    const first = s.points[0], last = s.points.at(-1);
    if (!i) svg += `<path d="${path} L${x(last[0])},${H-B} L${x(first[0])},${H-B} Z" fill="url(#${id}-fill)" clip-path="url(#${id}-clip)"/>`;
    svg += `<path class="data-line" d="${path}" fill="none" stroke="${colors[i%3]}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" ${i===1?'stroke-dasharray="8 4"':''} clip-path="url(#${id}-clip)"/>`;
    svg += `<circle cx="${x(last[0])}" cy="${y(last[1])}" r="4.5" fill="${colors[i%3]}" stroke="white" stroke-width="2"/>`;
  });
  svg += `<g class="plot-cursor" style="display:none"><line y1="${T}" y2="${H-B}" stroke="#688979" stroke-dasharray="3 3"/>${series.map((_,i)=>`<circle r="5" fill="${colors[i%3]}" stroke="white" stroke-width="2"/>`).join('')}</g>`;
  datasets.set(id, {series, end, x, y, L, R, W, timeLabel, index:0});
  return `<div id="${id}" class="interactive-chart" tabindex="0" role="group" aria-label="${escape(yLabel+' / '+xLabel)}"><div class="chart-meta"><span>${zh ? '模拟轨迹' : 'Simulated trajectory'}</span><span>${health ? `${zh?'纵轴':'Y axis'} ${yMin}–100%` : zh?'纵轴 0–100%':'Y axis 0–100%'}</span></div><svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><title>${escape(yLabel+' / '+xLabel)}</title>${svg}</svg><div class="chart-tooltip" hidden></div><div class="chart-legend">${series.map((s,i)=>`<span><i style="--series:${colors[i%3]};${i===1?'border-top-style:dashed':''}"></i>${escape(s.name)}<b>${s.points.at(-1)?.[1].toFixed(1)??'—'}%</b></span>`).join('')}</div><p class="chart-instruction">${zh?'移动鼠标、轻触图表，或用左右方向键查看数值。折线连接模拟采样点。':'Hover, touch, or use the left/right arrow keys to inspect values. Lines connect simulation samples.'}</p></div>`;
}

function showPoint(el, time) {
  const d = datasets.get(el.id);
  if (!d) return;
  const nearest = points => {
    let lo=0, hi=points.length-1;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(points[mid][0]<time)lo=mid+1;else hi=mid;}
    return lo>0&&Math.abs(points[lo-1][0]-time)<Math.abs(points[lo][0]-time)?lo-1:lo;
  };
  d.index = nearest(d.series[0].points);
  const at = d.series[0].points[d.index][0];
  const g=el.querySelector('.plot-cursor');g.style.display='';
  const line=g.querySelector('line');line.setAttribute('x1',d.x(at));line.setAttribute('x2',d.x(at));
  const values=d.series.map((s,i)=>{
    const p=s.points[nearest(s.points)], dot=g.querySelectorAll('circle')[i];
    dot.setAttribute('cx',d.x(p[0]));dot.setAttribute('cy',d.y(p[1]));
    return `<div><span>${escape(s.name)}</span><b>${p[1].toFixed(2)}%</b></div>`;
  });
  const tip=el.querySelector('.chart-tooltip');tip.hidden=false;
  tip.innerHTML=`<strong>${escape(d.timeLabel(at))}</strong>${values.join('')}`;
  tip.style.left=at/d.end>.55?'12px':'auto';tip.style.right=at/d.end>.55?'auto':'12px';
}
function inspectPointer(e) {
  const el=e.target.closest('.interactive-chart');if(!el)return;
  const d=datasets.get(el.id);if(!d)return;
  const box=el.querySelector('svg').getBoundingClientRect();
  showPoint(el, Math.max(0,Math.min(d.end,((e.clientX-box.left)/box.width*d.W-d.L)/(d.W-d.L-d.R)*d.end)));
}
document.addEventListener('pointermove', inspectPointer);
document.addEventListener('pointerdown', inspectPointer);
document.addEventListener('focusin',e=>{if(e.target.matches('.interactive-chart:focus-visible'))showPoint(e.target,0)});
document.addEventListener('pointerout', e=>{
  const el=e.target.closest('.interactive-chart');
  if(!el || e.pointerType!=='mouse' || el.contains(e.relatedTarget) || el.matches(':focus-visible'))return;
  el.querySelector('.chart-tooltip').hidden=true;
  el.querySelector('.plot-cursor').style.display='none';
});
document.addEventListener('keydown',e=>{
  const el=e.target.closest('.interactive-chart'),d=el&&datasets.get(el.id);if(!d)return;
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  const points=d.series[0].points;
  const idx=e.key==='Home'?0:e.key==='End'?points.length-1:Math.max(0,Math.min(points.length-1,d.index+(e.key==='ArrowRight'?1:-1)));
  showPoint(el,points[idx][0]);
});
