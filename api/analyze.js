import fs from 'node:fs/promises';
import path from 'node:path';

const schema={type:'object',additionalProperties:false,properties:{
  keywords:{type:'array',minItems:8,maxItems:24,items:{type:'object',additionalProperties:false,properties:{term:{type:'string'},weight:{type:'integer',minimum:1,maximum:20}},required:['term','weight']}},
  areas:{type:'array',minItems:1,maxItems:7,items:{type:'object',additionalProperties:false,properties:{name:{type:'string'},themeA:{type:'string'},themeB:{type:'string'},score:{type:'integer',minimum:0,maximum:100},maturity:{type:'string',enum:['nascent','emerging','active','established']},trend:{type:'string',enum:['↑ forte','↑ moderato','→ stabile','→ da verificare','↓ in calo']},novelty:{type:'integer',minimum:0,maximum:100},feasibility:{type:'integer',minimum:0,maximum:100},evidence:{type:'integer',minimum:0,maximum:100},question:{type:'string'},keywords:{type:'array',minItems:2,maxItems:6,items:{type:'string'}},paperA:{type:'string'},paperB:{type:'string'}},required:['name','themeA','themeB','score','maturity','trend','novelty','feasibility','evidence','question','keywords','paperA','paperB']}},
  bridges:{type:'array',minItems:1,maxItems:6,items:{type:'object',additionalProperties:false,properties:{paperA:{type:'string'},paperB:{type:'string'},connection:{type:'string'},score:{type:'integer',minimum:0,maximum:100}},required:['paperA','paperB','connection','score']}},
  maturity:{type:'object',additionalProperties:false,properties:{nascent:{type:'integer'},emerging:{type:'integer'},active:{type:'integer'},established:{type:'integer'}},required:['nascent','emerging','active','established']},
  metrics:{type:'object',additionalProperties:false,properties:{compatibility:{type:'integer',minimum:0,maximum:100},themePairs:{type:'integer'},evidence:{type:'integer',minimum:0,maximum:100},papers:{type:'integer'}},required:['compatibility','themePairs','evidence','papers']}
},required:['keywords','areas','bridges','maturity','metrics']};

async function loadResearchers(){
  const candidates=[path.join(process.cwd(),'data','researchers.json'),path.join(process.cwd(),'public','data','researchers.json')];
  for(const p of candidates){try{return JSON.parse(await fs.readFile(p,'utf8'))}catch{}}
  throw new Error('researchers.json non trovato');
}
async function filePart(researcher,paper){
  const p=path.join(process.cwd(),'papers',researcher.id,paper.file);
  try{const buf=await fs.readFile(p);return {type:'input_file',filename:paper.file,file_data:`data:application/pdf;base64,${buf.toString('base64')}`}}catch{return null}
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodo non consentito'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'OPENAI_API_KEY non configurata'});
  try{
    const all=await loadResearchers();
    const a=all.find(x=>x.id===req.body?.researcherA),b=all.find(x=>x.id===req.body?.researcherB);
    const themesA=Array.isArray(req.body?.themesA)?req.body.themesA.slice(0,3):[];
    const themesB=Array.isArray(req.body?.themesB)?req.body.themesB.slice(0,3):[];
    if(!a||!b||a.id===b.id||!themesA.length||!themesB.length)return res.status(400).json({error:'Ricercatori o tematiche non validi'});
    const pdfs=(await Promise.all([...a.papers.slice(0,2).map(p=>filePart(a,p)),...b.papers.slice(0,2).map(p=>filePart(b,p))])).filter(Boolean);
    const metadata=JSON.stringify({researcherA:a,researcherB:b,selectedThemesA:themesA,selectedThemesB:themesB});
    const input=[
      {role:'system',content:[{type:'input_text',text:'Sei un motore esplorativo di compatibilità scientifica. Non proporre progetti completi, filoni già confezionati, protocolli o conclusioni. Restituisci solo dati conformi allo schema: connessioni possibili, segnali quantitativi, maturità, tracciabilità ai paper e una domanda aperta per ogni intersezione. I punteggi sono indicatori esplorativi, non giudizi. Non inventare citazioni o sviluppi scientifici non sostenuti dai materiali.'}]},
      {role:'user',content:[{type:'input_text',text:`Calcola indicatori esclusivamente sulle tematiche selezionate. Ogni area deve essere una coppia tematica A × B, non una proposta progettuale. Produci vocaboli-ponte, compatibilità, novità, fattibilità, forza delle evidenze, maturità, trend, domanda aperta e paper di supporto. Dati: ${metadata}`},...pdfs]}
    ];
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5-mini',input,text:{format:{type:'json_schema',name:'research_compatibility',strict:true,schema}}})});
    const raw=await response.json(); if(!response.ok)throw new Error(raw?.error?.message||'Errore API');
    const text=raw.output_text||raw.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
    if(!text)throw new Error('Risposta priva di output strutturato');
    const data=JSON.parse(text); data.source='ai'; return res.status(200).json(data);
  }catch(e){return res.status(500).json({error:e.message})}
}
