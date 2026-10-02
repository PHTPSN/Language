import type { Learner } from "./types.ts";
import { ITEM_MAP } from "./catalog.ts";
import { permittedItems, readingTarget } from "./lexical.ts";
export type ProviderConfig = { AI_BASE_URL?:string; AI_API_KEY?:string; AI_MODEL?:string };
export function configured(c:ProviderConfig) { return Boolean(c.AI_BASE_URL && c.AI_API_KEY && c.AI_MODEL); }
export function completionEndpoint(baseUrl:string) {
  const url=new URL(baseUrl);
  if(url.protocol!=="https:" && !["localhost","127.0.0.1"].includes(url.hostname)) throw new Error("The model endpoint must use HTTPS.");
  const path=url.pathname.replace(/\/+$/ ,"");
  url.pathname=path.endsWith("/chat/completions") ? path : path+"/chat/completions";
  return url.toString();
}
// Optional Chat Completions-compatible provider. It proposes content, never evidence.
export async function generateDraft(s:Learner,c:ProviderConfig,fetcher:typeof fetch=fetch):Promise<string|undefined> {
  if(!configured(c)) return undefined;
  const endpoint=completionEndpoint(c.AI_BASE_URL!);
  const target=ITEM_MAP[readingTarget(s)];
  // DeepSeek V4 enables thinking by default. Short readings need the token
  // budget for passage text; keep vendor-specific options off other providers.
  const deepseek=new URL(endpoint).hostname==="api.deepseek.com" && c.AI_MODEL!.startsWith("deepseek-v4-");
  let response:Response;
  try { response=await fetcher(endpoint,{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+c.AI_API_KEY},
    signal:AbortSignal.timeout(15000),
    body:JSON.stringify({model:c.AI_MODEL,temperature:.4,max_tokens:220,...(deepseek?{thinking:{type:"disabled"}}:{}),messages:[
      {role:"system",content:"Write an original 3–4 sentence English mini-story for an adult intermediate learner. Return only the passage. Use only the permitted content words, their ordinary inflections, function words, permitted expressions, and the target expression. Include the target expression once in its specified sense. Keep the story short and natural. No Markdown, explanations, citations, copied material, or unlisted idioms. Proper names allowed: Maya, Alex, Friday, Monday."},
      {role:"user",content:JSON.stringify({target:{expression:target.lemma,sense:target.sense},permittedWords:s.knownBase,permittedExpressions:permittedItems(s).map(id=>ITEM_MAP[id].lemma)})}
    ]}),
  }); } catch(error) {
    const timeout=error instanceof Error && ["TimeoutError","AbortError"].includes(error.name);
    throw new Error(timeout ? "Reading provider timed out. Please try again." : "Reading provider could not be reached. Check the connection and try again.");
  }
  if(!response.ok) throw new Error("Reading provider returned HTTP "+response.status+". Try again or disable the provider.");
  const data=await response.json().catch(()=>null) as {choices?:{message?:{content?:unknown};finish_reason?:string}[]}|null;
  const choice=data?.choices?.[0];
  const text=typeof choice?.message?.content==="string" ? choice.message.content.trim() : undefined;
  if(choice?.finish_reason==="length") throw new Error("Reading provider returned an incomplete passage. Please try again.");
  if(!text || text.length>3000) throw new Error("The reading provider returned an invalid passage.");
  return text;
}
