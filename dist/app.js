const $ = (s) => document.querySelector(s);
let researchers = [];
let activeThemes = { a: [], b: [] };

const MATURITY_LABELS = { nascent: 'Iniziale', emerging: 'Emergente', active: 'Attiva', established: 'Consolidata' };
const STOP = new Set(['and','the','for','with','from','under','analysis','models','systems','research','time','dynamic']);

function initials(name){return name.split(' ').map(x=>x[0]).join('').slice(0,2)}
function escapeHtml(s=''){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
function slug(s=''){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function selected(){return [researchers.find(r=>r.id===$('#researcherA').value),researchers.find(r=>r.id===$('#researcherB').value)]}

async function init(){
  researchers = await fetch('./data/researchers.json').then(r=>r.json());
  const opts=researchers.map(r=>`<option value="${r.id}">${r.name} · ${r.role}</option>`).join('');
  $('#researcherA').innerHTML=opts; $('#researcherB').innerHTML=opts; $('#researcherB').selectedIndex=1;
  ['researcherA','researcherB'].forEach(id=>$('#'+id).addEventListener('change',resetFlow));
  $('#themesBtn').addEventListener('click',generateThemes);
  $('#analyzeBtn').addEventListener('click',runAnalysis);
  renderProfiles();
}

function resetFlow(){
  activeThemes={a:[],b:[]};
  $('#themesPanel').classList.add('hidden'); $('#dashboard').classList.add('hidden');
  setStep(1); renderProfiles();
}

function setStep(n){
  [1,2,3].forEach(i=>$('#step'+i+'Badge').classList.toggle('active',i<=n));
}

function renderProfiles(){
  const [a,b]=selected();
  $('#themesBtn').disabled=!a||!b||a.id===b.id;
  $('#statusText').textContent=a?.id===b?.id?'Scegli due ricercatori diversi':'Pronto a generare le tematiche';
  $('#profiles').innerHTML=[a,b].filter(Boolean).map(r=>`<article class="card profile"><div class="avatar" style="background:${r.accent}">${initials(r.name)}</div><div><h3>${r.name}</h3><p>${r.role}</p><div class="paper-count">${r.papers.length} paper indicizzati · ${r.institution}</div></div></article>`).join('');
}

function deriveThemes(r){
  const bags=new Map();
  r.papers.forEach((p,idx)=>{
    p.keywords.forEach(k=>{
      const key=k.toLowerCase(); const item=bags.get(key)||{name:k,score:0,papers:[]};
      item.score+=3+(p.year>=2025?1:0); item.papers.push(idx); bags.set(key,item);
    });
  });
  r.keywords.forEach(k=>{const key=k.toLowerCase();const item=bags.get(key)||{name:k,score:0,papers:[]};item.score+=2;bags.set(key,item)});
  return [...bags.values()].sort((x,y)=>y.score-x.score).slice(0,10).map((x,i)=>({id:`${r.id}-${slug(x.name)}`,name:x.name,weight:Math.max(55,96-i*4),paperCount:new Set(x.papers).size}));
}

function generateThemes(){
  const [a,b]=selected(); if(!a||!b||a.id===b.id)return;
  activeThemes={a:deriveThemes(a),b:deriveThemes(b)};
  $('#themeColumns').innerHTML=[[a,activeThemes.a,'a'],[b,activeThemes.b,'b']].map(([r,themes,side])=>`
    <div class="theme-group"><div class="theme-owner"><span class="dot" style="background:${r.accent}"></span><div><h3>${r.name}</h3><small>Tematiche ricavate dai 5 paper</small></div></div>
    <div class="theme-list">${themes.map(t=>`<label class="theme-chip"><input type="checkbox" data-side="${side}" value="${escapeHtml(t.name)}"><span><b>${escapeHtml(t.name)}</b><small>peso ${t.weight} · ${t.paperCount||1} paper</small></span></label>`).join('')}</div></div>`).join('');
  $('#themeColumns').querySelectorAll('input').forEach(x=>x.addEventListener('change',updateThemeSelection));
  $('#themesPanel').classList.remove('hidden'); $('#dashboard').classList.add('hidden');
  setStep(2); updateThemeSelection(); $('#themesPanel').scrollIntoView({behavior:'smooth',block:'start'});
}

function chosenThemes(){
  return {a:[...document.querySelectorAll('input[data-side="a"]:checked')].map(x=>x.value),b:[...document.querySelectorAll('input[data-side="b"]:checked')].map(x=>x.value)};
}

function updateThemeSelection(e){
  if(e?.target?.checked){
    const side=e.target.dataset.side; const checked=[...document.querySelectorAll(`input[data-side="${side}"]:checked`)];
    if(checked.length>3){e.target.checked=false;}
  }
  const c=chosenThemes();
  $('#selectionCount').textContent=`Selezionate: ${c.a.length} per A · ${c.b.length} per B`;
  $('#analyzeBtn').disabled=!(c.a.length&&c.b.length);
}

function tokens(s){return s.toLowerCase().replace(/[^a-zà-ÿ0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>2&&!STOP.has(x))}
function overlapScore(a,b){
  const A=new Set(tokens(a)),B=new Set(tokens(b)); let common=0; A.forEach(x=>{if(B.has(x))common++});
  const semanticPairs=[['network','reti'],['causal','identification'],['persistence','memory'],['warning','tipping'],['spatial','graph'],['roughness','regularity'],['exposure','climate'],['multiscale','fractional'],['anomaly','change']];
  let bridge=0; semanticPairs.forEach(([x,y])=>{if((A.has(x)&&B.has(y))||(A.has(y)&&B.has(x)))bridge++});
  return Math.min(100,48+common*18+bridge*12+(a.length+b.length)%11);
}
function maturityFor(score,i){return score>=88?'active':score>=76?'emerging':i%3===0?'nascent':'active'}

function papersForTheme(r,theme){
  const tt=new Set(tokens(theme));
  return r.papers.map(p=>({p,score:[...p.keywords,p.title].flatMap(tokens).reduce((s,x)=>s+(tt.has(x)?2:0),0)})).sort((x,y)=>y.score-x.score).slice(0,2).map(x=>x.p);
}

function localAnalysis(a,b,chosen){
  const combinations=[];
  chosen.a.forEach(ta=>chosen.b.forEach(tb=>{
    const score=overlapScore(ta,tb); const pa=papersForTheme(a,ta)[0]||a.papers[0],pb=papersForTheme(b,tb)[0]||b.papers[0];
    const bridgeTerms=[...new Set([...tokens(ta),...tokens(tb)])].slice(0,5);
    combinations.push({name:`${ta} × ${tb}`,themeA:ta,themeB:tb,score,maturity:maturityFor(score,combinations.length),trend:score>87?'↑ forte':score>74?'↑ moderato':'→ da verificare',novelty:Math.min(96,score+5),feasibility:Math.max(48,score-9),evidence:Math.max(45,Math.round((score+pa.year+pb.year-4000)/2)),keywords:bridgeTerms,question:`Quale meccanismo osservabile collega “${ta}” e “${tb}”?`,paperA:pa.title,paperB:pb.title});
  }));
  combinations.sort((x,y)=>y.score-x.score);
  const areas=combinations.slice(0,7);
  const kw=new Map(); areas.forEach((x,i)=>x.keywords.forEach(k=>kw.set(k,(kw.get(k)||0)+areas.length-i+2)));
  const keywords=[...kw].sort((x,y)=>y[1]-x[1]).slice(0,24).map(([term,weight])=>({term,weight}));
  const maturity={nascent:0,emerging:0,active:0,established:0};areas.forEach(x=>maturity[x.maturity]++);
  const bridges=areas.slice(0,5).map(x=>({paperA:x.paperA,paperB:x.paperB,connection:x.name,score:x.score}));
  const mean=k=>Math.round(areas.reduce((s,x)=>s+x[k],0)/(areas.length||1));
  return {keywords,areas,bridges,maturity,metrics:{compatibility:mean('score'),themePairs:combinations.length,evidence:mean('evidence'),papers:a.papers.length+b.papers.length},source:'local'};
}

async function runAnalysis(){
  const [a,b]=selected(),themes=chosenThemes(); if(!themes.a.length||!themes.b.length)return;
  $('#statusText').textContent='Calcolo degli indicatori…'; $('#analyzeBtn').disabled=true;
  let result;
  try{
    if($('#aiToggle').checked){
      const res=await fetch('./api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({researcherA:a.id,researcherB:b.id,themesA:themes.a,themesB:themes.b})});
      if(!res.ok)throw new Error((await res.json().catch(()=>({}))).error||'Endpoint AI non disponibile');
      result=await res.json(); $('#modeBadge').textContent='AI · dati strutturati';
    }else{result=localAnalysis(a,b,themes);$('#modeBadge').textContent='Pages · analisi locale'}
    renderDashboard(result); setStep(3); $('#statusText').textContent='Indicatori aggiornati';
  }catch(e){result=localAnalysis(a,b,themes);renderDashboard(result);setStep(3);$('#statusText').textContent=`Fallback locale: ${e.message}`;$('#modeBadge').textContent='Pages · fallback locale'}
  finally{$('#analyzeBtn').disabled=false}
}

function renderDashboard(d){
  $('#dashboard').classList.remove('hidden');
  $('#metricStrip').innerHTML=[['Compatibilità esplorativa',d.metrics.compatibility+'/100'],['Coppie tematiche',d.metrics.themePairs],['Forza delle evidenze',d.metrics.evidence+'/100'],['Paper considerati',d.metrics.papers]].map(([l,v])=>`<div class="metric"><span>${l}</span><strong>${v}</strong></div>`).join('');
  renderWordCloud(d.keywords); renderBars(d.areas); renderRadar(d.areas); renderMaturity(d.maturity); renderTable(d.areas); renderBridges(d.bridges);
  $('#dashboard').scrollIntoView({behavior:'smooth',block:'start'});
}

function renderWordCloud(words){
  const max=Math.max(...words.map(x=>x.weight),1),min=Math.min(...words.map(x=>x.weight),0);
  $('#wordCloud').innerHTML=words.map((w,i)=>`<span style="font-size:${16+30*(w.weight-min)/(max-min||1)}px;transform:rotate(${i%5===0?-4:i%7===0?4:0}deg)">${escapeHtml(w.term)}</span>`).join('');
}
function renderBars(areas){
  $('#areasChart').innerHTML=areas.map((a,i)=>`<div class="bar-row"><div class="bar-rank">${i+1}</div><div class="bar-label"><b>${escapeHtml(a.name)}</b><small>${MATURITY_LABELS[a.maturity]} · ${escapeHtml(a.trend)}</small></div><div class="bar-track"><i style="width:${a.score}%"></i></div><strong>${a.score}</strong></div>`).join('');
}
function renderRadar(areas){
  const vals=['score','novelty','feasibility','evidence'].map(k=>areas.reduce((s,x)=>s+(x[k]||0),0)/(areas.length||1));
  const labels=['Compatibilità','Novità','Fattibilità','Evidenze'],cx=260,cy=175,R=125,n=4,pts=(r)=>labels.map((_,i)=>{const a=-Math.PI/2+i*2*Math.PI/n;return `${cx+Math.cos(a)*r},${cy+Math.sin(a)*r}`}).join(' ');
  let html='';[.25,.5,.75,1].forEach(k=>html+=`<polygon class="radar-grid" points="${pts(R*k)}"/>`);
  labels.forEach((l,i)=>{const a=-Math.PI/2+i*2*Math.PI/n,x=cx+Math.cos(a)*(R+35),y=cy+Math.sin(a)*(R+25);html+=`<line class="radar-grid" x1="${cx}" y1="${cy}" x2="${cx+Math.cos(a)*R}" y2="${cy+Math.sin(a)*R}"/><text x="${x}" y="${y}" text-anchor="middle">${l}</text>`});
  const data=vals.map((v,i)=>{const a=-Math.PI/2+i*2*Math.PI/n,r=R*v/100;return `${cx+Math.cos(a)*r},${cy+Math.sin(a)*r}`}).join(' ');
  $('#radarChart').innerHTML=html+`<polygon class="radar-data" points="${data}"/>`;
}
function renderMaturity(m){
  const total=Object.values(m).reduce((s,x)=>s+x,0)||1,parts=Object.entries(m).filter(([,v])=>v); let start=0;
  const conic=parts.map(([k,v])=>{const a=start,b=start+v/total*360;start=b;return `var(--${k}) ${a}deg ${b}deg`}).join(',');
  $('#maturityChart').innerHTML=`<div class="donut" style="background:conic-gradient(${conic})"><span>${total}<small>intersezioni</small></span></div><div class="maturity-legend">${parts.map(([k,v])=>`<div><i class="${k}"></i><span>${MATURITY_LABELS[k]}</span><b>${Math.round(v/total*100)}%</b></div>`).join('')}</div>`;
}
function renderTable(areas){
  $('#areasTable').innerHTML=`<table><thead><tr><th>Intersezione</th><th>Compat.</th><th>Novità</th><th>Fattibilità</th><th>Evidenze</th><th>Domanda aperta</th></tr></thead><tbody>${areas.map(a=>`<tr><td><b>${escapeHtml(a.name)}</b><small>${MATURITY_LABELS[a.maturity]} · ${escapeHtml(a.trend)}</small></td><td>${a.score}</td><td>${a.novelty}</td><td>${a.feasibility}</td><td>${a.evidence}</td><td>${escapeHtml(a.question)}</td></tr>`).join('')}</tbody></table>`;
}
function renderBridges(items){
  $('#paperBridges').innerHTML=items.map(x=>`<div class="bridge"><div><span>A</span>${escapeHtml(x.paperA)}</div><i>↔</i><div><span>B</span>${escapeHtml(x.paperB)}</div><strong>${x.score}</strong><small>${escapeHtml(x.connection)}</small></div>`).join('');
}

init().catch(e=>{$('#statusText').textContent='Errore: '+e.message});
