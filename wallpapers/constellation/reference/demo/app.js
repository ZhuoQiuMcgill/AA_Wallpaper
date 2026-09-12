(() => {
  'use strict';

  const DATA = window.COSMOS_DATA;
  const TOP_N = 40;
  const canvas = document.getElementById('space');
  const ctx = canvas.getContext('2d', {alpha:false});
  const svg = document.getElementById('lines');
  const atlas = document.getElementById('atlas');
  const inspector = document.getElementById('inspector');
  const TAU = Math.PI * 2;

  const ui = {
    version: document.getElementById('indexVersion'), updated: document.getElementById('updatedAt'), topN: document.getElementById('topN'), source: document.getElementById('source'),
    rank: document.getElementById('iRank'), variant: document.getElementById('iVariant'), score: document.getElementById('iScore'), name: document.getElementById('iName'), creator: document.getElementById('iCreator'),
    coding: document.getElementById('iCoding'), agentic: document.getElementById('iAgentic'), tps: document.getElementById('iTps'), ttft: document.getElementById('iTtft'), priceIn: document.getElementById('iPriceIn'), priceOut: document.getElementById('iPriceOut'), release: document.getElementById('iRelease'), familyCount: document.getElementById('iFamilyCount')
  };

  const S = {w:0,h:0,dpr:1,models:[],groups:[],singletons:[],bg:[],modelById:new Map(),familyCounts:new Map(),fps:15,ambient:.28,last:0};

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function lerp(a,b,t){return a+(b-a)*t;}
  function hash(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0;}
  function rand(s,salt=''){let x=hash(`${s}|${salt}`)||1;x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967295;}
  function esc(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
  function fmt(v,d=1){if(v==null||Number.isNaN(v))return '—';return Number(v).toFixed(d).replace(/\.0$/,'');}
  function money(v){if(v==null)return '—';if(v===0)return '$0';if(v<.1)return `$${v.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')}`;if(v<10)return `$${v.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}`;return `$${v.toFixed(0)}`;}
  function parseHex(hex){if(!hex||!/^#[0-9a-f]{6}$/i.test(hex))return [176,194,226];return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
  function lum(rgb){return (.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])/255;}
  function visibleRGB(hex){let rgb=parseHex(hex),l=lum(rgb);if(l<.28){const a=clamp((.5-l)/.5,.42,.82);rgb=rgb.map(c=>Math.round(lerp(c,238,a)))}return rgb;}
  function rgba(rgb,a){return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;}
  function rgbstr(rgb){return `${rgb[0]},${rgb[1]},${rgb[2]}`;}
  function dateShort(iso){const d=new Date(iso);return `${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}Z`;}

  // Constellation grammar. Shapes are intentionally non-radial and visually distinct.
  const TEMPLATES = {
    2:[
      {name:'binary-diagonal',p:[[-.58,.34],[.58,-.34]],e:[[0,1]]},
      {name:'binary-vertical',p:[[0,-.62],[.10,.62]],e:[[0,1]]},
      {name:'binary-wide',p:[[-.68,-.08],[.68,.18]],e:[[0,1]]}
    ],
    3:[
      {name:'hook',p:[[-.62,-.46],[-.08,-.05],[.52,.54]],e:[[0,1],[1,2]]},
      {name:'fork',p:[[0,-.66],[-.56,.48],[.58,.38]],e:[[0,1],[0,2]]},
      {name:'elbow',p:[[-.58,-.50],[-.56,.44],[.58,.48]],e:[[0,1],[1,2]]},
      {name:'slash',p:[[-.66,.46],[-.05,.02],[.66,-.40]],e:[[0,1],[1,2]]}
    ],
    4:[
      {name:'lyra-open',p:[[-.48,-.55],[.48,-.28],[.38,.55],[-.54,.34]],e:[[0,1],[1,2],[2,3]]},
      {name:'twins',p:[[-.42,-.58],[.42,-.58],[-.38,.56],[.46,.46]],e:[[0,2],[1,3],[0,1]]},
      {name:'zigzag',p:[[-.68,-.43],[-.18,-.06],[.32,.43],[.66,-.35]],e:[[0,1],[1,2],[2,3]]},
      {name:'kite',p:[[0,-.70],[.60,-.02],[-.02,.68],[-.58,.10]],e:[[0,1],[1,2],[2,3],[3,0]]}
    ],
    5:[
      {name:'diamond-tail',p:[[0,-.68],[.58,-.08],[.02,.46],[-.58,-.08],[.20,.82]],e:[[0,1],[1,2],[2,3],[3,0],[2,4]]},
      {name:'crown',p:[[-.66,.36],[-.35,-.20],[0,-.58],[.35,-.20],[.66,.36]],e:[[0,1],[1,2],[2,3],[3,4]]},
      {name:'scorpion',p:[[-.65,-.55],[-.30,-.22],[.08,.02],[.48,.12],[.62,.64]],e:[[0,1],[1,2],[2,3],[3,4]]},
      {name:'forked-spine',p:[[0,-.68],[0,-.20],[.02,.34],[-.58,.72],[.58,.70]],e:[[0,1],[1,2],[2,3],[2,4]]},
      {name:'lyra-plus',p:[[-.46,-.43],[.42,-.34],[.50,.45],[-.38,.52],[-.68,-.72]],e:[[0,1],[1,2],[2,3],[3,0],[0,4]]}
    ],
    6:[
      {name:'gemini',p:[[-.42,-.68],[.42,-.66],[-.40,-.03],[.40,.02],[-.36,.68],[.44,.62]],e:[[0,2],[2,4],[1,3],[3,5],[0,1],[4,5]]},
      {name:'serpent',p:[[-.70,-.52],[-.35,-.18],[.05,-.42],[.30,.02],[.63,.22],[.40,.68]],e:[[0,1],[1,2],[2,3],[3,4],[4,5]]},
      {name:'dipper',p:[[-.68,.42],[-.30,.24],[.04,.44],[.40,.26],[.58,-.22],[.24,-.66]],e:[[0,1],[1,2],[2,3],[3,4],[4,5]]},
      {name:'split-spine',p:[[0,-.72],[0,-.28],[0,.16],[0,.62],[-.58,.18],[.58,.46]],e:[[0,1],[1,2],[2,3],[2,4],[3,5]]}
    ]
  };

  function templateFor(group){
    const n=group.models.length;
    const list=TEMPLATES[n]||TEMPLATES[6];
    const spread=group.models[group.models.length-1].rank_intelligence-group.models[0].rank_intelligence;
    const seed=hash(group.key + '|' + n + '|' + Math.min(spread,20));
    return list[(seed + (group.shapeOrdinal||0))%list.length];
  }

  function prepare(){
    S.models=DATA.models.filter(m=>m.rank_intelligence!=null&&m.rank_intelligence<=TOP_N).sort((a,b)=>a.rank_intelligence-b.rank_intelligence);
    S.models.forEach(m=>S.modelById.set(m.id,m));
    const map=new Map();
    for(const m of S.models){if(!map.has(m.family_key))map.set(m.family_key,[]);map.get(m.family_key).push(m);}
    const groups=[];const singletons=[];
    for(const [key,models] of map){models.sort((a,b)=>a.rank_intelligence-b.rank_intelligence);S.familyCounts.set(key,models.length);if(models.length>=2)groups.push({key,family:models[0].family,creator:models[0].creator,color:models[0].creator_color,models,best:models[0]});else singletons.push(models[0]);}
    groups.sort((a,b)=>b.models.length-a.models.length||a.best.rank_intelligence-b.best.rank_intelligence);
    const ordinals=new Map();
    groups.forEach(g=>{const n=g.models.length;const o=ordinals.get(n)||0;g.shapeOrdinal=o;ordinals.set(n,o+1);});
    singletons.sort((a,b)=>a.rank_intelligence-b.rank_intelligence);
    S.groups=groups;S.singletons=singletons;
    ui.version.textContent=DATA.intelligence_index_version||'—';ui.updated.textContent=`UPDATED ${dateShort(DATA.fetched_at)}`;ui.topN.textContent=TOP_N;ui.source.textContent=DATA.attribution||'Data: Artificial Analysis';
  }

  const GROUP_SLOTS=[
    {x:.20,y:.33,w:.16,h:.19},{x:.49,y:.31,w:.17,h:.22},{x:.77,y:.34,w:.16,h:.20},
    {x:.30,y:.68,w:.14,h:.15},{x:.61,y:.68,w:.14,h:.16},{x:.11,y:.68,w:.105,h:.11},{x:.84,y:.68,w:.105,h:.11}
  ];
  const SINGLE_SLOTS=[
    [.91,.28],[.90,.42],[.91,.55],[.91,.80],[.74,.84],[.59,.86],[.46,.86],[.18,.86],[.07,.84],[.07,.51],[.08,.39],[.36,.48],[.63,.49],[.78,.53],
    [.41,.55],[.53,.53],[.70,.58],[.22,.53],[.34,.38],[.65,.25]
  ];

  function resize(){
    S.w=innerWidth;S.h=innerHeight;S.dpr=Math.max(1,Math.min(devicePixelRatio||1,2));
    canvas.width=Math.round(S.w*S.dpr);canvas.height=Math.round(S.h*S.dpr);canvas.style.width=S.w+'px';canvas.style.height=S.h+'px';ctx.setTransform(S.dpr,0,0,S.dpr,0,0);
    svg.setAttribute('viewBox',`0 0 ${S.w} ${S.h}`);svg.setAttribute('width',S.w);svg.setAttribute('height',S.h);
    buildAtlas();buildBackground();
  }

  function buildAtlas(){
    atlas.innerHTML='';svg.innerHTML=`<defs><filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    const topSafe=145,bottomSafe=90;
    S.groups.forEach((g,i)=>{
      const slot=GROUP_SLOTS[i%GROUP_SLOTS.length];
      const cx=slot.x*S.w,cy=Math.max(topSafe,Math.min(S.h-bottomSafe,slot.y*S.h));
      const sw=slot.w*S.w,sh=slot.h*S.h;
      const rgb=visibleRGB(g.color);const t=templateFor(g);g.layout={cx,cy,sw,sh,t,rgb};

      const fam=document.createElement('section');fam.className='family';fam.style.setProperty('--c',rgbstr(rgb));fam.style.left=(cx-sw/2)+'px';fam.style.top=(cy-sh/2)+'px';fam.style.width=sw+'px';fam.style.height=sh+'px';
      const ft=document.createElement('div');ft.className='family-title';ft.style.left=(sw/2)+'px';ft.style.top=(sh/2)+'px';ft.innerHTML=`<div class="family-name">${esc(g.family)}</div><div class="family-sub">${g.models.length} VARIANTS IN TOP ${TOP_N} · ${esc(t.name.replaceAll('-',' '))}</div>`;fam.appendChild(ft);

      const pts=t.p.map(([x,y])=>({x:cx+x*sw*.43,y:cy+y*sh*.43}));
      // lines first
      t.e.forEach(([a,b])=>{const pa=pts[a],pb=pts[b];const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',pa.x);line.setAttribute('y1',pa.y);line.setAttribute('x2',pb.x);line.setAttribute('y2',pb.y);line.setAttribute('stroke',rgba(rgb,.27));line.setAttribute('stroke-width','1.05');line.setAttribute('filter','url(#softGlow)');svg.appendChild(line);});
      pts.forEach((p,idx)=>{const m=g.models[idx];const node=makeStarNode(m,g.models.length,rgb,idx===0);node.style.left=(p.x-(cx-sw/2))+'px';node.style.top=(p.y-(cy-sh/2))+'px';fam.appendChild(node);});
      atlas.appendChild(fam);
    });

    S.singletons.forEach((m,i)=>{const slot=SINGLE_SLOTS[i%SINGLE_SLOTS.length];const rgb=visibleRGB(m.creator_color);const n=document.createElement('div');n.className='singleton';n.style.setProperty('--c',rgbstr(rgb));n.style.left=(slot[0]*S.w)+'px';n.style.top=(slot[1]*S.h)+'px';n.innerHTML=`<div class="s-top"><span class="s-rank">${String(m.rank_intelligence).padStart(2,'0')}</span><span class="s-score">${fmt(m.intelligence,1)}</span></div><div class="s-name">${esc(m.short_label)}</div>`;wireHover(n,m);atlas.appendChild(n);});
  }

  function makeStarNode(m,count,rgb,isBest){
    const n=document.createElement('div');
    n.className='star-node'+(isBest?' best':'')+(m.rank_intelligence<=3?' top3':'');n.style.setProperty('--c',rgbstr(rgb));
    const variant=m.short_variant||m.variant||'base';
    n.innerHTML=`<div class="spark"></div><div class="rankline"><span class="rank">${String(m.rank_intelligence).padStart(2,'0')}</span><span class="score">${fmt(m.intelligence,1)}</span></div><div class="variant">${esc(variant)}</div>`;
    wireHover(n,m);return n;
  }

  function wireHover(node,m){
    node.addEventListener('mouseenter',()=>showInspector(m,node));node.addEventListener('mousemove',()=>positionInspector(node));node.addEventListener('mouseleave',()=>inspector.classList.remove('visible'));
  }

  function showInspector(m,node){
    ui.rank.textContent=`#${String(m.rank_intelligence).padStart(2,'0')}`;ui.variant.textContent=m.short_variant||m.variant||'BASE';ui.score.textContent=fmt(m.intelligence,1);ui.name.textContent=m.family;ui.creator.textContent=m.creator;ui.coding.textContent=fmt(m.coding,1);ui.agentic.textContent=fmt(m.agentic,1);ui.tps.textContent=m.tps==null?'—':`${fmt(m.tps,1)} tok/s`;ui.ttft.textContent=m.ttft_s==null?'—':`${fmt(m.ttft_s,2)} s`;ui.priceIn.textContent=m.price_in==null?'—':`${money(m.price_in)} / 1M`;ui.priceOut.textContent=m.price_out==null?'—':`${money(m.price_out)} / 1M`;ui.release.textContent=m.days_since_release==null?'—':m.days_since_release===0?'today':`${m.days_since_release}d ago`;ui.familyCount.textContent=`${S.familyCounts.get(m.family_key)||1} in top ${TOP_N}`;
    const rgb=visibleRGB(m.creator_color);inspector.style.borderColor=rgba(rgb,.20);inspector.style.boxShadow=`0 24px 80px rgba(0,0,0,.52),0 0 44px ${rgba(rgb,.055)},inset 0 1px 0 rgba(255,255,255,.035)`;inspector.classList.add('visible');positionInspector(node);
  }
  function positionInspector(node){const r=node.getBoundingClientRect(),iw=365,ih=295;let x=r.right+18,y=r.top-30;if(x+iw>S.w-22)x=r.left-iw-20;if(x<22)x=22;if(y+ih>S.h-78)y=S.h-ih-82;if(y<28)y=28;inspector.style.left=x+'px';inspector.style.top=y+'px';}

  function buildBackground(){
    const list=DATA.families.filter(f=>f.rank!=null&&f.rank>TOP_N&&f.rank<=300);S.bg=list.map(f=>{const rgb=visibleRGB(f.creator_color);return{x:rand(f.family_key,'x')*S.w,y:rand(f.family_key,'y')*S.h,r:.45+rand(f.family_key,'r')*1.05,rgb,phase:rand(f.family_key,'p')*TAU,newish:f.days_since_release!=null&&f.days_since_release<=30};});
  }

  function draw(t){
    ctx.fillStyle='#030610';ctx.fillRect(0,0,S.w,S.h);
    const g=ctx.createRadialGradient(S.w*.5,S.h*.48,20,S.w*.5,S.h*.48,Math.max(S.w,S.h)*.75);g.addColorStop(0,'rgba(20,31,57,.23)');g.addColorStop(.42,'rgba(7,15,31,.12)');g.addColorStop(1,'rgba(2,4,11,0)');ctx.fillStyle=g;ctx.fillRect(0,0,S.w,S.h);
    // deterministic deep stars
    const n=Math.round(S.w*S.h/9000);for(let i=0;i<n;i++){const x=rand(String(i),'sx')*S.w,y=rand(String(i),'sy')*S.h,r=.22+rand(String(i),'sr')*.7,a=.07+rand(String(i),'sa')*.22;ctx.fillStyle=`rgba(195,211,239,${a})`;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
    ctx.save();ctx.globalCompositeOperation='screen';for(const s of S.bg){const x=s.x+Math.cos(t*.000018+s.phase)*S.ambient*1.4,y=s.y+Math.sin(t*.000014+s.phase)*S.ambient;const a=.12+.05*Math.sin(t*.0003+s.phase);ctx.fillStyle=rgba(s.rgb,a);ctx.beginPath();ctx.arc(x,y,s.r,0,TAU);ctx.fill();if(s.newish){ctx.strokeStyle=rgba(s.rgb,.028);ctx.lineWidth=.6;ctx.beginPath();ctx.arc(x,y,s.r*4,0,TAU);ctx.stroke();}}ctx.restore();
  }
  function loop(t){if(t-S.last>1000/S.fps){S.last=t;draw(t)}requestAnimationFrame(loop);}

  window.wallpaperPropertyListener={
    applyUserProperties(props){if(props.ambientmotion)S.ambient=clamp(props.ambientmotion.value/100,0,1);},
    applyGeneralProperties(props){if(props&&props.fps!=null)S.fps=props.fps===0?60:Math.max(1,props.fps);}
  };

  prepare();addEventListener('resize',resize);resize();requestAnimationFrame(loop);
})();
