// The service credential is supplied only by the Edge runtime, never by the client.
type Dependencies={createClient:(url:string,key:string,options:unknown)=>any,url:string,anon:string,key:string,nonce:()=>string};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createResetHandler(deps:Dependencies){return async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply(405,{error:'POST required'});
 try{
  const token=req.headers.get('Authorization');if(!token)return reply(401,{error:'Sign in first'});
  const actor=deps.createClient(deps.url,deps.anon,{global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false}});
  const identity=await actor.auth.getUser();if(identity.error||!identity.data?.user)return reply(401,{error:'Session expired. Sign in again.'});
  const allowed=await actor.rpc('is_admin');if(allowed.error||allowed.data!==true)return reply(403,{error:'Administrator access required'});
  let input;try{input=await req.json()}catch{return reply(400,{error:'Invalid request'})}
  const id=input?.user_id,password=input?.temporary_password;
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||typeof password!=='string'||password.length<12||password.length>128||password.trim().length<12)return reply(400,{error:'Choose a staff member and a temporary password of 12–128 characters.'});
  if(id===identity.data.user.id)return reply(400,{error:'Use Change my password for your own account.'});
  const service=deps.createClient(deps.url,deps.key,{auth:{persistSession:false,autoRefreshToken:false}});
  const nonce=deps.nonce(),params={p_target:id,p_actor:identity.data.user.id,p_nonce:nonce};
  const start=await service.rpc('restaurant_password_reset153',{...params,p_action:'begin'});
  if(start.error||start.data!==true)return reply(409,{error:start.error?.message||'Password reset could not start.'});
  // The database guard prevents this Auth update from clearing must_change_password.
  const changed=await service.auth.admin.updateUserById(id,{password});
  if(changed.error||changed.data?.user?.id!==id){
   // Explicit validation rejection cannot have committed. Unknown/network failures keep the guard.
   if(changed.error?.status>=400&&changed.error.status<500)await service.rpc('restaurant_password_reset153',{...params,p_action:'failed'});
   return reply(400,{error:changed.error?.status>=400&&changed.error.status<500?'The temporary password was rejected. Choose another password and retry.':'The reset could not be verified. Wait two minutes, then retry. Do not share this password yet.'});
  }
  const finished=await service.rpc('restaurant_password_reset153',{...params,p_action:'complete'});
  if(finished.error||finished.data!==true)return reply(500,{error:'The password changed but setup did not finish. Wait two minutes and set a new temporary password before sharing it.'});
  return reply(200,{user_id:id,reset:true,must_change_password:true});
 }catch{return reply(500,{error:'The reset could not be verified. Check the connection and retry after two minutes. Do not share this password yet.'})}
};}
