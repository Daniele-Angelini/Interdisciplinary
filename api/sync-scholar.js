const json=(res,status,data)=>{res.status(status).setHeader("Content-Type","application/json; charset=utf-8");res.end(JSON.stringify(data))};

export default async function handler(req,res){
  const origin=req.headers.origin||"";
  const allowed=(process.env.ALLOWED_ORIGIN||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(allowed.length&&allowed.includes(origin))res.setHeader("Access-Control-Allow-Origin",origin);
  res.setHeader("Vary","Origin");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, X-Admin-Key");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST")return json(res,405,{error:"Metodo non consentito"});
  if(allowed.length&&!allowed.includes(origin))return json(res,403,{error:"Origin non autorizzata"});
  const supplied=req.headers["x-admin-key"]||"";
  if(!process.env.ADMIN_SYNC_KEY||supplied!==process.env.ADMIN_SYNC_KEY)return json(res,401,{error:"Chiave amministratore non valida"});
  const researcherId=String(req.body?.researcherId||"").trim();
  if(!/^[a-z0-9][a-z0-9-]{1,80}$/.test(researcherId))return json(res,400,{error:"researcherId non valido"});
  const owner=process.env.GITHUB_OWNER,repo=process.env.GITHUB_REPO,token=process.env.GITHUB_TOKEN;
  const ref=process.env.GITHUB_REF||"main";
  const workflow=process.env.GITHUB_WORKFLOW_FILE||"update-scholar.yml";
  if(!owner||!repo||!token)return json(res,500,{error:"Backend GitHub non configurato"});
  const url=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  try{
    const response=await fetch(url,{method:"POST",headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${token}`,"X-GitHub-Api-Version":"2022-11-28","User-Agent":"research-compatibility-sync"},body:JSON.stringify({ref,inputs:{researcher_id:researcherId,max_publications:"0"}})});
    const text=await response.text();
    if(!response.ok)return json(res,response.status,{error:"GitHub non ha avviato il workflow",detail:text||response.statusText});
    let payload={};try{payload=text?JSON.parse(text):{}}catch{}
    return json(res,200,{ok:true,researcherId,workflow,actionsUrl:payload.html_url||`https://github.com/${owner}/${repo}/actions/workflows/${workflow}`});
  }catch(error){return json(res,500,{error:"Errore nel collegamento a GitHub",detail:error.message})}
}
