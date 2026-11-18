const assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path');
(async()=>{
 const {createResetHandler}=await import(pathToFileURL(path.resolve('supabase/functions/restaurant-password-reset/handler.ts')));
 const actor='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222';
 function setup(opts={}){
  const calls=[];
  const actorClient={auth:{getUser:async()=>({data:{user:opts.expired?null:{id:actor}}})},rpc:async()=>({data:opts.admin!==false})};
  const service={
   rpc:async(name,p)=>{calls.push(p.p_action);return opts.block&&p.p_action==='begin'?{error:{message:'Choose a restaurant staff account'}}:opts.finishError&&p.p_action==='complete'?{error:{message:'failed'}}:{data:true}},
   auth:{admin:{updateUserById:async(id,data)=>{calls.push('auth');assert.equal(id,target);assert.deepEqual(Object.keys(data),['password']);return opts.authError?{error:opts.authError}:{data:{user:{id}}}}}}
  };
  const handler=createResetHandler({url:'fixture',anon:'public',key:'server',nonce:()=> 'request',createClient:(url,key)=>key==='public'?actorClient:service});
  return{calls,request:async(body={},headers={Authorization:'Bearer fixture'})=>{
   const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers,body:JSON.stringify({user_id:target,temporary_password:'synthetic-only-123',...body})}));return{status:r.status,data:await r.json()};
  }};
 }
 let t=setup();assert.equal((await t.request({},{})).status,401);assert.equal(t.calls.length,0);
 t=setup({admin:false});assert.equal((await t.request()).status,403);assert.equal(t.calls.length,0);
 t=setup({expired:true});assert.equal((await t.request()).status,401);
 t=setup();assert.equal((await t.request({user_id:actor})).status,400);assert.equal(t.calls.length,0);
 t=setup();assert.equal((await t.request({temporary_password:'short'})).status,400);assert.equal(t.calls.length,0);
 t=setup({block:true});assert.equal((await t.request()).status,409);assert.deepEqual(t.calls,['begin']);
 t=setup();const result=await t.request();assert.equal(result.status,200);assert(result.data.must_change_password);assert(!JSON.stringify(result).includes('synthetic-only'));assert.deepEqual(t.calls,['begin','auth','complete']);
 t=setup({authError:{status:422}});assert.equal((await t.request()).status,400);assert.deepEqual(t.calls,['begin','auth','failed']);
 t=setup({authError:{status:0}});assert.equal((await t.request()).status,400);assert.deepEqual(t.calls,['begin','auth']);
 t=setup({finishError:true});assert.equal((await t.request()).status,500);assert.deepEqual(t.calls,['begin','auth','complete']);
 console.log('PASS server-only password reset, verified administrator, input validation, protected targets, guard ordering, failure recovery and no secret in response');
})().catch(e=>{console.error(e);process.exitCode=1});
