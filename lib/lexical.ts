import { ITEMS, IRREGULAR, FUNCTION_WORDS, ITEM_MAP } from "./catalog.ts";
import { STAGES, type Learner, type LexicalToken, type Validation } from "./types.ts";

export const normalize = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
export function senseAllowed(id: string, text: string): boolean {
  if (id === "bank.n.finance") return /\b(money|deposit|account|cash|loan)\b/i.test(text) && !/\b(river|water|shore)\b/i.test(text);
  if (id === "bank.n.river") return /\b(river|shore|stream)\b/i.test(text) && !/\b(money|deposit|loan)\b/i.test(text);
  if (id === "appreciate.v.thanks") return !/\b(value|price|asset|currency|investment)\b/i.test(text);
  return true;
}
export function matches(text: string) {
  const normalized = normalize(text);
  return ITEMS.filter(i => new RegExp("\\b(?:" + i.pattern + ")\\b", "i").test(normalized) && senseAllowed(i.id, normalized));
}
export function lemmatize(surface: string, vocabulary: Set<string>): string {
  const w = surface.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (vocabulary.has(w)) return w;
  const candidates = [
    w.replace(/ies$/, "y"), w.replace(/ied$/, "y"),
    w.replace(/ing$/, ""), w.replace(/ing$/, "e"),
    w.replace(/([a-z])\1ing$/, "$1"),
    w.replace(/ed$/, ""), w.replace(/d$/, ""),
    w.replace(/([a-z])\1ed$/, "$1"), w.replace(/es$/, ""), w.replace(/s$/, ""),
  ];
  return candidates.find(x => x !== w && vocabulary.has(x)) || w;
}
export function validateLexical(text: string, knownBase: string[], permittedIds: string[], targetIds: string[], names = ["Maya", "Alex", "Friday", "Monday"]): Validation {
  const tokens: LexicalToken[] = [];
  const permitted = new Set(permittedIds), targets = new Set(targetIds);
  const vocab = new Set(knownBase.map(s => s.toLowerCase()));
  const spans: LexicalToken[] = [];
  // Longest matches consume component words, so knowing "take" and "account"
  // never silently licenses the expression "take into account".
  for (const item of ITEMS) {
    for (const m of text.matchAll(new RegExp("\\b(?:" + item.pattern + ")\\b", "gi"))) {
      if (!senseAllowed(item.id, text)) continue;
      spans.push({ surface:m[0], lemma:item.lemma, start:m.index!, end:m.index!+m[0].length, itemId:item.id,
        kind:targets.has(item.id) ? "target" : permitted.has(item.id) ? "known" : "unexpected",
        reason:targets.has(item.id) ? "Deliberately selected target sense" : permitted.has(item.id) ? "Learner has recognition or production evidence for this sense" : "Expression or sense is outside the permitted set" });
    }
  }
  spans.sort((a,b) => (b.end-b.start)-(a.end-a.start));
  const chosen: LexicalToken[] = [];
  for (const span of spans) if (!chosen.some(x => span.start < x.end && span.end > x.start)) chosen.push(span);
  tokens.push(...chosen);
  for (const m of text.matchAll(/[\p{L}]+(?:['’][\p{L}]+)?|\d+/gu)) {
    const start=m.index!, end=start+m[0].length;
    if (chosen.some(x => start >= x.start && end <= x.end)) continue;
    const raw=m[0], lower=normalize(raw), word=lower.replace(/['’](s|re|ve|ll|d|m)$/, "");
    const lemma=lemmatize(word, vocab);
    const isContraction=/^(don't|doesn't|didn't|isn't|aren't|wasn't|weren't|can't|couldn't|won't|wouldn't|shouldn't|haven't|hasn't|hadn't)$/i.test(lower);
    let kind: LexicalToken["kind"], reason: string;
    if (/^banks?$/.test(lower)) { kind="ambiguous"; reason="Bank has multiple senses; nearby cues do not resolve one safely"; }
    else if (names.includes(raw)) { kind="name"; reason="Explicit scenario name allowlist, not capitalization alone"; }
    else if (FUNCTION_WORDS.has(word) || isContraction || /^\d+$/.test(word)) { kind="function"; reason="Function word, contraction, or numeral"; }
    else if (vocab.has(lemma)) { kind="known"; reason=word===lemma ? "Provisional diagnostic vocabulary" : "Inflection mapped to permitted lemma: "+lemma; }
    else { kind="unexpected"; reason="Content word is outside the permitted and target sets"; }
    tokens.push({surface:raw, lemma, start, end, kind, reason});
  }
  tokens.sort((a,b) => a.start-b.start);
  const unexpected=tokens.filter(t => t.kind==="unexpected" || t.kind==="ambiguous");
  const missingTargets=targetIds.filter(id=>!tokens.some(t=>t.itemId===id&&t.kind==="target"));
  return {passed:unexpected.length===0 && tokens.length>0 && missingTargets.length===0, tokens, unexpected, missingTargets, coverage:tokens.length ? (tokens.length-unexpected.length)/tokens.length : 0, targetIds, permittedCount:permitted.size+vocab.size};
}
export function permittedItems(s: Learner) { return ITEMS.filter(i => STAGES.indexOf(s.items[i.id].stage)>=2).map(i=>i.id); }
export function readingTarget(s: Learner) {
  return ITEMS.filter(i=>!i.id.startsWith("bank.")).sort((a,b)=>{
    const score=(id:string)=>({assisted_production:0,understood:1,encountered:2,unseen:3,spontaneous_production:4,stable:5}[s.items[id].stage]);
    return score(a.id)-score(b.id);
  })[0].id;
}
export function originalReading(itemId: string) {
  const lines: Record<string,string> = {
    "express-gratitude.v.01":"Maya helped me finish the project. I wanted to express my gratitude for her help. I wrote her a short note. We worked well together.",
    "appreciate.v.thanks":"Maya helped me finish the project. I really appreciate her help. I wrote her a short note. We worked well together.",
    "reschedule.v.01":"Maya has a meeting on Friday. I need to reschedule our meeting. I will call her today. We can choose a different day.",
    "look-forward-to.v.01":"Maya will visit on Friday. I look forward to seeing her again. We will cook dinner at home. We have a lot to talk about.",
    "make-time-for.v.01":"Maya has a busy week. She wants to make time for her friends. She will call them today. They can meet on Friday.",
    "raise-concern.v.01":"Maya has a new plan for the project. I want to raise a concern about the cost. We will talk today. We can find a better way.",
    "take-into-account.v.01":"Maya has a plan for a trip. We should take the cost into account. We can go by train. We will decide on Friday.",
    "meet-deadline.v.01":"Maya helped me with the project. We worked together to meet the deadline. I wrote her a short note. We will meet again on Friday.",
    "figure-out.v.01":"Maya has a problem with her plan. We can figure out a better way. We will talk today. We have time to think.",
    "put-off.v.01":"Maya wanted to go on a trip. We had to put off the trip. We will stay home today. We can go next week.",
  };
  return lines[itemId] || ITEM_MAP[itemId].hint;
}
