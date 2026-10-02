import { z } from "zod";
import { applyAction, derive } from "@/lib/engine";
import { loadLearner, saveLearner } from "@/lib/store";
import { configured, generateDraft } from "@/lib/provider";
import { ITEMS } from "@/lib/catalog";
import { runtimeEnv } from "@/lib/runtime";
import { hasSameRequestOrigin } from "@/lib/request-origin";
export const dynamic = "force-dynamic";
const actionSchema=z.discriminatedUnion("type",[
  z.object({type:z.literal("diagnostic"),recognition:z.enum(["change-time","cancel","confirm","unsure"]),production:z.string().max(2000),name:z.string().max(50).optional()}),
  z.object({type:z.literal("sample")}), z.object({type:z.literal("message"),text:z.string().min(1).max(2000)}),
  z.object({type:z.literal("hint")}),z.object({type:z.literal("session")}),z.object({type:z.literal("reading")}),
  z.object({type:z.literal("inspect"),itemIds:z.array(z.string().max(80)).max(12)}),
  z.object({type:z.literal("comprehension"),answer:z.enum(["correct","incorrect"])}),
]);
function identity(request:Request) {
  const user=request.headers.get("oai-authenticated-user-id");
  if(user) return "user:"+user;
  if(["127.0.0.1","localhost","[::1]"].includes(new URL(request.url).hostname)) return "local-demo";
  return null;
}
function output(data:unknown,status=200) {return Response.json(data,{status,headers:{"Cache-Control":"no-store"}});}
export async function GET(request:Request) {
  const id=identity(request); if(!id) return output({error:"Sign in to access your learner profile.",signIn:true},401);
  try {
    const result=await loadLearner(id);
    for(const item of ITEMS) result.state.items[item.id]=derive(result.state.items[item.id].evidence,new Date().toISOString());
    const env = await runtimeEnv();
    return output({...result,provider:configured(env)?"configured":"template"});
  } catch(error) { console.error("learner_load_failed",error instanceof Error?error.message:"unknown");return output({error:"Learner storage could not be loaded. Check the local database setup, then retry."},503); }
}
export async function POST(request:Request) {
  const id=identity(request); if(!id) return output({error:"Sign in to save your learner profile.",signIn:true},401);
  if(!hasSameRequestOrigin(request)) return output({error:"Cross-origin request rejected."},403);
  try {
    const raw=await request.text();if(raw.length>16000) return output({error:"Request is too large."},413);
    const parsed=z.object({revision:z.number().int().nonnegative(),action:actionSchema}).safeParse(JSON.parse(raw));
    if(!parsed.success) return output({error:"Invalid action. Check the response and try again."},400);
    const current=await loadLearner(id);
    if(parsed.data.revision!==current.revision) return output({error:"Your profile changed in another tab. Reload it and retry; your draft is preserved."},409);
    if(parsed.data.action.type==="sample" && current.state.onboarded) return output({error:"The sample can only be loaded into a new profile."},400);
    const env = await runtimeEnv();
    const draft=parsed.data.action.type==="reading"?await generateDraft(current.state,env):undefined;
    const state=applyAction(current.state,parsed.data.action,new Date().toISOString(),draft);
    if(!await saveLearner(id,current.revision,state)) return output({error:"Another change was saved first. Reload the profile and retry."},409);
    console.info(JSON.stringify({event:"learner_transition",action:parsed.data.action.type,revision:current.revision+1,turn:state.turn,stages:Object.fromEntries(ITEMS.map(i=>[i.id,state.items[i.id].stage]))}));
    return output({state,revision:current.revision+1,provider:configured(env)?"configured":"template"});
  } catch(error) {
    const message=error instanceof Error?error.message:"Unable to save.";
    console.error("learner_action_failed",message);
    // Database/runtime internals and provider credentials are never returned.
    const expected=/^(Write |Give |Try |Complete |Diagnostic |Reading |The reading provider|The model endpoint|This reading|Generate )/.test(message);
    return output({error:expected?message:"The action could not be saved. Your draft is still here; check storage and try again."},expected?400:503);
  }
}
