const MAX_PAPERS = 10;

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
    doi: String(p?.doi || "").slice(0, 200),
    url: String(p?.url || "").slice(0, 1000)
  };
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["papers", "cross_cutting_keywords", "compatibility_signals", "limitations"],
  properties: {
    papers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "authors", "year", "match_status", "access_level", "source_urls", "keywords", "methods", "objects_of_study", "verified_findings", "uncertainties"],
        properties: {
          title: {type:"string"}, authors: {type:"string"}, year: {type:"string"},
          match_status: {type:"string", enum:["verified", "probable", "not_found"]},
          access_level: {type:"string", enum:["full_text", "abstract", "metadata_only", "not_found"]},
          source_urls: {type:"array", items:{type:"string"}},
          keywords: {type:"array", items:{type:"string"}},
          methods: {type:"array", items:{type:"string"}},
          objects_of_study: {type:"array", items:{type:"string"}},
          verified_findings: {type:"array", items:{type:"string"}},
          uncertainties: {type:"array", items:{type:"string"}}
        }
      }
    },
    cross_cutting_keywords: {type:"array", items:{type:"object", additionalProperties:false, required:["keyword","weight"], properties:{keyword:{type:"string"},weight:{type:"integer",minimum:1,maximum:100}}}},
    compatibility_signals: {type:"array", items:{type:"object", additionalProperties:false, required:["theme_a","theme_b","evidence_score","novelty_score","methodological_distance","supporting_papers","open_question"], properties:{theme_a:{type:"string"},theme_b:{type:"string"},evidence_score:{type:"integer",minimum:0,maximum:100},novelty_score:{type:"integer",minimum:0,maximum:100},methodological_distance:{type:"integer",minimum:0,maximum:100},supporting_papers:{type:"array",items:{type:"string"}},open_question:{type:"string"}}}},
    limitations: {type:"array", items:{type:"string"}}
  }
};

function outputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  for (const item of data.output || []) for (const c of item.content || []) if (c.type === "output_text" && c.text) return c.text;
  return "";
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({error:"Metodo non consentito"});
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({error:"OPENAI_API_KEY non configurata"});

  const papers = Array.isArray(req.body?.papers) ? req.body.papers.slice(0, MAX_PAPERS).map(cleanPaper).filter(p=>p.title && p.authors) : [];
  const themesA = Array.isArray(req.body?.themesA) ? req.body.themesA.slice(0,3).map(String) : [];
  const themesB = Array.isArray(req.body?.themesB) ? req.body.themesB.slice(0,3).map(String) : [];
  if (!papers.length) return res.status(400).json({error:"Nessuna pubblicazione valida"});

  const prompt = `Analizza le pubblicazioni elencate usando la ricerca web. Identifica ogni paper con autore, titolo e anno. Cerca DOI, pagina editore, abstract, preprint o full text legittimamente accessibile. Non fingere di aver letto un testo non accessibile. Distingui full_text, abstract, metadata_only e not_found. Restituisci soltanto dati verificabili e brevi. Non creare un progetto di ricerca pronto: produci segnali, distanze metodologiche, evidenze e domande aperte.\n\nTemi autore A: ${JSON.stringify(themesA)}\nTemi autore B: ${JSON.stringify(themesB)}\nPubblicazioni: ${JSON.stringify(papers)}`;

  const body = {
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    tools: [{type:"web_search"}],
    input: [{role:"system",content:"Sei un analista bibliografico rigoroso. Usa fonti primarie quando possibile. Non dedurre il contenuto di un paper dal solo titolo. Segnala sempre i limiti di accesso."},{role:"user",content:prompt}],
    text: {format:{type:"json_schema",name:"research_compatibility_analysis",strict:true,schema}}
  };

  let response = await fetch("https://api.openai.com/v1/responses", {method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  if (!response.ok) {
    const detail = await response.text();
    return res.status(response.status).json({error:"Errore OpenAI",detail:detail.slice(0,1500)});
  }
  const data = await response.json();
  const text = outputText(data);
  try { return res.status(200).json(JSON.parse(text)); }
  catch { return res.status(502).json({error:"Risposta AI non interpretabile",detail:text.slice(0,1200)}); }
}
