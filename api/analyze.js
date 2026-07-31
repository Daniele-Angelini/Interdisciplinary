const MAX_PAPERS_PER_AUTHOR = 30;

function cors(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

function cleanPaper(p) {
  return {
    title: String(p?.title || "").slice(0, 500),
    authors: String(p?.authors || "").slice(0, 500),
    year: String(p?.year || "").slice(0, 20),
    publication: String(p?.publication || "").slice(0, 300),
    doi: String(p?.doi || "").slice(0, 200),
    url: String(p?.url || "").slice(0, 1000)
  };
}

function cleanResearcher(r) {
  return {
    id: String(r?.id || "").slice(0, 150),
    name: String(r?.name || "").slice(0, 250),
    affiliation: String(r?.affiliation || "").slice(0, 300),
    papers: Array.isArray(r?.papers)
      ? r.papers.slice(0, MAX_PAPERS_PER_AUTHOR).map(cleanPaper).filter(p => p.title)
      : []
  };
}

const themeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["researchers", "limitations"],
  properties: {
    researchers: {
      type: "array", minItems: 2, maxItems: 2,
      items: {
        type: "object", additionalProperties: false,
        required: ["researcher_id", "researcher_name", "themes", "profile_confidence"],
        properties: {
          researcher_id: {type:"string"},
          researcher_name: {type:"string"},
          profile_confidence: {type:"integer", minimum:0, maximum:100},
          themes: {
            type:"array", minItems:4, maxItems:10,
            items: {
              type:"object", additionalProperties:false,
              required:["name","description","weight","evidence_papers","methods","objects","source_urls","confidence"],
              properties:{
                name:{type:"string"},
                description:{type:"string"},
                weight:{type:"integer",minimum:1,maximum:100},
                evidence_papers:{type:"array",items:{type:"string"},maxItems:6},
                methods:{type:"array",items:{type:"string"},maxItems:6},
                objects:{type:"array",items:{type:"string"},maxItems:6},
                source_urls:{type:"array",items:{type:"string"},maxItems:8},
                confidence:{type:"integer",minimum:0,maximum:100}
              }
            }
          }
        }
      }
    },
    limitations:{type:"array",items:{type:"string"}}
  }
};

const compatibilitySchema = {
  type:"object", additionalProperties:false,
  required:["summary","cross_cutting_concepts","intersections","limitations"],
  properties:{
    summary:{
      type:"object",additionalProperties:false,
      required:["overall_compatibility","evidence_strength","novelty","feasibility","scientific_momentum","confidence"],
      properties:{
        overall_compatibility:{type:"integer",minimum:0,maximum:100},
        evidence_strength:{type:"integer",minimum:0,maximum:100},
        novelty:{type:"integer",minimum:0,maximum:100},
        feasibility:{type:"integer",minimum:0,maximum:100},
        scientific_momentum:{type:"integer",minimum:0,maximum:100},
        confidence:{type:"integer",minimum:0,maximum:100}
      }
    },
    cross_cutting_concepts:{
      type:"array",maxItems:30,
      items:{type:"object",additionalProperties:false,required:["concept","weight","reason"],properties:{concept:{type:"string"},weight:{type:"integer",minimum:1,maximum:100},reason:{type:"string"}}}
    },
    intersections:{
      type:"array",maxItems:9,
      items:{
        type:"object",additionalProperties:false,
        required:["theme_a","theme_b","compatibility","novelty","evidence_strength","feasibility","scientific_momentum","confidence","bridge","shared_methods","complementary_methods","supporting_papers_a","supporting_papers_b","external_evidence","risks","open_questions"],
        properties:{
          theme_a:{type:"string"},theme_b:{type:"string"},
          compatibility:{type:"integer",minimum:0,maximum:100},
          novelty:{type:"integer",minimum:0,maximum:100},
          evidence_strength:{type:"integer",minimum:0,maximum:100},
          feasibility:{type:"integer",minimum:0,maximum:100},
          scientific_momentum:{type:"integer",minimum:0,maximum:100},
          confidence:{type:"integer",minimum:0,maximum:100},
          bridge:{type:"string"},
          shared_methods:{type:"array",items:{type:"string"},maxItems:8},
          complementary_methods:{type:"array",items:{type:"string"},maxItems:8},
          supporting_papers_a:{type:"array",items:{type:"string"},maxItems:6},
          supporting_papers_b:{type:"array",items:{type:"string"},maxItems:6},
          external_evidence:{type:"array",items:{type:"object",additionalProperties:false,required:["title","url","relevance"],properties:{title:{type:"string"},url:{type:"string"},relevance:{type:"string"}}},maxItems:8},
          risks:{type:"array",items:{type:"string"},maxItems:6},
          open_questions:{type:"array",items:{type:"string"},maxItems:5}
        }
      }
    },
    limitations:{type:"array",items:{type:"string"}}
  }
};

function outputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  for (const item of data.output || []) for (const c of item.content || []) if (c.type === "output_text" && c.text) return c.text;
  return "";
}

async function callOpenAI({schema, name, prompt}) {
  const body = {
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    tools: [{type:"web_search"}],
    input: [
      {role:"system", content:"Sei un analista scientifico rigoroso. Usa ricerca web e fonti accademiche primarie quando disponibili. Non inventare contenuti. Distingui chiaramente evidenza diretta, inferenza e dato mancante. I punteggi devono dipendere dalle evidenze recuperate, non da formule fisse."},
      {role:"user", content:prompt}
    ],
    text: {format:{type:"json_schema", name, strict:true, schema}}
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method:"POST",
    headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  if (!response.ok) throw new Error((await response.text()).slice(0,1800));
  const text = outputText(await response.json());
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({error:"Metodo non consentito"});
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({error:"OPENAI_API_KEY non configurata"});

  try {
    const mode = String(req.body?.mode || "");
    const researchers = Array.isArray(req.body?.researchers) ? req.body.researchers.slice(0,2).map(cleanResearcher) : [];
    if (researchers.length !== 2 || researchers.some(r=>!r.name || !r.papers.length)) return res.status(400).json({error:"Servono due ricercatori con pubblicazioni"});

    if (mode === "themes") {
      const prompt = `Costruisci un profilo tematico autentico per ciascuno dei due ricercatori. Usa titolo, autori, anno e sede per identificare i paper; cerca sul web abstract, DOI, pagine editore, preprint o full text accessibili. Le tematiche devono essere concetti scientifici sintetici e interpretabili, non copie meccaniche di keyword dei titoli. Raggruppa lavori affini, individua metodi ricorrenti, oggetti di studio e traiettorie della ricerca. Ogni tema deve essere sostenuto da paper specifici e URL. Non inventare contenuti non reperiti.\n\nRicercatori e pubblicazioni:\n${JSON.stringify(researchers)}`;
      return res.status(200).json(await callOpenAI({schema:themeSchema,name:"ai_researcher_themes",prompt}));
    }

    if (mode === "compatibility") {
      const themesA = Array.isArray(req.body?.themesA) ? req.body.themesA.slice(0,3).map(String) : [];
      const themesB = Array.isArray(req.body?.themesB) ? req.body.themesB.slice(0,3).map(String) : [];
      const themeProfiles = req.body?.themeProfiles || {};
      if (!themesA.length || !themesB.length) return res.status(400).json({error:"Seleziona almeno un tema per autore"});
      const prompt = `Valuta la compatibilità interdisciplinare fra le tematiche selezionate dei due ricercatori. Cerca e verifica i paper indicati e anche letteratura esterna recente che colleghi le aree. Produci punteggi realmente differenziati e motivati dalle evidenze: compatibilità concettuale e metodologica, forza delle evidenze, novità, fattibilità, momentum scientifico e confidenza. Un punteggio basso è corretto quando mancano ponti reali. Non proporre un progetto già pronto: mostra ponti, metodi condivisi o complementari, rischi e domande aperte. Gli URL devono essere fonti effettivamente consultate.\n\nTemi A: ${JSON.stringify(themesA)}\nTemi B: ${JSON.stringify(themesB)}\nProfili tematici già generati: ${JSON.stringify(themeProfiles)}\nRicercatori e pubblicazioni: ${JSON.stringify(researchers)}`;
      return res.status(200).json(await callOpenAI({schema:compatibilitySchema,name:"ai_research_compatibility",prompt}));
    }

    return res.status(400).json({error:"mode deve essere themes o compatibility"});
  } catch (error) {
    return res.status(502).json({error:"Errore nell'analisi AI",detail:String(error?.message || error).slice(0,1800)});
  }
}
