import { normalizeForm } from "./keys.ts";

export const WEIGHT_MODEL = "evidence-v1-uncalibrated";
export type Dimension = "familiarity" | "recognition" | "production";
export type EvidenceKind = "exposure" | "assisted" | "recognition" | "independent" | "retrieval" | "failure";
export type Evidence = {
  nodeId: string; kind: EvidenceKind; at: string; quality: number;
  quote?: string; reason: string; context?: string; assessor?: string;
};
export type NodeLearning = {
  nodeId: string; exposures: number; lastExposure?: string; supportedAt?: string;
  recognitionSuccess: number; recognitionFailure: number;
  productionSuccess: number; productionFailure: number;
  assessedAt?: string; productionAt?: string; contexts: string[]; practiceDays: string[];
  evidenceCount: number; latest: Evidence[];
  scopes?: string[]; cached?: Weight;
};
export type Weight = { familiarity: number; recognition: number | null; production: number | null; confidence: number; evidenceCount: number; model: string };
export function emptyLearning(nodeId: string): NodeLearning {
  return { nodeId, exposures: 0, recognitionSuccess: 0, recognitionFailure: 0, productionSuccess: 0, productionFailure: 0, contexts: [], practiceDays: [], evidenceCount: 0, latest: [] };
}
const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
/** Transparent engineering prior, NOT a calibrated probability of competence. */
export function weightOf(state?: NodeLearning, _at = new Date().toISOString()): Weight {
  if (!state) return { familiarity: 0, recognition: null, production: null, confidence: 0, evidenceCount: 0, model: WEIGHT_MODEL };
  const trials = state.recognitionSuccess + state.recognitionFailure + state.productionSuccess + state.productionFailure;
  const productionTrials = state.productionSuccess + state.productionFailure;
  return {
    familiarity: Math.min(.45, 1 - Math.exp(-.08 * state.exposures)),
    recognition: trials ? (state.recognitionSuccess + state.productionSuccess + 1) / (trials + 2) : null,
    production: productionTrials ? (state.productionSuccess + 1) / (productionTrials + 2) : null,
    confidence: trials / (trials + 5), evidenceCount: state.evidenceCount, model: WEIGHT_MODEL,
  };
}
export function applyEvidence(previous: NodeLearning | undefined, event: Evidence): NodeLearning {
  const state = structuredClone(previous || emptyLearning(event.nodeId));
  const day = event.at.slice(0, 10), q = clamp(event.quality);
  if (event.kind === "exposure" || event.kind === "assisted") {
    if (state.lastExposure?.slice(0, 10) !== day) state.exposures++;
    state.lastExposure = event.at; state.supportedAt = event.at;
    // Repetition/copying cannot increase recognition or production.
  } else {
    const newContext = Boolean(event.context && !state.contexts.includes(event.context));
    const newDay = !state.practiceDays.includes(day);
    const novelty = newContext && newDay ? 1 : .35;
    if (event.kind === "recognition") state.recognitionSuccess += .8 * q * novelty;
    if (event.kind === "independent" || event.kind === "retrieval") {
      state.productionSuccess += (event.kind === "retrieval" ? 2 : 1.4) * q * novelty;
      state.productionAt = event.at;
    }
    if (event.kind === "failure") { state.productionFailure += q; state.productionAt = event.at; }
    state.assessedAt = event.at;
    if (newContext) state.contexts = [...state.contexts, event.context!].slice(-40);
    if (newDay) state.practiceDays = [...state.practiceDays, day].slice(-60);
  }
  state.evidenceCount++;
  state.latest = [...state.latest, event].slice(-8);
  return state;
}
export function recentSupport(states: (NodeLearning | undefined)[], at: string) {
  return states.some(s => s?.supportedAt && Date.parse(at) - Date.parse(s.supportedAt) < 86400000);
}
export function isContextualWriting(text: string) {
  return (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length || 0) >= 7 && !/^\s*([A-Za-z' -]+[,;\n]\s*){4,}[A-Za-z' -]*\s*$/.test(text);
}
export function isSourceCopy(text: string, examples: string[]) {
  const normalized = normalizeForm(text).replace(/[^a-z0-9 ]/g, "");
  return examples.some(example => {
    const reference = normalizeForm(example).replace(/[^a-z0-9 ]/g, "");
    return reference.length > 15 && normalized.includes(reference);
  });
}
/** Absence is a question to investigate, never a score mutation. Baselines must match opportunities. */
export function synonymProbe(observed: number, opportunities: number, expectedShare: number, matchedContext: boolean) {
  if (!matchedContext || opportunities < 20 || expectedShare <= 0 || expectedShare >= 1) return { suggest: false, reason: "Insufficient comparable opportunities." };
  const expected = opportunities * expectedShare;
  const z = (observed - expected) / Math.sqrt(opportunities * expectedShare * (1 - expectedShare));
  return { suggest: expected >= 5 && z < -2, reason: "Usage imbalance suggests a diagnostic probe, not lack of mastery.", z, expected };
}
