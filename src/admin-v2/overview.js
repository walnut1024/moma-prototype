import { dayOf } from './analytics.js';
const DAY = 86400000, OFFSET = 8 * 3600000;

export function overviewPeriods(now = Date.now()) {
  const date = new Date(now + OFFSET);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - OFFSET;
  const rolling = days => {
    const start = midnight - (days - 1) * DAY;
    const range = `${dayOf(start).replaceAll('-', '/')}～${dayOf(midnight).replaceAll('-', '/')}`;
    return { id: days === 7 ? 'week' : 'month', label: `近 ${days} 天`, range, comparison: `对比前 ${days} 天同期`, start, end: now, previousStart: start - days * DAY, previousEnd: now - days * DAY };
  };
  return [
    { id:'day', label:'本日', comparison:'对比昨日同期', start:midnight, end:now, previousStart:midnight-DAY, previousEnd:now-DAY },
    rolling(7),
    rolling(30),
  ];
}
// Deterministic, rolling demo aggregates. These never write to the shared business store.
const HOUR=3600000;
const noise=seed=>{const value=Math.sin(seed*12.9898)*43758.5453;return value-Math.floor(value)};
export function overviewDemo(now=Date.now()) {
  const periods=overviewPeriods(now), today=periods[0].start;
  const start=Math.min(periods[2].previousStart,today-29*DAY);
  const hours=[];
  for(let at=start;at<now;at+=HOUR) {
    const hour=new Date(at+OFFSET).getUTCHours(), day=Math.floor((at+OFFSET)/DAY);
    const load=.38+1.1*Math.exp(-(((hour-14)/6)**2)), growth=1+(at-start)/DAY*.006;
    const total=Math.round(4800000*load*growth*(.85+noise(day)*.3)*(.92+noise(at/HOUR)*.16));
    const share=.62+noise(day+5)*.1;
    hours.push({at,total,self:Math.round(total*share),calls:Math.round(total/(1080+noise(day+7)*240)),share,
      response:780+noise(at/HOUR+2)*320,ttft:210+noise(at/HOUR+3)*180,tpot:20+noise(at/HOUR+4)*18});
  }
  const aggregate=(from,to)=>{
    const result={total:0,self:0,partner:0,unknown:0,calls:0,selfCalls:0,partnerCalls:0,unknownCalls:0,successfulCalls:0,responseSum:0,ttftSum:0,tpotSum:0,responseMax:0,ttftMax:0,tpotMax:0};
    for(const h of hours) {
      const fraction=Math.max(0,Math.min(to,h.at+HOUR)-Math.max(from,h.at))/HOUR;
      if(!fraction)continue;
      const calls=Math.round(h.calls*fraction),total=Math.round(h.total*fraction),self=Math.round(h.self*fraction),selfCalls=Math.round(calls*h.share);
      result.total+=total;result.self+=self;result.partner+=total-self;result.calls+=calls;result.selfCalls+=selfCalls;result.partnerCalls+=calls-selfCalls;
      result.successfulCalls+=Math.round(calls*(.9988+noise(h.at/HOUR+8)*.0009));
      for(const key of ['response','ttft','tpot']){result[key+'Sum']+=h[key]*calls;if(calls)result[key+'Max']=Math.max(result[key+'Max'],Math.round(h[key]*(key==='tpot'?3.8:5.2)))}
    }
    return result;
  };
  const trend=(length,step,first)=>Array.from({length},(_,i)=>{const at=first+i*step;return {at,label:new Date(at+OFFSET).toISOString().slice(5,step===HOUR?16:10).replace('T',' '),...aggregate(at,Math.min(at+step,now))}});
  const periodData=periods.map(p=>({...p,...aggregate(p.start,p.end),previous:aggregate(p.previousStart,p.previousEnd)}));
  const current=periodData[0], quality=key=>({avg:current.calls?current[key+'Sum']/current.calls:null,max:current.calls?current[key+'Max']:null,count:current.calls});
  const userTrend=Array.from({length:30},(_,i)=>{
    const at=today-(29-i)*DAY, day=Math.floor((at+OFFSET)/DAY), progress=Math.min(1,(now-at)/DAY);
    return {label:dayOf(at).slice(5),registered:Math.floor((104+i*1.7+noise(day)*35)*progress),cancelled:Math.floor((5+noise(day+1)*10)*progress),active:Math.floor((1840+i*25+noise(day+2)*430)*progress)};
  });
  const currentUsers=userTrend.at(-1);
  return {periods:periodData,success:current.calls?current.successfulCalls/current.calls*100:null,response:quality('response'),ttft:quality('ttft'),tpot:quality('tpot'),
    dayTrend:trend(30,DAY,today-29*DAY),hourTrend:trend(72,HOUR,Math.floor(now/HOUR)*HOUR-71*HOUR),userTrend,
    users:{registered:12400+userTrend.reduce((n,d)=>n+d.registered,0),dau:currentUsers.active,mau:8942,added:currentUsers.registered,cancelled:currentUsers.cancelled}};
}
export function overviewRanking(period,kind) {
  const names=kind==='user'?['用户 A-1024','用户 B-2086','用户 C-3012','用户 D-4068','用户 E-5019','用户 F-6032','用户 G-7025','用户 H-8091','用户 I-9036','用户 J-1088']:['DeepSeek-V4-Pro','Qwen3.8-Max','GLM-5.2','Kimi-K3','DeepSeek-V4-Flash','Qwen3.5-Plus','GLM-5.3','MiniMax-H3','BGE-M3','Qwen-Audio'];
  // Top 10 represents 80% of the platform; the remainder belongs to other objects.
  const weights=names.map((_,i)=>(11-i)*(0.8+noise(period.start/DAY+i+(kind==='user'?20:60))*.4));
  const selfWeights=weights.map((w,i)=>w*(.25+noise(i+42)*1.5)),partnerWeights=weights.map((w,i)=>w*(.25+noise(i+73)*1.5));
  const selfSum=selfWeights.reduce((a,b)=>a+b,0),partnerSum=partnerWeights.reduce((a,b)=>a+b,0);
  return names.map((name,i)=>{const selfFactor=selfWeights[i]/selfSum*.8,partnerFactor=partnerWeights[i]/partnerSum*.8,self=Math.round(period.self*selfFactor),partner=Math.round(period.partner*partnerFactor);return {id:kind+'-'+i,name,self,partner,unknown:0,total:self+partner,calls:Math.round(period.selfCalls*selfFactor+period.partnerCalls*partnerFactor)}}).sort((a,b)=>b.total-a.total);
}
export const overviewDate = time => dayOf(time);

export const compactCount = new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:2}).format;
