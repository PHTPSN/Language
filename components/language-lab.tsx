"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, BookOpen, Check, ChevronRight, CircleHelp, Database, FlaskConical, History, Leaf, MessageSquare, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ITEMS, ITEM_MAP } from "@/lib/catalog";
import { STAGES, type Action, type Learner, type Stage } from "@/lib/types";

const LABEL:Record<Stage,string>={unseen:"Not yet seen",encountered:"Encountered",understood:"Understood",assisted_production:"With support",spontaneous_production:"Independent",stable:"Stable"};
const EXPLAIN:Record<Stage,string>={unseen:"No evidence yet",encountered:"Seen in context",understood:"Meaning recognized",assisted_production:"Used after help",spontaneous_production:"Used without recent help",stable:"Repeated across days and contexts"};
type Payload={state:Learner;revision:number;provider:string};
export default function LanguageLab() {
  const [data,setData]=useState<Payload|null>(null),[error,setError]=useState(""),[signIn,setSignIn]=useState(false);
  const [busy,setBusy]=useState(false),[tab,setTab]=useState("practice"),[draft,setDraft]=useState("");
  const [name,setName]=useState(""),[recognition,setRecognition]=useState("unsure"),[initial,setInitial]=useState("");
  const [item,setItem]=useState<string|null>(null),[history,setHistory]=useState(false),[filter,setFilter]=useState(""),[validation,setValidation]=useState(false);
  const bottom=useRef<HTMLDivElement>(null),lock=useRef(false);
  async function load() {
    setError("");
    try {const r=await fetch("/api/learner");const p=await r.json() as Payload & {error?:string;signIn?:boolean};if(!r.ok){setSignIn(Boolean(p.signIn));throw Error(p.error||"Could not load profile.");}setData(p);}
    catch(e){setError(e instanceof Error?e.message:"Could not load profile.");}
  }
  useEffect(()=>{
    const timer=window.setTimeout(()=>{void load();},0);
    return ()=>window.clearTimeout(timer);
  },[]);
  useEffect(()=>{bottom.current?.scrollIntoView({block:"nearest",behavior:"smooth"});},[data?.state.messages.length]);
  async function act(action:Action):Promise<boolean> {
    if(!data||lock.current)return false;lock.current=true;setBusy(true);setError("");
    try {const r=await fetch("/api/learner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:data.revision,action})});
      const p=await r.json() as Payload & {error?:string};if(!r.ok)throw Error(p.error||"Could not save.");setData(p);return true;
    } catch(e){setError(e instanceof Error?e.message:"Could not save.");return false;} finally{setBusy(false);lock.current=false;}
  }
  async function switchTab(next:string) {
    if(next==="map" && !await act({type:"inspect",itemIds:ITEMS.map(i=>i.id)})) return;
    if(next==="reading" && data?.state.reading && !await act({type:"inspect",itemIds:data.state.reading.targetIds}))return;
    setTab(next);
  }
  const s=data?.state;
  const counts=Object.fromEntries(STAGES.map(stage=>[stage, s?Object.values(s.items).filter(i=>i.stage===stage).length:0]));
  const totalEvidence=s?Object.values(s.items).reduce((n,i)=>n+i.evidenceCount,0):0;
  return <div className="lab-shell">
    <header className="topbar"><Link className="brand" href="/" aria-label="Language Lab home"><span className="brand-mark"><Leaf size={21}/></span>language<span className="brand-light">lab</span><Badge variant="outline" className="demo-label">RESEARCH DEMO</Badge></Link>
      <div className="profile"><span className="language-pair">中文 <ArrowRight size={13}/> English</span><span className="avatar">{s?.name?.[0]?.toUpperCase()||"L"}</span></div></header>
    {error && <div role="alert" className="error-banner"><span>{error}</span>{signIn?<a href="/signin-with-chatgpt?return_to=/" target="_top">Sign in</a>:<Button variant="outline" size="sm" onClick={load}>Reload profile</Button>}</div>}
    {!s ? <main className="loading"><FlaskConical size={28}/><h1>Opening your learning space</h1><p>Your saved evidence will be here in a moment.</p></main>:
    !s.onboarded ? <main className="onboarding">
      <div className="onboard-intro"><span className="eyebrow">A STARTING POINT, NOT A SCORE</span><h1>What you know.<br/>What you can say.</h1><p>A quick check helps us choose your first conversation. Your model will change as you use English.</p><p className="zh">简单了解你现在的状态，再通过真实表达逐步调整。</p>
        <div className="intro-stages"><span>Understand</span><ChevronRight/><span>Use with help</span><ChevronRight/><span>Use independently</span></div>
        <div className="sample-card"><FlaskConical/><div><strong>Just exploring?</strong><p>Open Lin’s sample profile, with clearly labeled example evidence.</p><Button variant="outline" onClick={()=>act({type:"sample"})} disabled={busy}>Explore sample profile <ArrowRight/></Button></div></div>
      </div>
      <form className="diagnostic-card" onSubmit={async e=>{e.preventDefault();await act({type:"diagnostic",recognition,production:initial,name});}}>
        <div className="section-number">01 <span>A quick introduction</span></div><label htmlFor="name">What should we call you? <span className="optional">Optional</span></label><Input id="name" placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} maxLength={50}/>
        <label htmlFor="recognition">“Could we reschedule our meeting?”</label><p className="field-note">What is this person asking to do?</p><select id="recognition" value={recognition} onChange={e=>setRecognition(e.target.value)}><option value="unsure">I’m not sure yet</option><option value="change-time">Change the meeting to a different time</option><option value="cancel">Cancel the meeting completely</option><option value="confirm">Confirm the original time</option></select>
        <label htmlFor="initial">A teammate stayed late to help you finish a project. What would you say?</label><p className="field-note">Write in English. Use Chinese wherever a word is missing.</p><Textarea id="initial" value={initial} onChange={e=>setInitial(e.target.value)} placeholder="I wanted to 表达感谢, but I didn't know how." maxLength={2000}/>
        <Button size="lg" type="submit" className="wide" disabled={busy}>{busy?"Saving your starting point…":"Start my conversation"}<ArrowRight/></Button>
        <p className="fineprint">No level test. No perfect answers. Just a first observation.</p>
      </form>
    </main>:
    <main className="workspace"><div className="workspace-heading"><div><span className="eyebrow">YOUR LEARNING SPACE</span><h1>A little more your own.</h1><p>Practice in context. Let independent use tell the story.</p></div><div className="save-state"><Database size={15}/><span>{busy?"Saving…":"Saved to your learner profile"}<small>Session {s.sessionCount} · {s.sample?"Sample history + your practice":"Your practice"}</small></span></div></div>
      <Tabs value={tab} onValueChange={switchTab} className="main-tabs"><div className="tab-row"><TabsList variant="line"><TabsTrigger value="practice" disabled={busy}><MessageSquare/>Conversation</TabsTrigger><TabsTrigger value="map" disabled={busy}><Leaf/>Learning map</TabsTrigger><TabsTrigger value="reading" disabled={busy}><BookOpen/>Reading room</TabsTrigger></TabsList><span className="engine-label">{data.provider==="configured"?"AI reading configured":"Rule-based conversation · original readings"}</span></div>
      <TabsContent value="practice"><div className="practice-grid"><section className="conversation panel">
        <div className="conversation-top"><div><span className="eyebrow">{s.scene.mode==="retrieval"?"A FRESH SITUATION":s.scene.mode==="bridge"?"LET’S KEEP TALKING":"IN CONTEXT"}</span><h2>{s.scene.title}</h2></div><Button variant="ghost" size="icon" aria-label="View previous turns; counts as assistance" disabled={busy} onClick={async()=>{if(await act({type:"inspect",itemIds:ITEMS.map(i=>i.id)}))setHistory(true);}}><History/></Button></div>
        <div className="messages" aria-live="polite">{s.messages.filter(m=>m.context===s.scene.id).map(m=><div className={"message "+m.role} key={m.id}>{m.role==="coach"&&<span className="coach-icon"><Leaf size={16}/></span>}<div>{m.note&&<span className="message-note">{m.note}</span>}<p>{m.text}</p></div>{m.role==="learner"&&<span className="learner-icon">{s.name[0]}</span>}</div>)}<div ref={bottom}/></div>
        <form className="composer" onSubmit={async e=>{e.preventDefault();if(await act({type:"message",text:draft}))setDraft("");}}><label className="sr-only" htmlFor="reply">Your response</label><Textarea id="reply" placeholder="Say it in your own words… 中文也可以" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} disabled={busy} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
          <div className="composer-actions"><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>act({type:"hint"})}><CircleHelp/>Give me a hint</Button><span>Enter to send</span><Button type="submit" size="icon" aria-label="Send response" disabled={busy||!draft.trim()}><ArrowUp/></Button></div></form>
        <p className="conversation-foot"><ShieldCheck size={14}/> Hints and immediate reuse are recorded as supported practice.</p>
      </section><aside className="insight-column">
        <section className="intent-card"><span className="eyebrow">WHY THIS CONVERSATION</span><div className="intent-icon"><Sparkles size={23}/></div><h2>{s.scene.mode==="retrieval"?"A new context. Your words.":s.scene.mode==="bridge"?"Give it a little distance.":"Turn understanding into use."}</h2><p>{s.scene.reason}</p><div className="intent-rule"/><small>Earlier wording stays out of view. Opening the map, history, or a hint counts as support.</small></section>
        <section className="panel snapshot"><div className="section-heading"><h3>Your evidence, so far</h3><span>{totalEvidence}</span></div><div className="state-bars">{STAGES.map(stage=><div key={stage}><span className={"stage-dot "+stage}/><span>{LABEL[stage]}</span><strong>{counts[stage]}</strong></div>)}</div><Button variant="ghost" className="wide text-left" onClick={()=>switchTab("map")} disabled={busy}>Explore the learning map<ArrowRight/></Button></section>
        <div className="observation" role="status"><Check size={16}/><p>{s.notice}</p></div>
      </aside></div></TabsContent>
      <TabsContent value="map"><div className="map-heading"><div><h2>Evidence, not a mastery score.</h2><p>Each expression has its own history. Select one to see why.</p></div><label className="searchbox"><Search size={17}/><Input aria-label="Search expressions" placeholder="Find an expression" value={filter} onChange={e=>setFilter(e.target.value)}/></label></div><div className="map-notice"><CircleHelp size={16}/> Viewing these expressions supplies language. Later recall checks take this exposure into account.</div>
        <div className="learning-columns">{STAGES.map(stage=><section className="stage-column" key={stage}><div className="stage-heading"><span className={"stage-dot "+stage}/><h3>{LABEL[stage]}</h3><Badge variant="secondary">{counts[stage]}</Badge></div><p>{EXPLAIN[stage]}</p>{ITEMS.filter(i=>s.items[i.id].stage===stage && (i.lemma+" "+i.zh).toLowerCase().includes(filter.toLowerCase())).map(i=><button className="word-card" key={i.id} onClick={()=>setItem(i.id)}><span className="word-kind">{i.type}</span><strong>{i.lemma}</strong><span>{i.zh}</span><p>{i.sense}</p><div><span>{s.items[i.id].evidenceCount} observations</span><ChevronRight size={14}/></div></button>)}</section>)}</div>
        <section className="method-panel"><h3>How to read this map</h3><p>Confidence is a transparent heuristic, not a calibrated probability. Stable use requires three independent responses across three domains, two sessions, and at least seven days. A missed target may be a valid alternative expression.</p><details><summary>Recent selection decisions</summary><ol>{s.decisions.slice(-15).reverse().map((d,i)=><li key={i}>{d.text}</li>)}</ol></details></section>
      </TabsContent>
      <TabsContent value="reading"><div className="reading-grid"><section className="panel reading-panel"><span className="eyebrow">FAMILIAR LANGUAGE, ONE SMALL STRETCH</span><h2>A short read for where you are.</h2><p>One expression chosen from your learning model, surrounded by mostly familiar language.</p><Button onClick={()=>act({type:"reading"})} disabled={busy}><BookOpen/>{s.reading?"Make another reading":"Create my reading"}</Button>
        {s.reading&&<><div className="reading-meta"><Badge variant="outline">{s.reading.source==="model-provider"?"AI draft + deterministic validation":"Original template + deterministic validation"}</Badge><span>{s.reading.text.split(/\s+/).length} words</span></div><article className="passage">{s.reading.text}</article><div className="reading-target">One target <strong>{ITEM_MAP[s.reading.targetIds[0]].lemma}</strong><span>{ITEM_MAP[s.reading.targetIds[0]].zh}</span></div><div className="meaning-check"><h3>A quick meaning check</h3><p>What does the target expression mean in this passage?</p><Button variant="outline" disabled={busy||s.reading.comprehension!==undefined} onClick={()=>act({type:"comprehension",answer:"correct"})}>{ITEM_MAP[s.reading.targetIds[0]].sense}</Button><Button variant="outline" disabled={busy||s.reading.comprehension!==undefined} onClick={()=>act({type:"comprehension",answer:"incorrect"})}>Stop talking and leave the situation</Button>{s.reading.comprehension!==undefined&&<p role="status">{s.reading.comprehension?"Meaning recognized. This is recognition evidence, not independent use.":"Not established yet. Read the expression in context once more."}</p>}</div></>}
      </section><aside><section className="intent-card"><span className="eyebrow">LEXICAL CONTROL</span><h2>Checked after generation.</h2><p>Every passage is checked against known words, permitted expressions, and the selected target. Unexpected language triggers a repair.</p>{s.reading&&<><div className="validation-result"><ShieldCheck/><strong>{s.reading.attempts.at(-1)!.report.unexpected.length} unexpected items in the final passage</strong></div><p>{s.reading.attempts.length} validation {s.reading.attempts.length===1?"pass":"passes"} · {s.reading.attempts[0].report.unexpected.length} items flagged in the first draft</p><Button variant="outline" onClick={()=>setValidation(true)}>Inspect the lexical check<ArrowRight/></Button></>}<small>The base vocabulary is an imperfect diagnostic assumption. Passing this check does not prove that you understand every word.</small></section></aside></div></TabsContent>
      </Tabs><footer className="workspace-footer"><span><FlaskConical size={14}/> Language Lab · evidence engine v1</span><Button size="sm" variant="ghost" onClick={()=>act({type:"session"})} disabled={busy}><RefreshCw/>Start a new session</Button></footer>
    </main>}
    <Sheet open={!!item} onOpenChange={v=>!v&&setItem(null)}><SheetContent className="evidence-sheet">{item&&s&&<><SheetHeader><span className="eyebrow">EXPRESSION HISTORY</span><SheetTitle className="sheet-expression">{ITEM_MAP[item].lemma}</SheetTitle><SheetDescription>{ITEM_MAP[item].zh} · {ITEM_MAP[item].sense}</SheetDescription></SheetHeader><div className="sheet-body"><div className="evidence-summary"><Badge variant="secondary">{LABEL[s.items[item].stage]}</Badge><strong>{Math.round(s.items[item].confidence*100)}% heuristic confidence</strong></div><p className="field-note">Based on evidence type and recency. Not a probability of mastery.</p><code>{item}</code><ol className="timeline">{s.items[item].evidence.toReversed().map(e=><li key={e.id}><span className={"timeline-dot "+(e.kind==="spontaneous"?"independent":"")}/><div className="timeline-title"><strong>{e.kind.replaceAll("_"," ")}</strong><span>{new Date(e.at).toLocaleDateString()}</span></div><blockquote>{e.text}</blockquote><p>{e.reason}</p><small>{e.source} · {e.domain} · turn {e.turn} · weight {e.strength}{e.source==="synthetic-seed"?" · SAMPLE":""}</small></li>)}</ol></div></>}</SheetContent></Sheet>
    <Sheet open={history} onOpenChange={setHistory}><SheetContent className="evidence-sheet"><SheetHeader><SheetTitle>Conversation history</SheetTitle><SheetDescription>Visible past expressions have been recorded as assistance.</SheetDescription></SheetHeader><div className="sheet-body history-list">{s?.messages.map(m=><div key={m.id}><small>{m.role==="coach"?"Coach":s.name} · {m.context}</small><p>{m.text}</p></div>)}</div></SheetContent></Sheet>
    <Sheet open={validation} onOpenChange={setValidation}><SheetContent className="evidence-sheet"><SheetHeader><SheetTitle>Inside the lexical check</SheetTitle><SheetDescription>Tokenization, inflection handling, phrase matching, sense checks, and explicit name allowlists.</SheetDescription></SheetHeader><div className="sheet-body">{s?.reading?.attempts.map((a,i)=><section key={i} className="validation-attempt"><h3>Pass {i+1} · {a.report.passed?"Accepted":"Repair required"}</h3><p>{a.operation}</p><blockquote>{a.text}</blockquote><div className="token-cloud">{a.report.tokens.map((t,j)=><span key={j} title={t.lemma+": "+t.reason} className={"token "+t.kind}>{t.surface}<small>{t.kind}</small></span>)}</div>{a.report.unexpected.map((t,j)=><p key={j} className="unexpected-note"><strong>{t.surface}</strong> — {t.reason}</p>)}</section>)}</div></SheetContent></Sheet>
  </div>;
}
