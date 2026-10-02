import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { EnglishGraph } from "../lib/graph/catalog.ts";
import { resolveWordList, writingCandidates, assessWriting, annotateNode } from "../lib/graph/assessment.ts";
const graph = new EnglishGraph(async path => JSON.parse(await readFile(join("public", path), "utf8")));
const manifest = await graph.manifest();
const started = performance.now();
const view = await graph.view("english", 4, 250);
console.log(JSON.stringify({ corpus: manifest.counts, graphQuery: { visible: view.nodes.length, edges: view.edges.length, milliseconds: Math.round(performance.now() - started) } }));
const files = (await readdir("public/graph-data/oewn-2025")).filter(f => f.startsWith("forms-"));
const forms = [];
for (const file of files) forms.push(...Object.keys(JSON.parse(await readFile(join("public/graph-data/oewn-2025", file), "utf8"))));
const sample = forms.filter((_, i) => i % Math.max(1, Math.floor(forms.length / 2000)) === 0).slice(0, 2000);
const importedAt = performance.now(), report = await resolveWordList(graph, sample.join("\n"));
console.log(JSON.stringify({ bulkImport: { supplied: report.entries, matched: report.matched.size, unmatched: report.unmatched.length, milliseconds: Math.round(performance.now() - importedAt), masteryAwarded: false } }));
if (process.argv.includes("--live")) {
  const text = "I appreciate your help with the project today. We need to reschedule the meeting because the train is late.";
  const candidates = await writingCandidates(graph, text), start = performance.now();
  const config = { AI_BASE_URL: process.env.AI_BASE_URL, AI_MODEL: process.env.AI_MODEL, AI_API_KEY: process.env.AI_API_KEY };
  try {
    const evidence = await assessWriting(text, candidates, {}, config, new Date().toISOString());
    console.log(JSON.stringify({ liveAssessment: { model: config.AI_MODEL, candidateSenses: candidates.length, accepted: evidence.map(e => ({ nodeId: e.nodeId, kind: e.kind, quote: e.quote })), milliseconds: Math.round(performance.now() - start), writesToLearnerProfile: false } }));
    const node = await graph.node("sense:appreciate%2:37:00::");
    const note = await annotateNode(node, [], {}, config);
    console.log(JSON.stringify({ liveAnnotation: { characters: note.length, englishOnly: !/[\u3400-\u9fff]/.test(note), writesToLearnerProfile: false } }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
