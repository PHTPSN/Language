"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import { BookOpen, Focus, Network, Search, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GraphManifest, GraphNode, GraphView } from "@/lib/graph/types";
import type { Dimension, Evidence, NodeLearning } from "@/lib/graph/learning";
import type { Annotation, OverlayWeight } from "@/lib/graph/repository";
import "./english-graph.css";
import "./graph-learning.css";

type GraphResponse = { manifest: GraphManifest; view: GraphView; learning: { revision?: number; weights: Record<string, OverlayWeight>; error?: string; summary?: { tracked: number; assessed: number } } };
type Action = { type: "import" | "writing"; text: string } | { type: "inspect"; nodeId: string } | { type: "annotate"; nodeId: string; ai: boolean; text?: string };
type ActionResponse = { revision: number; error?: string; message?: string; duplicate?: boolean; report?: { message?: string; supplied?: number; matched?: number; unmatched?: string[]; assessed?: number; independent?: number; supported?: number }; events?: Evidence[] };
const number = (n: number) => n.toLocaleString("en-US");
const percent = (value: number | null | undefined) => value === null || value === undefined ? "Unassessed" : Math.round(value * 100) + "%";
function color(weight: OverlayWeight | undefined, dimension: Dimension) {
  const value = weight?.[dimension];
  if (value === undefined || value === null || (dimension === "familiarity" && !weight?.evidenceCount)) return "#91a3ad";
  return "hsl(" + (35 + value * 140) + " 53% " + (54 - value * 20) + "%)";
}
export default function EnglishGraphWorkspace() {
  const [root, setRoot] = useState("english"), [depth, setDepth] = useState(1), [budget, setBudget] = useState(100), [offset, setOffset] = useState(0);
  const [layout, setLayout] = useState("radial"), [dimension, setDimension] = useState<Dimension>("production"), [query, setQuery] = useState("");
  const [data, setData] = useState<GraphResponse | null>(null), [selected, setSelected] = useState<GraphNode | null>(null), [results, setResults] = useState<GraphNode[]>([]);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const [list, setList] = useState(""), [writing, setWriting] = useState(""), [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({}), [report, setReport] = useState<ActionResponse | null>(null);
  const [notes, setNotes] = useState<Annotation[]>([]), [detail, setDetail] = useState<NodeLearning | undefined>(), [provider, setProvider] = useState(false);
  const container = useRef<HTMLDivElement>(null), cy = useRef<Core | null>(null), revision = useRef<number | null>(null);
  const inspected = useRef(new Set<string>()), pending = useRef(Promise.resolve());
  const focusNode = useCallback((id: string) => { setSelected(null); setRoot(id); setOffset(0); setResults([]); }, []);
  const save = useCallback((action: Action, quiet = false): Promise<void> => {
    const operation = pending.current.catch(() => {}).then(async () => {
      if (revision.current === null) { setError("Learning storage is not ready. Reload evidence and try again."); return; }
      setBusy(true); if (!quiet) { setError(""); setReport(null); }
      try {
        const response = await fetch("/api/graph/learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: revision.current, action }) });
        const body = await response.json() as ActionResponse;
        if (!response.ok) throw new Error(body.error || "Unable to save evidence.");
        revision.current = body.revision;
        if (!quiet) { setReport(body); if (action.type === "annotate" && !action.ai) setNoteDrafts(drafts => ({ ...drafts, [action.nodeId]: "" })); }
        setRefresh(v => v + 1);
      } catch (e) { setError(e instanceof Error ? e.message : "Unable to save evidence."); }
      finally { setBusy(false); }
    });
    pending.current = operation;
    return operation;
  }, []);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true);
    const url = "/api/graph?root=" + encodeURIComponent(root) + "&depth=" + depth + "&budget=" + budget + "&offset=" + offset;
    fetch(url, { signal: abort.signal })
      .then(async response => { const body = await response.json() as GraphResponse & { error?: string }; if (!response.ok) throw new Error(body.error); return body; })
      .then(body => {
        // An evidence refresh must not reset the learner's zoom or pan position.
        setData(previous => previous && JSON.stringify(previous.view) === JSON.stringify(body.view) ? { ...body, view: previous.view } : body);
        setSelected(previous => body.view.nodes.find(n => n.id === previous?.id) || body.view.nodes[0]);
        if (typeof body.learning.revision === "number") revision.current = Math.max(revision.current ?? 0, body.learning.revision);
      })
      .catch(e => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [root, depth, budget, offset, refresh]);
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const abort = new AbortController();
    const timer = setTimeout(() => fetch("/api/graph?q=" + encodeURIComponent(query), { signal: abort.signal }).then(r => r.json() as Promise<{ results?: GraphNode[] }>).then(body => setResults(body.results || [])).catch(() => {}), 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query]);
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    fetch("/api/graph/learning?ids=" + encodeURIComponent(selected.id) + "&node=" + encodeURIComponent(selected.id), { signal: abort.signal })
      .then(r => r.json() as Promise<{ annotations?: Annotation[]; states?: Record<string, NodeLearning>; provider?: boolean }>).then(body => { setNotes(body.annotations || []); setDetail(body.states?.[selected.id]); setProvider(Boolean(body.provider)); }).catch(() => {});
    return () => abort.abort();
  }, [selected?.id, refresh]);
  useEffect(() => {
    if (!selected || !["sense", "lexeme", "concept", "frame"].includes(selected.kind) || inspected.current.has(selected.id) || revision.current === null) return;
    inspected.current.add(selected.id);
    void save({ type: "inspect", nodeId: selected.id }, true);
  }, [selected?.id, save, data?.learning.revision]);
  const view = data?.view;
  const weights = data?.learning.weights;
  useEffect(() => {
    if (!container.current || !view) return;
    const instance = cytoscape({ container: container.current, minZoom: .12, maxZoom: 3, wheelSensitivity: .2,
      elements: [...view.nodes.map(n => ({ data: { id: n.id, label: n.label, kind: n.kind, color: "#91a3ad", size: n.id === root ? 46 : n.kind === "sense" ? 19 : 30 } })), ...view.edges.map((e, i) => ({ data: { id: "edge:" + i, source: e.source, target: e.target, label: e.type } }))],
      style: [
        { selector: "node", style: { "background-color": "data(color)", width: "data(size)", height: "data(size)", label: "data(label)", color: "#284550", "font-size": 14, "text-valign": "bottom", "text-margin-y": 8, "text-wrap": "ellipsis", "text-max-width": "145px", "border-width": 2, "border-color": "#fff" } },
        { selector: 'node[kind = "root"], node[kind = "layer"], node[kind = "pos"]', style: { "font-weight": 600 } },
        { selector: "node:selected", style: { "border-color": "#174f58", "border-width": 5 } },
        { selector: "edge", style: { width: 1.2, "line-color": "#c9d8dc", "curve-style": "bezier", opacity: .8 } },
      ],
      layout: { name: "breadthfirst", circle: layout === "radial", directed: true, roots: [view.root], padding: 65, spacingFactor: 1.3, avoidOverlap: true, nodeDimensionsIncludeLabels: true } as cytoscape.BreadthFirstLayoutOptions,
    });
    instance.on("tap", "node", event => setSelected(view.nodes.find(n => n.id === event.target.id()) || null));
    instance.on("dbltap", "node", event => focusNode(event.target.id()));
    cy.current = instance;
    const observer = new ResizeObserver(() => instance.resize()); observer.observe(container.current);
    return () => { observer.disconnect(); instance.destroy(); cy.current = null; };
  }, [view, layout, root, focusNode]);
  useEffect(() => {
    cy.current?.batch(() => cy.current?.nodes().forEach(node => { node.data("color", color(weights?.[node.id()], dimension)); }));
  }, [weights, dimension, view, layout]);
  const note = selected ? noteDrafts[selected.id] || "" : "";
  const selectedWeight = selected ? data?.learning.weights[selected.id] : undefined;
  const canSave = !busy && typeof data?.learning.revision === "number";
  return <main className="eg-workspace">
    <header className="eg-header"><a href="/" className="eg-brand"><Network size={23} /> Language Lab <span>English atlas</span></a><a href="/practice"><BookOpen size={16} /> Earlier practice lab</a></header>
    <section className="eg-title"><div><span className="eg-eyebrow">YOUR ENGLISH KNOWLEDGE NETWORK</span><h1>Explore your English.</h1><p>Meanings, expressions, and patterns—connected to evidence of your learning.</p></div><div className="eg-counts"><strong>{data ? number(data.manifest.counts.lexicalEntries) : "—"}<small>lexical entries</small></strong><strong>{data ? number(data.manifest.counts.concepts) : "—"}<small>connected meanings</small></strong></div></section>
    <div className="eg-toolbar"><div className="eg-search"><Search size={18} /><Input aria-label="Search all English words and expressions" placeholder="Find a word or expression…" value={query} onChange={e => setQuery(e.target.value)} />{query && <div className="eg-search-results">{results.length ? results.map(n => <button key={n.id} onClick={() => { focusNode(n.id); setQuery(""); }}>{n.label}<span>{n.childCount ?? n.children.length} meanings</span></button>) : <p>No matching entries. Try the base form.</p>}</div>}</div>
      <Select value={layout} onValueChange={setLayout}><SelectTrigger aria-label="Graph layout"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="radial">Radial</SelectItem><SelectItem value="tree">Top-down</SelectItem></SelectContent></Select>
      <Select value={dimension} onValueChange={v => setDimension(v as Dimension)}><SelectTrigger aria-label="Color graph by"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="production">Independent use</SelectItem><SelectItem value="recognition">Recognition</SelectItem><SelectItem value="familiarity">Familiarity</SelectItem></SelectContent></Select>
      <label className="eg-range">Depth <b>{depth}</b><Slider aria-label="Graph depth" min={1} max={5} step={1} value={[depth]} onValueChange={v => setDepth(v[0])} /></label>
      <label className="eg-range">Density <b>{budget}</b><Slider aria-label="Graph density" min={20} max={350} step={10} value={[budget]} onValueChange={v => setBudget(v[0])} /></label>
      <Button variant="outline" onClick={() => cy.current?.fit(undefined, 50)}><Focus size={16} /> Fit</Button>
    </div>
    {(error || data?.learning.error) && <div className="eg-error" role="alert">{error || data?.learning.error}<Button variant="ghost" onClick={() => { setError(""); setRefresh(v => v + 1); }}>Reload evidence</Button></div>}
    <div className="eg-main"><section className="eg-map" aria-label="Interactive English knowledge graph">
      <div className="eg-map-heading"><Button variant="ghost" onClick={() => focusNode("english")}>Whole network</Button><span aria-live="polite">{loading ? "Loading graph…" : (data?.view.nodes.length || 0) + " visible nodes"}</span></div>
      <div className="eg-canvas" ref={container} />
      <div className="eg-legend"><span><i style={{ background: "#91a3ad" }} /> Unassessed</span><span className="eg-gradient" /><span>Lower to higher evidence index</span></div>
      <div className="eg-map-footer"><span>Scroll to zoom · Drag to move · Select a node to explore</span>{data?.view.nextOffset !== null && data?.view.nextOffset !== undefined && <Button variant="outline" onClick={() => setOffset(data.view.nextOffset!)}>Next branches</Button>}{offset > 0 && <Button variant="ghost" onClick={() => setOffset(0)}>First page</Button>}</div>
    </section><aside className="eg-inspector">{selected && <>
      <span className="eg-eyebrow">{selected.kind === "concept" ? "MEANING GROUP" : selected.kind.toUpperCase()}</span><h2>{selected.label}</h2><p>{selected.definition}</p>{selected.pronunciation?.length ? <p className="eg-pronunciation">/{selected.pronunciation[0]}/</p> : null}
      <div className="eg-weights">{(["familiarity", "recognition", "production"] as Dimension[]).map(key => <div key={key}><span>{key === "production" ? "Independent use" : key[0].toUpperCase() + key.slice(1)}</span><strong>{percent(selectedWeight?.[key])}</strong><div className="eg-weight-track"><i style={{ width: (100 * (selectedWeight?.[key] || 0)) + "%", background: color(selectedWeight, key) }} /></div></div>)}<small>{selectedWeight?.aggregate ? "Observed descendants only: " + (selectedWeight.assessed || 0) + " assessed, " + (selectedWeight.tracked || 0) + " tracked. Unknown nodes are excluded." : (selectedWeight?.evidenceCount || 0) + " observations · evidence support " + percent(selectedWeight?.confidence ?? 0)}</small></div>
      <p className="eg-method-note">These are provisional evidence indices, not calibrated mastery probabilities. Displaying explanations counts as support.</p>
      <Button className="w-full" onClick={() => focusNode(selected.id)}>Explore this node</Button>{selected.parent && <Button variant="ghost" className="w-full" onClick={() => focusNode(selected.parent!)}>Go to parent</Button>}
      {selected.examples?.slice(0, 2).map((text, i) => <blockquote key={i}>{text}</blockquote>)}
      <details open><summary>Visible branches · {selected.childCount ?? selected.children.length}</summary><div className="eg-branch-list">{data?.view.nodes.filter(n => selected.children.includes(n.id)).map(n => <button key={n.id} onClick={() => focusNode(n.id)}>{n.label}<span>{n.childCount || n.kind}</span></button>)}</div></details>
      <details><summary>Evidence history</summary>{detail?.latest.length ? detail.latest.slice().reverse().map((event, i) => <article className="eg-evidence" key={i}><b>{event.kind}</b><time>{new Date(event.at).toLocaleDateString("en-US")}</time>{event.quote && <blockquote>{event.quote}</blockquote>}<p>{event.reason}</p><small>{event.assessor || "Recorded interaction"}</small></article>) : <p>No direct evidence recorded for this node.</p>}</details>
      <section className="eg-notes"><h3>Node annotations</h3>{notes.map(item => <article key={item.id}><small>{item.source === "ai" ? "AI note · " + item.model : "Your note"}</small><p>{item.text}</p></article>)}<Textarea aria-label="English annotation for selected node" placeholder="Add a note in English…" value={note} maxLength={2000} onChange={e => setNoteDrafts(drafts => ({ ...drafts, [selected.id]: e.target.value }))} /><div><Button variant="outline" disabled={!canSave || !note.trim()} onClick={() => void save({ type: "annotate", nodeId: selected.id, ai: false, text: note })}>Save note</Button><Button variant="ghost" disabled={!canSave || !provider} onClick={() => void save({ type: "annotate", nodeId: selected.id, ai: true })}><Sparkles size={15} /> Ask AI</Button></div></section>
    </>}</aside></div>
    <section className="eg-learning"><div className="eg-learning-heading"><div><h2>Put evidence on the graph</h2><p>{number(data?.learning.summary?.tracked || 0)} tracked nodes · {number(data?.learning.summary?.assessed || 0)} with production evidence</p></div><span aria-live="polite">{busy ? "Saving evidence…" : "Your previous practice profile is preserved separately."}</span></div>
      <Tabs defaultValue="list"><TabsList><TabsTrigger value="list">Word list</TabsTrigger><TabsTrigger value="writing">Writing sample</TabsTrigger><TabsTrigger value="rules">How weights work</TabsTrigger></TabsList>
        <TabsContent value="list"><p>Paste up to 2,000 words or expressions, separated by new lines or commas. This records exposure only; it does not claim you understand every meaning.</p><Textarea aria-label="Words and expressions to import" placeholder={"appreciate\nreschedule\nlook forward to\ntake into account"} value={list} onChange={e => setList(e.target.value)} maxLength={150000} /><Button disabled={!canSave || !list.trim()} onClick={() => void save({ type: "import", text: list })}><Upload size={16} /> Record familiarity</Button></TabsContent>
        <TabsContent value="writing"><p>Submit connected English writing. AI reviews up to 12 matched expressions and records exact supporting text. Recent hints or copied examples receive supported-practice credit only.</p><Textarea aria-label="English writing sample" placeholder="Write about an experience, explain a decision, or paste a passage you wrote independently…" value={writing} onChange={e => setWriting(e.target.value)} maxLength={6000} /><div className="eg-submit"><Button disabled={!canSave || !writing.trim() || !provider} onClick={() => void save({ type: "writing", text: writing })}><Sparkles size={16} /> Review writing</Button><small>{provider ? "Your sample and candidate meanings are sent to the configured AI provider." : "AI provider is not configured. Word-list imports remain available."}</small></div></TabsContent>
        <TabsContent value="rules"><div className="eg-rules"><p><strong>Exposure is not mastery.</strong> Seeing a word increases form familiarity slightly. It cannot establish recognition or independent use.</p><p><strong>Meanings stay separate.</strong> Knowing a financial bank does not establish knowledge of a river bank. Synonyms do not inherit each other’s production scores.</p><p><strong>Independent evidence matters more.</strong> Contextual use earns more weight than a shown example. Repeated input is deduplicated; different days and contexts provide stronger evidence.</p><p><strong>Missing use is not a failure.</strong> A frequency imbalance can suggest a diagnostic question only when topic, meaning, and opportunities are comparable. Automatic synonym penalties are disabled.</p></div></TabsContent>
      </Tabs>
      {report && <div className="eg-report" role="status"><strong>{report.message || report.report?.message || "Evidence saved."}</strong>{report.report?.supplied !== undefined && <p>{number(report.report.matched || 0)} matched nodes from {number(report.report.supplied)} unique entries. {report.report.unmatched?.length || 0} entries unmatched.</p>}{report.report?.assessed !== undefined && <p>{report.report.independent || 0} independent-use observations · {report.report.supported || 0} supported observations.</p>}{!!report.report?.unmatched?.length && <details><summary>Unmatched entries</summary><p>{report.report.unmatched.join(", ")}</p></details>}{report.events?.some(e => e.kind !== "exposure") && <div>{report.events.filter(e => e.kind !== "exposure").map((e, i) => <p key={i}><button onClick={() => focusNode(e.nodeId)}>{e.quote}</button> — {e.kind}</p>)}</div>}</div>}
    </section>
    <footer className="eg-source"><div><strong>Coverage: lexical core + verb patterns</strong><p>The complete WordNet core is imported. Comprehensive grammar, collocations, and conversation skills are not yet covered. Data transformed into navigable concepts, lexical senses, and word-form nodes.</p></div><a href="https://en-word.net/downloads" target="_blank" rel="noreferrer">Open English WordNet Community · CC BY 4.0<br />Derived from Princeton WordNet</a></footer>
  </main>;
}
