const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('scripts/restaurant-backoffice.js','utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
function setup({restore,signIn,reset,connectError}={}){
 const timers=new Map();let serial=0,callback,signs=0,resets=0,hydrated=0;
 const submit={disabled:true},forgot={disabled:true},error={textContent:''},status={textContent:''};
 const form={email:{value:'test@example.invalid',reportValidity:()=>true},password:{value:'password'},querySelector:()=>submit};
 const nodes={restaurantLogin:form,forgotPassword121:forgot,loginError:error,loginStatus140:status};
 const client={auth:{onAuthStateChange:fn=>{callback=fn},getSession:()=>restore||Promise.resolve({data:{session:null}}),signInWithPassword:()=>{signs++;return signIn||Promise.resolve({data:{session:{user:{id:'one'}}}})},resetPasswordForEmail:()=>{resets++;return reset||Promise.resolve({})}}};
 const c={Promise,Error,URL,URLSearchParams,history:{replaceState(){}},location:{hash:'',search:''},document:{getElementById:id=>nodes[id]},supabase:{},OJM_SUPABASE_URL:'https://fixture.invalid',liveProfile:null,restaurantAuth123:{connect:async()=>{if(connectError)throw Error('Connection unavailable');return client}},loginProgress132:m=>{c.overlay=!!m},hydrate:async()=>{hydrated++},clearRestaurantSession(){},passwordForm121:async()=>true,recoveryUrl121:()=> 'https://fixture.invalid/',setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id)};c.window=c;
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function loginWait140'),source.indexOf('async function restaurantReady')),c);
 return{c,form,submit,forgot,error,status,timers,counts:()=>({signs,resets,hydrated}),callback:()=>callback,expire:async ms=>{for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn()}await flush()}};
}
let checks=0;async function test(name,fn){await fn();console.log('PASS',name);checks++}
(async()=>{
 await test('Both controls work while saved-session restoration is unresolved',async()=>{const restore=deferred(),t=setup({restore:restore.promise});const startup=t.c.startRestaurantLogin140();assert.equal(t.submit.disabled,false);assert.equal(t.forgot.disabled,false);assert.equal(t.c.overlay,false);await t.forgot.onclick();assert.equal(t.counts().resets,1);assert.match(t.status.textContent,/recovery link/);restore.resolve({data:{session:null}});await startup;assert.match(t.status.textContent,/recovery link/)});
 await test('Sign-in reaches authentication and opens the authorized workspace',async()=>{const t=setup();await t.c.startRestaurantLogin140();await t.form.onsubmit({preventDefault(){}});assert.deepEqual(t.counts(),{signs:1,resets:0,hydrated:1});assert.equal(t.submit.disabled,false);assert.equal(t.c.overlay,false)});
 await test('Invalid credentials return a visible error and unlock both controls',async()=>{const t=setup({signIn:Promise.resolve({error:Error('Invalid login credentials')})});await t.c.startRestaurantLogin140();await t.form.onsubmit({preventDefault(){}});assert.equal(t.error.textContent,'Invalid login credentials');assert.equal(t.submit.disabled,false);assert.equal(t.forgot.disabled,false);assert.equal(t.counts().hydrated,0)});
 await test('A stalled saved session times out without covering or locking login',async()=>{const t=setup({restore:new Promise(()=>{})});const p=t.c.startRestaurantLogin140();await flush();await t.expire(15000);await p;assert.match(t.error.textContent,/could not be restored/);assert.equal(t.submit.disabled,false);assert.equal(t.forgot.disabled,false);assert.equal(t.c.overlay,false)});
 await test('A stalled sign-in unlocks and ignores late automatic sign-in callbacks',async()=>{const t=setup({signIn:new Promise(()=>{})});await t.c.startRestaurantLogin140();const p=t.form.onsubmit({preventDefault(){}});await flush();await t.expire(15000);await p;assert.match(t.error.textContent,/taking too long/);assert.equal(t.submit.disabled,false);assert.equal(t.c.overlay,false);t.callback()('SIGNED_IN',{user:{id:'late'}});await t.expire(0);assert.equal(t.counts().hydrated,0)});
 await test('A stalled password reset unlocks both controls with a visible error',async()=>{const t=setup({reset:new Promise(()=>{})});await t.c.startRestaurantLogin140();const p=t.forgot.onclick();await flush();await t.expire(15000);await p;assert.match(t.error.textContent,/taking too long/);assert.equal(t.submit.disabled,false);assert.equal(t.forgot.disabled,false)});
 await test('Client initialization failure remains recoverable from either button',async()=>{const t=setup({connectError:true});await t.c.startRestaurantLogin140();assert.equal(t.error.textContent,'Connection unavailable');assert.equal(t.submit.disabled,false);await t.form.onsubmit({preventDefault(){}});assert.equal(t.submit.disabled,false);await t.forgot.onclick();assert.equal(t.forgot.disabled,false)});
 await test('An older saved-session result never overwrites an explicit sign-in',async()=>{const restore=deferred(),t=setup({restore:restore.promise});const startup=t.c.startRestaurantLogin140();await t.form.onsubmit({preventDefault(){}});restore.resolve({data:{session:{user:{id:'old'}}}});await startup;assert.equal(t.counts().hydrated,1)});
 await test('Recovery uses the session from the email even when no recovery event is delivered',async()=>{
  const session={access_token:'email-session',user:{id:'one'}},t=setup({restore:Promise.resolve({data:{session}})});
  t.c.location={href:'https://fixture.invalid/?password-recovery=1',search:'?password-recovery=1',hash:'#type=recovery&access_token=email-session'};
  const save=deferred();let shown=0;
  t.c.passwordForm121=async(required,id)=>{assert.ok(required);assert.equal(id,'one');shown++;return save.promise};
  const startup=t.c.startRestaurantLogin140();await new Promise(resolve=>setImmediate(resolve));assert.equal(shown,1,t.error.textContent);
  t.callback()('PASSWORD_RECOVERY',session);await t.expire(0);
  assert.equal(shown,1);assert.equal(t.counts().hydrated,0);
  save.resolve(true);await startup;assert.equal(t.counts().hydrated,1);
 });
 await test('Expired, incomplete, and mismatched links cannot select an existing account',async()=>{
  for(const hash of ['', '#error=access_denied&error_code=otp_expired', '#access_token=different&type=recovery']){
   const t=setup({restore:Promise.resolve({data:{session:{access_token:'existing',user:{id:'other'}}}})});
   t.c.location={href:'https://fixture.invalid/?password-recovery=1',search:'?password-recovery=1',hash};
   t.c.passwordForm121=()=>assert.fail('Unexpected password dialog');
   await t.c.startRestaurantLogin140();
   assert.equal(t.counts().hydrated,0);assert.match(t.error.textContent,/new link/);
   await t.forgot.onclick();assert.equal(t.counts().resets,1);
  }
 });
 console.log('COMPLETE',checks);
})().catch(e=>{console.error(e);process.exit(1)});
