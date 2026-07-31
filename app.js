const state={A:null,B:null,worksA:[],worksB:[],themesA:[],themesB:[],themeProfiles:null,analysis:null};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stop=new Set('the and of in for to a an on with using based from study analysis approach model models method methods applications application new via under between toward towards effects effect data results evidence research paper review journal volume issue'.split(' '));
const catalog=Array.isArray(window.RESEARCHER_CATALOG)?window.RESEARCHER_CATALOG:[];
function setStatus(t){$('status').textContent=t}
function populate(){const o=catalog.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} — ${esc(r.affiliation||'')}</option>`).join('');$('selectA').insertAdjacentHTML('beforeend',o);$('selectB').insertAdjacentHTML('beforeend',o);$('syncResearcher').insertAdjacentHTML('beforeend',o)}
function selectResearcher(side,id){const r=catalog.find(x=>x.id===id)||null;state[side]=r;const box=$(`selected${side}`);if(!r){box.className='selected-researcher empty';box.textContent='Nessun ricercatore selezionato'}else{box.className='selected-researcher';box.innerHTML=`<strong>${esc(r.name)}</strong><div class="meta">${esc(r.affiliation||'')}</div><div class="profile-description">${esc(r.description||'')}</div><div class="profile-links"><a target="_blank" rel="noopener" href="${esc(r.googleScholarUrl)}">Apri Google Scholar</a></div>`}const dup=state.A&&state.B&&state.A.id===state.B.id;$('loadThemes').disabled=!(state.A&&state.B)||dup;setStatus(dup?'Seleziona due ricercatori diversi':'Pronto');$('themeSection').classList.add('hidden');$('dashboard').classList.add('hidden')}
$('selectA').onchange=e=>selectResearcher('A',e.target.value);$('selectB').onchange=e=>selectResearcher('B',e.target.value);populate();

function parseCSV(text){const rows=[];let row=[],field='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&q&&n==='"'){field+='"';i++}else if(c==='"'){q=!q}else if(c===','&&!q){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(field);if(row.some(x=>x.trim()!==''))rows.push(row);row=[];field=''}else field+=c}row.push(field);if(row.some(x=>x.trim()!==''))rows.push(row);if(!rows.length)return[];const headers=rows.shift().map(h=>h.trim().toLowerCase());return rows.map(cols=>Object.fromEntries(headers.map((h,i)=>[h,(cols[i]||'').trim()]))) }
const first=(obj,names)=>{for(const n of names){if(obj[n]!==undefined&&obj[n]!=='')return obj[n]}return''};
function normalizeWorks(rows){return rows.map((r,i)=>({id:String(i+1),title:first(r,['title','titolo']),authors:first(r,['authors','author','autori']),publication:first(r,['publication','journal','venue','rivista']),year:first(r,['year','anno']),publisher:first(r,['publisher','editore']),url:first(r,['url','link']),doi:first(r,['doi']),abstract:first(r,['abstract','summary']),source:'Google Scholar CSV'})).filter(w=>w.title)}
async function loadCSV(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(`File non trovato: ${path}`);return normalizeWorks(parseCSV(await r.text()))}
const apiBase=(window.APP_CONFIG?.AI_API_BASE||'').replace(/\/$/,'');
function aiEndpoint(){return `${apiBase}/api/analyze`}
function researchersPayload(){return [
  {id:state.A.id,name:state.A.name,affiliation:state.A.affiliation,papers:state.worksA},
  {id:state.B.id,name:state.B.name,affiliation:state.B.affiliation,papers:state.worksB}
]}
function renderThemes(side,themes){
  $(`themeName${side}`).textContent=state[side].name;
  $(`themes${side}`).innerHTML=themes.map((t,i)=>`<label class="theme-chip" title="${esc(t.description)}"><input type="checkbox" value="${esc(t.name)}" ${i<2?'checked':''}><span><b>${esc(t.name)}</b><small>${esc(t.description)}</small><em>confidenza ${t.confidence}/100</em></span></label>`).join('');
  [...$(`themes${side}`).querySelectorAll('input')].forEach(x=>x.onchange=validate)
}
function selected(side){return [...$(`themes${side}`).querySelectorAll('input:checked')].map(x=>x.value)}
function validate(){for(const side of ['A','B']){const a=[...$(`themes${side}`).querySelectorAll('input:checked')];if(a.length>3)a.at(-1).checked=false}const a=selected('A').length,b=selected('B').length;$('analyze').disabled=!(a&&b);$('selectionStatus').textContent=`Selezionate: ${a} + ${b}`}
$('loadThemes').onclick=async()=>{
  setStatus('Importazione CSV e generazione AI delle tematiche…');$('loadThemes').disabled=true;
  try{
    [state.worksA,state.worksB]=await Promise.all([loadCSV(state.A.publicationsFile),loadCSV(state.B.publicationsFile)]);
    const r=await fetch(aiEndpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'themes',researchers:researchersPayload()})});
    const data=await r.json();if(!r.ok)throw new Error(data.detail||data.error||`HTTP ${r.status}`);
    state.themeProfiles=data;
    const pa=data.researchers.find(x=>x.researcher_id===state.A.id)||data.researchers[0];
    const pb=data.researchers.find(x=>x.researcher_id===state.B.id)||data.researchers[1];
    state.themesA=pa.themes;state.themesB=pb.themes;
    renderThemes('A',state.themesA);renderThemes('B',state.themesB);
    $('themeSection').classList.remove('hidden');validate();
    setStatus(`AI: ${state.themesA.length} + ${state.themesB.length} tematiche generate da ${state.worksA.length+state.worksB.length} pubblicazioni`)
  }catch(e){setStatus(`Errore AI: ${e.message}`)}finally{$('loadThemes').disabled=false}
};
$('analyze').onclick=async()=>{
  $('analyze').disabled=true;setStatus('L’AI verifica ponti disciplinari, letteratura esterna e indicatori…');
  try{
    const r=await fetch(aiEndpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'compatibility',researchers:researchersPayload(),themesA:selected('A'),themesB:selected('B'),themeProfiles:state.themeProfiles})});
    const data=await r.json();if(!r.ok)throw new Error(data.detail||data.error||`HTTP ${r.status}`);
    state.analysis=data;renderDashboard();setStatus('Analisi AI completata con fonti e confidenza')
  }catch(e){setStatus(`Errore AI: ${e.message}`)}finally{$('analyze').disabled=false}
};
function list(items){return items?.length?`<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<span class="meta">Nessun dato verificato</span>'}
function renderDashboard(){
  const d=state.analysis,s=d.summary;$('dashboard').classList.remove('hidden');
  $('metrics').innerHTML=[['Compatibilità',s.overall_compatibility],['Evidenze',s.evidence_strength],['Novità',s.novelty],['Fattibilità',s.feasibility],['Momentum',s.scientific_momentum],['Confidenza',s.confidence]].map(([l,v])=>`<div class="metric"><b>${v}/100</b><span>${l}</span></div>`).join('');
  const words=d.cross_cutting_concepts||[],max=Math.max(1,...words.map(x=>x.weight));
  $('wordCloud').innerHTML=words.map(x=>`<span title="${esc(x.reason)}" style="font-size:${14+30*x.weight/max}px;opacity:${.55+.45*x.weight/max}">${esc(x.concept)}</span>`).join('');
  $('compatibilityBars').innerHTML=d.intersections.map(x=>`<div class="bar-row"><div class="bar-label">${esc(x.theme_a)} × ${esc(x.theme_b)}</div><div class="bar-track"><div class="bar-fill" style="width:${x.compatibility}%"></div></div><div class="bar-value">${x.compatibility}</div></div>`).join('');
  renderRadar({Compatibilità:s.overall_compatibility,Novità:s.novelty,Evidenze:s.evidence_strength,Fattibilità:s.feasibility,Momentum:s.scientific_momentum});
  $('intersectionCards').innerHTML=d.intersections.map(x=>`<div class="intersection"><h3>${esc(x.theme_a)} × ${esc(x.theme_b)}</h3><div class="score-line"><span>Compatibilità verificata</span><b>${x.compatibility}/100</b></div><div class="tag-row"><span class="tag">novità ${x.novelty}</span><span class="tag">evidenze ${x.evidence_strength}</span><span class="tag">fattibilità ${x.feasibility}</span><span class="tag">momentum ${x.scientific_momentum}</span><span class="tag">confidenza ${x.confidence}</span></div><p>${esc(x.bridge)}</p><strong>Metodi condivisi</strong>${list(x.shared_methods)}<strong>Metodi complementari</strong>${list(x.complementary_methods)}<strong>Paper autore A</strong>${list(x.supporting_papers_a)}<strong>Paper autore B</strong>${list(x.supporting_papers_b)}<strong>Rischi</strong>${list(x.risks)}<strong>Domande aperte</strong>${list(x.open_questions)}${x.external_evidence?.length?`<strong>Evidenze esterne</strong><ul class="source-list">${x.external_evidence.map(e=>`<li><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>: ${esc(e.relevance)}</li>`).join('')}</ul>`:''}</div>`).join('');
  renderPapers();$('dashboard').scrollIntoView({behavior:'smooth'})
}
function renderRadar(vals){const svg=$('radarChart'),cx=260,cy=180,R=120,keys=Object.keys(vals),n=keys.length,point=(r,i)=>[cx+Math.cos(-Math.PI/2+2*Math.PI*i/n)*r,cy+Math.sin(-Math.PI/2+2*Math.PI*i/n)*r];let s='';for(let g=1;g<=4;g++)s+=`<polygon points="${keys.map((_,i)=>point(R*g/4,i).join(',')).join(' ')}" fill="none" stroke="#dfe5ea"/>`;keys.forEach((k,i)=>{const q=point(R+28,i),z=point(R,i);s+=`<line x1="${cx}" y1="${cy}" x2="${z[0]}" y2="${z[1]}" stroke="#e4e9ec"/><text x="${q[0]}" y="${q[1]}" text-anchor="middle" font-size="11" fill="#65717d">${esc(k)}</text>`});s+=`<polygon points="${keys.map((k,i)=>point(R*vals[k]/100,i).join(',')).join(' ')}" fill="rgba(31,111,139,.22)" stroke="#1f6f8b" stroke-width="3"/>`;svg.innerHTML=s}
function renderPapers(){const works=[...state.worksA.map(w=>({...w,owner:state.A.name})),...state.worksB.map(w=>({...w,owner:state.B.name}))].sort((a,b)=>String(b.year).localeCompare(String(a.year)));$('papersTable').innerHTML=`<table><thead><tr><th>Ricercatore</th><th>Anno</th><th>Titolo</th><th>Autori</th><th>Pubblicazione</th></tr></thead><tbody>${works.map(w=>`<tr><td>${esc(w.owner)}</td><td>${esc(w.year||'—')}</td><td>${w.url?`<a target="_blank" rel="noopener" href="${esc(w.url)}">${esc(w.title)}</a>`:esc(w.title)}</td><td>${esc(w.authors||'—')}</td><td>${esc(w.publication||'—')}</td></tr>`).join('')}</tbody></table>`}
$('downloadJson').onclick=()=>{const payload={generatedAt:new Date().toISOString(),researchers:[{...state.A,publications:state.worksA},{...state.B,publications:state.worksB}],themeProfiles:state.themeProfiles,selectedThemes:{A:selected('A'),B:selected('B')},analysis:state.analysis};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`research-compatibility-${state.A.id}-${state.B.id}.json`;a.click();URL.revokeObjectURL(a.href)};

const syncApiBase=(window.APP_CONFIG?.SYNC_API_BASE||window.APP_CONFIG?.AI_API_BASE||'').replace(/\/$/,'');
$('syncScholar').onclick=async()=>{
  const researcherId=$('syncResearcher').value;
  const adminKey=$('syncKey').value.trim();
  const status=$('syncStatus');
  if(!researcherId){status.className='ai-status error';status.textContent='Seleziona un ricercatore.';return}
  if(!adminKey){status.className='ai-status error';status.textContent='Inserisci la chiave amministratore.';return}
  $('syncScholar').disabled=true;status.className='ai-status loading';status.textContent='Avvio del workflow GitHub Actions…';
  try{
    const r=await fetch(`${syncApiBase}/api/sync-scholar`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Key':adminKey},body:JSON.stringify({researcherId})});
    const data=await r.json();if(!r.ok)throw new Error(data.detail||data.error||`HTTP ${r.status}`);
    status.className='ai-status success';
    status.innerHTML=`Sincronizzazione avviata per <strong>${esc(data.researcherId)}</strong>. Il CSV sarà disponibile dopo il completamento e il deploy.${data.actionsUrl?` <a target="_blank" rel="noopener" href="${esc(data.actionsUrl)}">Apri Actions</a>`:''}`;
  }catch(e){status.className='ai-status error';status.textContent=`Errore sincronizzazione: ${e.message}`}
  finally{$('syncScholar').disabled=false}
};
