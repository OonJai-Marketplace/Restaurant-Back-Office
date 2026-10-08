// Deploy with: supabase functions deploy restaurant-users
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are server-side secrets.
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply(405,{error:'POST required'});
 try{
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token=req.headers.get('Authorization');if(!token)return reply(401,{error:'Sign in first'});
  const actor=createClient(url,anon,{global:{headers:{Authorization:token}},auth:{persistSession:false}});
  const identity=await actor.auth.getUser();if(identity.error||!identity.data.user)return reply(401,{error:'Session expired'});
  const admin=await actor.rpc('is_admin');if(admin.error||admin.data!==true)return reply(403,{error:'Administrator access required'});
  const input=await req.json(),email=String(input.email||'').trim().toLowerCase(),name=String(input.display_name||'').trim(),password=input.temporary_password;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>120||typeof password!=='string'||password.length<12||password.length>128)return reply(400,{error:'Enter a name, valid email and a temporary password of 12–128 characters'});
  const schema:Record<string,string[]>={inventory:['view','edit','stock_in','stock_out','adjust','delete'],menu:['view','edit','sales','delete'],pos:['view','sell','void','refund','manage'],settings:['view','appearance']};
  const permissions=Object.fromEntries(Object.entries(schema).map(([s,actions])=>[s,Object.fromEntries(actions.map(a=>[a,input.permissions?.[s]?.view===true&&input.permissions?.[s]?.[a]===true]))]));
  const service=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  // Auth rejects duplicates: never reset an existing accounting user's password here.
  const created=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name}});
  if(created.error||!created.data.user)return reply(400,{error:created.error?.message||'Could not create user'});
  const id=created.data.user.id;
  try{
   // Keep the established non-administrator role. Existing profiles are not edited.
   const found=await service.from('profiles').select('id').eq('id',id).maybeSingle();if(found.error)throw found.error;
   if(!found.data){const p=await service.from('profiles').insert({id,email,full_name:name,role:'submitter'});if(p.error)throw p.error;}
   const grant=await service.from('restaurant_members121').insert({user_id:id,email,display_name:name,enabled:input.enabled!==false,permissions,must_change_password:true});if(grant.error)throw grant.error;
  }catch(e){const cleanup=await service.auth.admin.deleteUser(id);return reply(500,{error:cleanup.error?'User created but access setup failed. Review this user in Supabase Auth before retrying.':'Access setup failed; account creation was rolled back. Check migration 07 and the profiles schema.'});}
  return reply(200,{user_id:id,created:true});
 }catch{return reply(500,{error:'Account creation failed. Check the server configuration.'});}
});
