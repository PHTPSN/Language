import { BASE_WORDS, BRIDGES, ITEMS, ITEM_MAP, PRIMARY, sceneFor } from "./catalog.ts";
import { matches, normalize, originalReading, permittedItems, readingTarget, validateLexical } from "./lexical.ts";
import { STAGES, type Action, type Evidence, type EvidenceKind, type ItemState, type Learner, type Scene } from "./types.ts";

export const RULES = { interveningTurns:3, stableDays:7, stableProductions:3, stableDomains:3, stableSessions:2 };
const uid=()=>crypto.randomUUID();
const blank=():ItemState=>({stage:"unseen", confidence:0, evidenceCount:0,lastSeen:null,contexts:[],evidence:[]});
export function createLearner(now=new Date().toISOString()): Learner {
  const scene=sceneFor(PRIMARY,false);
  return {version:1,name:"You",l1:"zh",targetLanguage:"en",onboarded:false,sample:false,session:uid(),sessionCount:1,turn:0,createdAt:now,updatedAt:now,items:Object.fromEntries(ITEMS.map(i=>[i.id,blank()])),scene,messages:[],knownBase:BASE_WORDS,recentInputs:[],notice:"A short diagnostic will give us a starting point.",decisions:[]};
}
export function derive(evidence: Evidence[], now: string): ItemState {
  const e=[...evidence].sort((a,b)=>a.at.localeCompare(b.at)||a.turn-b.turn);
  const sp=e.filter(x=>x.kind==="spontaneous");
  const lastFailure=e.filter(x=>x.kind==="failed").at(-1);
  const clean=sp.filter(x=>!lastFailure || x.at>lastFailure.at || (x.at===lastFailure.at && x.turn>lastFailure.turn));
  let stage:ItemState["stage"]="unseen";
  if(e.some(x=>["encountered","supplied","help_requested"].includes(x.kind))) stage="encountered";
  if(e.some(x=>x.kind==="recognized")) stage="understood";
  if(e.some(x=>x.kind==="assisted")) stage="assisted_production";
  if(sp.length) stage="spontaneous_production";
  const span=clean.length ? (Date.parse(clean.at(-1)!.at)-Date.parse(clean[0].at))/86400000 : 0;
  if(clean.length>=RULES.stableProductions && new Set(clean.map(x=>x.domain)).size>=RULES.stableDomains && new Set(clean.map(x=>x.session)).size>=RULES.stableSessions && span>=RULES.stableDays) stage="stable";
  const last=e.at(-1)?.at||null;
  const quality=stage==="stable"||stage==="spontaneous_production" ? sp.at(-1)?.at : stage==="assisted_production" ? e.filter(x=>x.kind==="assisted").at(-1)?.at : stage==="understood" ? e.filter(x=>x.kind==="recognized").at(-1)?.at : last;
  const age=quality ? Math.max(0,(Date.parse(now)-Date.parse(quality))/86400000) : 0;
  if(stage==="stable" && age>60) stage="spontaneous_production";
  const base={unseen:0,encountered:.22,understood:.48,assisted_production:.58,spontaneous_production:.81,stable:.94}[stage];
  const penalty=lastFailure && (!sp.length || lastFailure.at>=sp.at(-1)!.at) ? .12 : 0;
  return { stage, confidence:Math.round(Math.max(0,(base-penalty)*Math.pow(.5,age/90))*100)/100, evidenceCount:e.length,lastSeen:last,contexts:[...new Set(e.map(x=>x.domain))],evidence:e };
}
function record(s:Learner,id:string,kind:EvidenceKind,text:string,reason:string,now:string,source="conversation",strength=.2) {
  const e:Evidence={id:uid(),itemId:id,kind,at:now,turn:s.turn,context:s.scene.id,domain:s.scene.domain,session:s.session,source,text,reason,strength,assisted:["assisted","supplied","help_requested"].includes(kind)};
  s.items[id]=derive([...s.items[id].evidence,e],now);
  s.decisions.push({at:now,text:ITEM_MAP[id].lemma+": "+kind+" — "+reason});
}
function coach(s:Learner,text:string,now:string,note?:string) { s.messages.push({id:uid(),role:"coach",text,context:s.scene.id,at:now,...(note?{note}:{})}); }
function setScene(s:Learner,scene:Scene,now:string) { s.scene=scene; s.decisions.push({at:now,text:scene.title+": "+scene.reason}); coach(s,scene.prompt,now); }
function lastSupport(state:ItemState) { return state.evidence.filter(e=>["supplied","assisted","help_requested"].includes(e.kind)).at(-1); }
function supply(s:Learner,id:string,now:string,source:string) {
  record(s,id,"supplied",ITEM_MAP[id].hint,"The expression was visible. Subsequent reuse needs a delay and new context.",now,source);
}
function chooseNext(s:Learner,now:string) {
  const candidates=ITEMS.filter(i=>!i.id.startsWith("bank.")).map(i=>({item:i,state:s.items[i.id]}));
  const due=candidates.filter(({state})=>{
    if(!["assisted_production","spontaneous_production"].includes(state.stage)) return false;
    const anchor=state.evidence.filter(e=>["supplied","assisted","spontaneous","failed"].includes(e.kind)).at(-1);
    return anchor && s.turn-anchor.turn>=RULES.interveningTurns;
  }).sort((a,b)=>STAGES.indexOf(a.state.stage)-STAGES.indexOf(b.state.stage)||a.state.confidence-b.state.confidence);
  if(due.length) {
    const {item,state}=due[0]; const sp=state.evidence.filter(e=>e.kind==="spontaneous");
    const scene=sceneFor(item.id,true,sp.length);
    setScene(s,scene,now); return;
  }
  const cooling=candidates.find(({state})=>state.stage==="assisted_production" && lastSupport(state));
  if(cooling) {
    const gap=s.turn-lastSupport(cooling.state)!.turn;
    setScene(s,{...BRIDGES[Math.min(Math.max(0,gap),2)],id:BRIDGES[Math.min(Math.max(0,gap),2)].id+"-"+s.turn},now); return;
  }
  const next=candidates.filter(x=>STAGES.indexOf(x.state.stage)<4).sort((a,b)=>{
    const order={understood:0,encountered:1,unseen:2,assisted_production:3,spontaneous_production:4,stable:5};
    return order[a.state.stage]-order[b.state.stage];
  })[0];
  setScene(s,sceneFor(next?.item.id||PRIMARY,false),now);
}
function production(s:Learner,text:string,now:string) {
  const placeholders=ITEMS.flatMap(i=>i.placeholders.map(p=>({item:i,p}))).sort((a,b)=>b.p.length-a.p.length);
  const found=placeholders.find(x=>text.includes(x.p));
  if(found) {
    record(s,found.item.id,"help_requested",text,"L1 placeholder indicates a production gap; intended sense is a heuristic.",now,"l1-placeholder",.35);
    supply(s,found.item.id,now,"l1-placeholder");
    s.scene={...sceneFor(found.item.id,false),id:s.scene.id,domain:s.scene.domain};
    coach(s,"You could say: “"+found.item.hint+"”\n"+found.item.zh+" · "+found.item.sense+". Try your own sentence for this situation.",now,"Support supplied");
    s.notice="Support recorded. Immediate reuse will count as assisted."; return;
  }
  if(/\p{Script=Han}/u.test(text)) {
    coach(s,"I am not sure which expression you mean. In this demo I can help with 表达感谢, 改期, 期待, 抽出时间, 提出担忧, 考虑到, 按时完成, 弄明白, or 推迟. Add a little English context, or use “Give me a hint”.",now);
    s.notice="Unresolved L1 placeholder; no proficiency claim was made."; return;
  }
  const foundItems=matches(text); let targetProduced=false;
  for(const item of foundItems) {
    const prior=s.items[item.id], support=lastSupport(prior);
    const samePrior=prior.evidence.some(e=>["supplied","assisted","spontaneous"].includes(e.kind) && normalize(e.text).replace(/[^\p{L}\p{N} ]/gu,"")===normalize(text).replace(/[^\p{L}\p{N} ]/gu,""));
    const recent=support && s.turn-support.turn<=RULES.interveningTurns;
    const contextValid=s.scene.targetId===item.id || (item.id==="appreciate.v.thanks" && s.scene.targetId===PRIMARY);
    const independent=!recent && !samePrior && (!support || support.domain!==s.scene.domain) && contextValid;
    const sentence=(text.match(/[A-Za-z]+/g)||[]).length>=5;
    if(!sentence || !contextValid || /\b(meaning|translate|means|expression|phrase)\b/i.test(text) || /\b(don't know|didn't know|cannot|can't|not sure|how do i|how can i)\b/i.test(text)) {
      record(s,item.id,"uncertain",text,"A form was matched, but meaningful use in the current situation is not established.",now,"form-matcher",.1);
    } else if(independent) {
      record(s,item.id,"spontaneous",text,support ? "New sentence in a different context, with at least three intervening responses and no recent visible help." : "Contextual production before the expression was supplied; provisional independent evidence.",now,"form-and-context-heuristic",.85);
      s.notice="Independent use recorded. One successful response is not yet stable knowledge.";
      if(s.scene.targetId===item.id) targetProduced=true;
    } else {
      record(s,item.id,"assisted",text,samePrior ? "Exact prior wording was repeated; this is conservatively classified as assisted." : recent ? "Expression was supplied or practiced within the previous three turns." : "Production occurred in the same context as the support.",now,"assistance-window",.4);
      s.notice="Assisted use recorded. The next opportunity will come in a different context.";
      if(s.scene.targetId===item.id) targetProduced=true;
    }
  }
  if(s.scene.mode==="retrieval" && s.scene.targetId && !targetProduced) {
    record(s,s.scene.targetId,"failed",text,"The planned expression was not observed. Another wording may be valid; this is not proof of inability.",now,"opportunity-not-observed",.15);
    s.notice="The target expression was not observed; alternative wording may still communicate well.";
  }
  if(s.scene.mode==="practice" && s.scene.targetId && !targetProduced && !foundItems.length) {
    coach(s,"Your response is saved. You can say a little more, use Chinese for a missing expression, or ask for a hint.",now);
    s.notice="Response saved; no tracked expression was identified."; return;
  }
  chooseNext(s,now);
}
export function applyAction(previous:Learner,action:Action,now=new Date().toISOString(),readingDraft?:string):Learner {
  const s=structuredClone(previous); s.updatedAt=now;
  for(const item of ITEMS) s.items[item.id]=derive(s.items[item.id].evidence,now);
  if(action.type==="sample") return sampleLearner(now);
  if(action.type==="diagnostic") {
    if(s.onboarded) throw new Error("Diagnostic already completed.");
    s.name=action.name?.trim().slice(0,50)||"You"; s.onboarded=true;
    s.scene={id:"diagnostic",domain:"diagnostic",title:"First impression",prompt:"",mode:"practice",reason:"An initial meaning check provides weak recognition evidence."};
    record(s,"reschedule.v.01","encountered","Could we reschedule our meeting?","Expression shown in diagnostic.",now,"diagnostic");
    supply(s,"reschedule.v.01",now,"diagnostic");
    if(action.recognition==="change-time") record(s,"reschedule.v.01","recognized",action.recognition,"Correct meaning selected in one diagnostic question; not production evidence.",now,"diagnostic",.5);
    else record(s,"reschedule.v.01","failed",action.recognition,"Meaning not established by this diagnostic response.",now,"diagnostic",.1);
    s.scene=sceneFor(PRIMARY,false); coach(s,s.scene.prompt,now);
    if(action.production.trim()) {s.turn++; s.messages.push({id:uid(),role:"learner",text:action.production,context:s.scene.id,at:now}); production(s,action.production,now);}
    return s;
  }
  if(!s.onboarded) throw new Error("Complete the diagnostic or load the sample first.");
  if(action.type==="message") {
    const text=action.text.trim(); if(!text || text.length>2000) throw new Error("Write between 1 and 2,000 characters.");
    if(s.scene.mode==="bridge" && (text.match(/[A-Za-z]+/g)||[]).length<4) throw new Error("Give a short response of at least four English words before moving on.");
    if(s.recentInputs.slice(-3).includes(normalize(text))) throw new Error("Try a different response; repeated messages do not create new evidence.");
    s.turn++; s.recentInputs.push(normalize(text)); s.recentInputs=s.recentInputs.slice(-20);
    s.messages.push({id:uid(),role:"learner",text,context:s.scene.id,at:now});
    production(s,text,now);
  } else if(action.type==="hint") {
    const id=s.scene.targetId;
    if(!id) { coach(s,"There is no expression to recall here. A simple sentence about your plan is enough.",now); return s; }
    record(s,id,"help_requested","Hint requested","The learner requested help for this opportunity.",now,"hint-button",.2);
    supply(s,id,now,"hint-button"); coach(s,"You could say: “"+ITEM_MAP[id].hint+"”\n"+ITEM_MAP[id].zh,now,"Support supplied");
    s.notice="Hint saved as assistance. Immediate reuse will not count as independent.";
  } else if(action.type==="inspect") {
    for(const id of [...new Set(action.itemIds)].filter(id=>ITEM_MAP[id])) supply(s,id,now,"model-inspection");
    s.notice="Visible expressions count as support. A fresh recall opportunity will come later.";
  } else if(action.type==="session") {
    s.session=uid(); s.sessionCount++; s.notice="New session started. Evidence and assistance windows are preserved.";
  } else if(action.type==="reading") {
    const target=readingTarget(s), permitted=permittedItems(s);
    const original=readingDraft || originalReading(target);
    const first=validateLexical(original,s.knownBase,permitted,[target]);
    const repaired=originalReading(target);
    const final=first.passed ? first : validateLexical(repaired,s.knownBase,permitted,[target]);
    if(!final.passed) throw new Error("Reading could not be validated. No unvalidated passage was released.");
    s.reading={text:first.passed?original:repaired,targetIds:[target],attempts:[{text:original,report:first,operation:readingDraft?"Provider draft":"Original template draft"}],createdAt:now,source:readingDraft&&first.passed?"model-provider":"original-template"};
    if(!first.passed) s.reading.attempts.push({text:repaired,report:final,operation:"Replace failing passage with a validated original template"});
    for(const i of matches(s.reading.text)) { record(s,i.id,"encountered",s.reading.text,"Expression appeared in controlled input; reading alone does not establish understanding.",now,"controlled-reading"); supply(s,i.id,now,"controlled-reading"); }
    s.notice="Reading validated. Its visible expressions now count as support.";
  } else if(action.type==="comprehension") {
    if(!s.reading) throw new Error("Generate a reading first.");
    if(s.reading.comprehension!==undefined) throw new Error("This reading check was already submitted.");
    const correct=action.answer==="correct"; s.reading.comprehension=correct;
    for(const id of s.reading.targetIds) record(s,id,correct?"recognized":"failed",action.answer,correct?"Meaning selected in a reading check; weak recognition evidence, not production.":"Meaning was not established by the reading check.",now,"reading-check",correct?.45:.1);
  }
  return s;
}
export function sampleLearner(now=new Date().toISOString()):Learner {
  const s=createLearner(now); s.onboarded=true;s.sample=true;s.name="Lin";s.notice="Sample profile loaded. Historical evidence is synthetic and labeled.";
  const add=(id:string,kind:EvidenceKind,days:number,domain:string,session:string,text:string)=>{
    s.scene={...sceneFor(id,false),domain,id:"sample-"+domain};s.session=session;s.turn++;
    record(s,id,kind,text,"Synthetic sample evidence for exploring the demo.",new Date(Date.parse(now)-days*86400000).toISOString(),"synthetic-seed",kind==="spontaneous"?.85:.4);
  };
  add("reschedule.v.01","recognized",2,"diagnostic","seed-1","Change the time of a meeting.");
  add("appreciate.v.thanks","assisted",1,"work","seed-1","I appreciate your help.");
  add("look-forward-to.v.01","spontaneous",3,"travel","seed-1","I look forward to seeing you in London.");
  add("make-time-for.v.01","encountered",1,"work","seed-1","I make time for my friends.");
  for(const [days,domain,session] of [[10,"work","seed-1"],[5,"travel","seed-2"],[1,"home","seed-3"]] as const)
    add("figure-out.v.01","spontaneous",days,domain,session,"We can figure out the "+domain+" problem together.");
  s.session=uid();s.turn=0;s.scene=sceneFor(PRIMARY,false);s.messages=[];s.decisions=[];coach(s,s.scene.prompt,now);
  // Seed turn positions must not create future assistance windows.
  for(const i of ITEMS) {s.items[i.id].evidence.forEach(e=>e.turn=-100);s.items[i.id]=derive(s.items[i.id].evidence,now);}
  return s;
}
