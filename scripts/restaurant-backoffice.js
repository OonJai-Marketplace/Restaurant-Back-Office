/* Restaurant workspace with independent authentication and data. */
let liveProfile=null,liveProfiles=[],ojmDb=null;
const APP_PERMISSION_TREE=[];
const restaurantAreas={kitchen:['Kitchen','Preparation, shared recipes and wastage.','assets/banners/inventory.png'],restaurant:['Restaurant Overview','Good food. Greater purpose.','assets/banners/menu.png'],inventory:['Inventory','Know what is on hand. Plan what comes next.','assets/banners/inventory.png'],menu:['Menu','Thoughtful recipes. Consistent quality.','assets/banners/menu.png'],pos:['Point of Sale','Good food, made your way.','assets/banners/menu.png'],online:['Online Orders','Every order, clearly recorded.','assets/banners/menu.png'],website:['Public Website','',''],settings:['Settings','A thoughtful setup makes everyday work easier.','assets/banners/settings.png']};
window.shell113={areas:restaurantAreas,esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])),admin:()=>liveProfile?.role==='admin'};
window.access113={renderRecipe:root=>root.innerHTML='<section class="panel113"><h3>Administrator access required</h3></section>',loadRecipe:async()=>{}};
window.armNewForm108=()=>{};
function escapeHtml(v){return shell113.esc(v)}
function showCenterStatus(message,error=false){let n=document.getElementById('restaurantToast');if(!n){n=document.createElement('div');n.id='restaurantToast';n.setAttribute('role','status');document.body.append(n)}n.replaceChildren(document.createTextNode(String(message||'')));n.classList.toggle('error',error);n.hidden=!message;clearTimeout(showCenterStatus.timer);if(message&&String(message).length>85){const close=document.createElement('button');close.textContent='Close';close.onclick=()=>n.hidden=true;n.append(close)}else if(message)showCenterStatus.timer=setTimeout(()=>n.hidden=true,error?8000:4500)}
window.status118={pending:m=>showCenterStatus(m),done:m=>showCenterStatus(m),error:m=>showCenterStatus(m,true)};
window.ui108={modal:(title,body,buttons=[{label:'Close',value:false}],wide=false)=>new Promise(resolve=>{let overlay=document.createElement('div');overlay.className='ui-overlay108 restaurant-modal';overlay.innerHTML=`<section class="ui-dialog108 restaurant-dialog ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><header><h3>${escapeHtml(title)}</h3><button type="button" aria-label="Close dialog" data-close>×</button></header><div class="ui-body108 restaurant-dialog-body">${body}</div><footer></footer></section>`;const done=value=>{overlay.remove();resolve(value)};overlay.resolve108=done;overlay.querySelector('[data-close]').onclick=()=>done(false);buttons.filter(b=>b.label!=='Close').forEach(b=>{let button=document.createElement('button');button.type='button';button.textContent=b.label;button.className=b.danger?'danger':'';button.onclick=()=>done(b.value);overlay.querySelector('footer').append(button)});overlay.onclick=e=>{if(e.target===overlay)done(false)};document.body.append(overlay)}),esc:escapeHtml};
ui108.confirm=(title,message)=>ui108.modal(title,`<p>${escapeHtml(message)}</p>`,[{label:'Cancel',value:false},{label:'Delete',value:true,danger:true}]);
window.ui117={confirm:message=>ui108.modal('Please confirm',`<p>${escapeHtml(message)}</p>`,[{label:'Cancel',value:false},{label:'Confirm',value:true}]),prompt:async(message,value='')=>{const answer=window.prompt(message,value);return answer===null?null:answer}};
// Restaurant v121. Permissions and presentation live separately from Accounting.
let bannerRows={},restaurantMember=null,restaurantMembers=[],restaurantSetup=false,settingsTab121='branding',sessionEpoch121=0;
const permissionOptions121={inventory:{view:'View inventory',edit:'Add / edit items',stock_in:'Record stock in',stock_out:'Record stock out',adjust:'Adjust / reverse stock',delete:'Delete unused items'},menu:{view:'View menu, recipes and costs',edit:'Add / edit recipes, ingredients and prices',sales:'Record engineering sales',delete:'Delete unused records'},pos:{view:'View POS, orders and reports',sell:'Orders, payments and shifts',void:'Cancel unpaid orders',refund:'Refund paid orders',manage:'Payment and printer settings'},settings:{view:'View Settings',appearance:'Change logo and theme'}};
function restaurantCan(scope,action='view'){
 if(!liveProfile||liveProfile.status!=='active')return false;
 if(isAdmin121())return true;
 const p=restaurantMember?.permissions?.[scope];
 if(!restaurantMember?.enabled||restaurantMember.must_change_password||p?.view!==true||p?.[action]!==true)return false;
 return p.tabs===undefined||Object.keys(window.restaurantTabs125?.[scope]||{}).some(tab=>p.tabs?.[tab]===true);
}
window.restaurantCan=restaurantCan;
function catalogCan121(kind,action='edit',data={}){if(kind==='moves')return restaurantCan('inventory',data.kind==='in'?'stock_in':data.kind==='out'?'stock_out':'adjust');return restaurantCan(kind==='items'?'inventory':'menu',kind==='sales'&&action==='edit'?'sales':action)}
window.catalogCan121=catalogCan121;
const isAdmin121=()=>liveProfile?.role==='admin';
const scopes121=id=>id.startsWith('inv-')?'inventory':id.startsWith('menu-')?'menu':id==='pos118'?'pos':id==='restaurant-settings'?'settings':id==='restaurant-website'?'website':'restaurant';
function imageUrl121(v,fallback=''){return /^(data:image\/(png|jpeg|webp);base64,|assets\/)/.test(v||'')?v:fallback}
// Compatibility hook for POS renders; decorative banners have been retired.
window.restaurantBannerForPos=()=>{};
async function loadBanners(){if(!ojmDb||!liveProfile)return;const owner=liveProfile.id,epoch=sessionEpoch121;const r=await ojmDb.from('restaurant_presentation121').select('area,data');if(owner!==liveProfile?.id||epoch!==sessionEpoch121)return;if(r.error){restaurantSetup=false;return}restaurantSetup=true;bannerRows=Object.fromEntries((r.data||[]).map(x=>[x.area,x.data]));applyBrand121()}
function applyBrand121(){const d=bannerRows.brand||{},colors={Ivory:'#fffaf1',Gold:'#e6bc6a',Green:'#17553e',Brown:'#694b34'};document.querySelectorAll('.restaurant-brand-logo').forEach(img=>{img.src=imageUrl121(d.image,window.restaurantLogo139||'assets/brand/oonjai-logo.png?v=139');img.style.backgroundColor=colors[d.background]||colors.Ivory});document.body.classList.remove('restaurant-dark121');window.restaurantShell122?.brand()}
async function savePresentation121(area,data){if(!restaurantCan('settings','appearance'))throw Error('Appearance access required.');const r=await ojmDb.from('restaurant_presentation121').upsert({area,data,updated_by:liveProfile.id,updated_at:new Date().toISOString()});if(r.error)throw Error(r.error.message);bannerRows[area]=data;applyBrand121()}
async function resizeImage121(file,max=1600){if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a PNG, JPEG or WebP under 10 MB.');let bitmap;try{if(window.createImageBitmap)bitmap=await createImageBitmap(file)}catch{}if(!bitmap){const url=URL.createObjectURL(file);try{bitmap=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This image could not be opened. Choose another PNG, JPEG or WebP.'));img.src=url})}finally{URL.revokeObjectURL(url)}}const c=document.createElement('canvas'),scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close?.();const image=c.toDataURL('image/webp',.85);return image.startsWith('data:image/webp')?image:c.toDataURL('image/jpeg',.85)}
function overview(){window.restaurantHome139?.render()}
function syncNav121(){
 document.querySelectorAll('#appSidebar .tab-btn').forEach(b=>{const id=(b.getAttribute('onclick')||'').match(/'([^']+)'/)?.[1];if(id)b.hidden=!restaurantRouteAllowed128(id)});
 for(const scope of ['inventory','menu','kitchen']){const group=document.getElementById('nav-module-'+scope),first=group?.querySelector('.tab-btn:not([hidden])');if(first)group.querySelector('.nav-header').setAttribute('onclick',first.getAttribute('onclick'));if(group)group.hidden=!first;}
 document.querySelectorAll('#appSidebar .nav-category').forEach(n=>{const s=n.dataset.module;if(['inventory','menu','kitchen'].includes(s))return;n.hidden=s==='dashboard'||s==='website'?!isAdmin121():!restaurantFirstTab125(s)});
}
function switchTab(id){if(!liveProfile)return false;const scope=scopes121(id),navScope=['inv-bulk132','inv-preparation124','inv-waste124'].includes(id)?'kitchen':scope;if(!restaurantRouteAllowed128(id)){showCenterStatus('You do not have access to this section.',true);return false}const target=document.getElementById(id);if(!target)return false;document.querySelectorAll('.workspace-scroll>.tab-content').forEach(el=>el.classList.toggle('active',el===target));document.querySelectorAll('#appSidebar .tab-btn').forEach(el=>el.classList.toggle('active',(el.getAttribute('onclick')||'').includes("'"+id+"'")));document.querySelectorAll('#appSidebar .nav-category').forEach(n=>n.classList.toggle('module-active121',n.dataset.module===(scope==='restaurant'?'dashboard':navScope)));document.getElementById('mainHeaderTitle').textContent=navScope==='kitchen'?'Kitchen':restaurantAreas[scope]?.[0]||'Restaurant';const group=document.getElementById('nav-module-'+navScope);document.getElementById('categoryTabShell').hidden=['pos','restaurant','settings','website'].includes(scope);document.getElementById('categoryTabs').innerHTML=group&&scope!=='pos'?[...group.querySelectorAll('.tab-btn:not([hidden])')].map(el=>`<button class="category-tab ${el.classList.contains('active')?'active':''}" onclick="${el.getAttribute('onclick')}">${escapeHtml(el.textContent)}</button>`).join(''):'';if(id==='restaurant-overview')overview();if(id==='restaurant-website')restaurantWorkspace123.renderWebsite();if(id==='restaurant-no-access')target.innerHTML='<section class="restaurant-card"><h2>No workspace assigned</h2><p>Ask your administrator to enable your work area. You can change your password from your account menu or sign out.</p></section>';if(id==='restaurant-settings')renderSettings121();document.querySelector('.workspace-scroll').scrollTop=0;closeMobileNavigation();try{localStorage.setItem('restaurant-location121:'+liveProfile.id,JSON.stringify({id,at:Date.now()}))}catch{}return true}
async function openOnlineOrders(){if(!restaurantTabCan125('pos','pos-sales-online'))return;await switchTab('pos118');if(window.pos118){pos118.state.tab='Sales';pos118.state.sub='Online Orders';pos118.render()}}
async function openPosManagement(){if(!restaurantTabCan125('pos','pos-management','manage'))return showCenterStatus('POS settings access required.',true);await switchTab('pos118');if(window.pos118){pos118.state.tab='Management';pos118.render()}}
function toggleMobileNavigation(){document.body.classList.toggle('restaurant-nav-open')}
function closeMobileNavigation(){document.body.classList.remove('restaurant-nav-open')}
function clearRestaurantSession(){hydration132=null;window.menuStore108?.cancelLoad?.();window.kitchen124?.cancelLoad?.();window.restaurantHome139?.reset();sessionEpoch121++;window.restaurantIntegration132?.reset();loginProgress132('');liveProfile=null;liveProfiles=[];restaurantMember=null;restaurantMembers=[];bannerRows={};window.resetMenuSales121?.();if(window.pos118)Object.assign(pos118.state,{busy:false,working:false,offline:false,syncError:'',loaded:false,owner:null,modeChosen:false,sample:false,schema125:false,balances125:null,catalogVersion125:null,summary125:null,receiptDate:null,acknowledged125:[],menu:[],ingredients:[],items:[],moves:[],stock:[],orders:[],shifts:[],cash:[],offlineQueue:[]});document.querySelectorAll('.restaurant-modal,.im-edit-overlay112').forEach(x=>x.remove());if(window.menuStore108)Object.assign(menuStore108.state,{owner:null,loaded:false,editing:null,items:[],moves:[],menu:[],ingredients:[],categories:[]});document.getElementById('restaurantSettings121')?.replaceChildren();document.getElementById('restaurantOverviewGrid')?.replaceChildren();document.getElementById('restaurantApp').hidden=true;document.getElementById('loginGate').hidden=false;document.getElementById('loginGate').classList.remove('is-authenticated');document.querySelectorAll('.workspace-scroll>.tab-content:not(#restaurant-settings):not(#restaurant-overview)').forEach(x=>x.innerHTML='');}
async function logoutDemoUser(){clearRestaurantSession();if(ojmDb)await ojmDb.auth.signOut()}
function passwordForm121(required=false){return new Promise(resolve=>{const overlay=document.createElement('div');overlay.className='restaurant-modal';overlay.innerHTML=`<section class="restaurant-dialog"><header><h3>${required?'Set your new password':'Change password'}</h3></header><form class="restaurant-dialog-body"><p>${required?'Replace your temporary password before entering the restaurant.':'This password is used for your Restaurant sign-in.'}</p><label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" required></label><label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="12" required></label><p role="alert"></p><footer><button type="button">${required?'Sign out':'Cancel'}</button><button type="submit">Save password</button></footer></form></section>`;const close=()=>{overlay.remove();resolve(false);if(required)logoutDemoUser()};overlay.querySelector('[type=button]').onclick=close;if(!required)overlay.onclick=e=>{if(e.target===overlay)close()};overlay.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('[type=submit]');if(f.password.value!==f.confirm.value){f.querySelector('[role=alert]').textContent='Passwords do not match.';return}b.disabled=true;try{const r=await ojmDb.auth.updateUser({password:f.password.value});if(r.error)throw r.error;overlay.remove();resolve(true);showCenterStatus('Password changed.')}catch(err){f.querySelector('[role=alert]').textContent=err.message}finally{b.disabled=false}};document.body.append(overlay)})}
async function hydrateCore132(session){if(!session?.user){clearRestaurantSession();return}if(liveProfile?.id===session.user.id)return;const epoch=++sessionEpoch121;const [profile,member]=await loginWait140(Promise.all([ojmDb.from('profiles').select('*').eq('id',session.user.id).maybeSingle(),ojmDb.from('restaurant_members121').select('*').eq('user_id',session.user.id).maybeSingle()]),'Account verification took too long. Please sign in to retry.');if(epoch!==sessionEpoch121)return;if(profile.error||!profile.data){document.getElementById('loginError').textContent=profile.error?.message||'No user profile is available.';return}if(profile.data.status!=='active'){clearRestaurantSession();document.getElementById('loginError').textContent='This user account is inactive.';return}liveProfile=profile.data;restaurantMember=member.data;if(!isAdmin121()&&(!restaurantMember?.enabled||member.error)){liveProfile=null;document.getElementById('loginError').textContent='Restaurant access has not been enabled. Ask your administrator.';return}if(!isAdmin121()&&restaurantMember.must_change_password){loginProgress132('');const ok=await passwordForm121(true);if(!ok||epoch!==sessionEpoch121)return;loginProgress132('');const r=await loginWait140(ojmDb.from('restaurant_members121').select('*').eq('user_id',session.user.id).single(),'Account verification took too long. Please sign in to retry.');if(epoch!==sessionEpoch121)return;restaurantMember=r.data;if(!restaurantMember||restaurantMember.must_change_password){clearRestaurantSession();document.getElementById('loginError').textContent='Password updated. Sign in again; contact your administrator if access is still blocked.';return}}
 liveProfiles=[liveProfile];document.getElementById('currentUserChip').textContent=liveProfile.full_name||session.user.email;document.getElementById('sidebarUserRole').textContent=isAdmin121()?'Administrator':'Restaurant team';document.getElementById('headerAccountInitials').textContent=(liveProfile.full_name||'OJ').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();if(epoch!==sessionEpoch121)return;syncNav121();let id=restaurantStart125();try{const last=JSON.parse(localStorage.getItem('restaurant-location121:'+liveProfile.id));if(last&&Date.now()-last.at<7*3600000&&restaurantRouteAllowed128(last.id))id=last.id}catch{}
 const requested={pos:'pos118',kitchen:'inv-preparation124',website:'restaurant-website'}[new URLSearchParams(location.search).get('workspace')];if(requested&&restaurantRouteAllowed128(requested))id=requested;
 // Authorization is complete. Close login before downloading modules or records.
 document.getElementById('loginGate').hidden=true;document.getElementById('loginGate').classList.add('is-authenticated');document.getElementById('restaurantApp').hidden=false;loginProgress132('');
 void openRestaurantWorkspace142(id,liveProfile.id,epoch);
 // Branding is optional presentation data; it must never delay sign-in.
 void loginWait140(loadBanners(),'Branding request timed out.').catch(()=>{});
}
async function openRestaurantWorkspace142(id,owner,epoch){
 const current=()=>liveProfile?.id===owner&&sessionEpoch121===epoch;
 try{
  if(!current())return;
  // The module router shows its own local loading message and handles navigation cancellation.
  const opened=await switchTab(id);if(!opened||!current())return;
  const group=restaurantModules125.groupFor(id);
  if(['inventory','menu'].includes(group))await menuStore108.load();
  if(group==='kitchen')await kitchen124.load();
  if(group==='pos'&&!pos118.state.sample)await pos118.load();
  if(current()&&(id==='inv-bulk132'||id==='menu-integration132'))await restaurantIntegration132.load();
 }catch(error){if(current())showCenterStatus(error.message||'This area could not load. Open it again to retry.',true)}
}
let hydration132=null;
function loginProgress132(message){const box=document.getElementById('restaurantLoading132');if(!box)return;box.hidden=!message;if(message)box.querySelector('p').textContent=message;}
function hydrate(session){
 if(hydration132?.id===session?.user?.id)return hydration132.promise;
 const job={id:session?.user?.id,promise:null};hydration132=job;loginProgress132('');
 job.promise=hydrateCore132(session).catch(e=>{if(hydration132!==job)return;clearRestaurantSession();document.getElementById('loginError').textContent=e.message||'Your workspace could not load. Sign in to retry.';}).finally(()=>{if(hydration132===job){hydration132=null;loginProgress132('');}});return job.promise;
}
function permissionForm121(p={}){return Object.entries(permissionOptions121).map(([scope,actions])=>`<fieldset><legend>${scope==='pos'?'Point of Sale & Online Orders':scope[0].toUpperCase()+scope.slice(1)}</legend>${Object.entries(actions).map(([a,label])=>`<label class="check121"><input type="checkbox" name="${scope}.${a}" ${p[scope]?.[a]?'checked':''}>${label}</label>`).join('')}</fieldset>`).join('')}
function recoveryUrl121(){const u=new URL(window.OJM_PUBLIC_APP_URL||location.href);if(!['https:','http:'].includes(u.protocol))throw Error('Open the hosted restaurant site to request a password reset.');u.hash='';u.search='';u.searchParams.set('password-recovery','1');return u.href}
function actionPermission121(el){if(window.restaurantPosAction125&&el.dataset.pos118&&!restaurantPosAction125(el))return false;if(el.dataset.imAction){const a=el.dataset.imAction,id=el.dataset.imId;if(a==='import-online')return isAdmin121();if(a==='delete')return catalogCan121(id.split('|')[0],'delete');if(a==='reverse-move')return restaurantTabCan125('inventory','inv-adj','adjust');if(a==='new-move')return catalogCan121('moves','edit',{kind:id});if(/^(new|edit)-(item|ingredient|category|menu|bundle)$/.test(a))return catalogCan121(a.endsWith('item')?'items':a.endsWith('ingredient')?'ingredients':a.endsWith('category')?'categories':'menu');if(a==='toggle-menu')return restaurantTabCan125('menu','menu-avail','edit')}
 if(el.dataset.m108){const a=el.dataset.m108;if(['sales','import'].includes(a))return restaurantTabCan125('menu','menu-engineering108','sales');if(a==='delete-sale')return restaurantTabCan125('menu','menu-engineering108','delete')}
 if(el.dataset.pos118){const a=el.dataset.pos118;if(['refund'].includes(a))return restaurantCan('pos','refund');if(a==='cancel')return restaurantCan('pos','void');if(['settings'].includes(a))return restaurantCan('pos','manage');if(['options','links','seed'].includes(a))return isAdmin121();if(['save','charge','add','quick-add','new','resume','remove','qty','edit-line','open-shift','close-shift','cash'].includes(a))return restaurantCan('pos','sell')}
 return true}
function decorate121(){document.querySelectorAll('[data-im-action],[data-m108],[data-pos118]').forEach(b=>{if(!actionPermission121(b)){b.disabled=true;b.title='Not included in your access';b.dataset.denied121='true'}});document.querySelectorAll('.im-title104>h2,.im-title104>p').forEach(n=>n.hidden=true)}
// Attach controls before any session or network work. A stalled restore must not lock the form.
function loginWait140(work,message,ms=15000){let timer;return Promise.race([Promise.resolve(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms)})]).finally(()=>clearTimeout(timer))}
let loginConnection140=null,loginRecovery140=false,loginAutomatic140=true,loginAction140=0;
function loginStatus140(message){const node=document.getElementById('loginStatus140');if(node)node.textContent=message}
async function connectLogin140(){
 if(loginConnection140)return loginConnection140;
 loginConnection140=(async()=>{
  if(!window.supabase||!window.OJM_SUPABASE_URL)throw Error('Sign-in could not start. Reload this page to try again.');
  loginRecovery140=location.hash.includes('type=recovery')||new URLSearchParams(location.search).get('type')==='recovery';
  const client=await restaurantAuth123.connect({recovery:loginRecovery140});ojmDb=client;
  client.auth.onAuthStateChange((event,session)=>{
   if(event==='SIGNED_OUT')clearRestaurantSession();
   if(event==='PASSWORD_RECOVERY'){loginRecovery140=true;setTimeout(async()=>{loginProgress132('');if(await passwordForm121(true)){loginRecovery140=false;await hydrate(session)}},0)}
   else if(event==='SIGNED_IN'&&session&&!loginRecovery140)setTimeout(()=>{if(!loginAutomatic140&&!liveProfile)return;if(liveProfile&&liveProfile.id!==session.user.id)clearRestaurantSession();hydrate(session)},0);
  });
  return client;
 })().catch(error=>{loginConnection140=null;throw error});
 return loginConnection140;
}
async function startRestaurantLogin140(){
 const form=document.getElementById('restaurantLogin'),submit=form.querySelector('[type=submit]'),forgot=document.getElementById('forgotPassword121'),error=document.getElementById('loginError');
 let busy=false;
 const controls=value=>{busy=value;submit.disabled=value;forgot.disabled=value};
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;loginAction140++;loginAutomatic140=true;controls(true);error.textContent='';loginStatus140('');loginProgress132('');
  try{const client=await loginWait140(connectLogin140(),'Sign-in could not start. Please reload and try again.');
   const result=await loginWait140(client.auth.signInWithPassword({email:form.email.value.trim(),password:form.password.value}),'Sign-in is taking too long. Check your connection and try again.');
   if(result.error)throw result.error;form.password.value='';await hydrate(result.data.session);
  }catch(err){loginAutomatic140=false;error.textContent=err.message||'Sign-in failed. Please try again.'}
  finally{controls(false);loginProgress132('')}
 };
 forgot.onclick=async()=>{
  if(busy||!form.email.reportValidity())return;loginAction140++;loginAutomatic140=false;controls(true);error.textContent='';loginStatus140('Requesting a password reset…');
  try{const client=await loginWait140(connectLogin140(),'Password reset could not start. Please reload and try again.');
   const result=await loginWait140(client.auth.resetPasswordForEmail(form.email.value.trim(),{redirectTo:recoveryUrl121()}),'Password reset is taking too long. Check your connection and try again.');
   if(result.error)throw result.error;loginStatus140('If this email has an account, a recovery link will be sent.');
  }catch(err){loginStatus140('');error.textContent=err.message||'Password reset failed. Please try again.'}
  finally{controls(false)}
 };
 controls(false);loginProgress132('');loginStatus140('');const action=loginAction140;
 try{const current=await loginWait140(connectLogin140().then(client=>client.auth.getSession()),'Saved sign-in could not be restored. You can sign in below.');
  if(action!==loginAction140)return;if(current.error)throw current.error;loginStatus140('');if(current.data?.session&&!loginRecovery140)await hydrate(current.data.session);
 }catch(err){if(action===loginAction140){loginAutomatic140=false;error.textContent=err.message}}
 finally{if(action===loginAction140)loginStatus140('')}
}
async function restaurantReady(){document.addEventListener('click',e=>{const b=e.target.closest('[data-im-action],[data-m108],[data-pos118]');if(b&&!actionPermission121(b)){e.preventDefault();e.stopImmediatePropagation();showCenterStatus('This action is not included in your access.',true)}},true);let pending=false;new MutationObserver(rs=>{if(pending||!rs.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&!n.classList.contains('area-banner113'))))return;pending=true;requestAnimationFrame(()=>{pending=false;decorate121()})}).observe(document.querySelector('.workspace-scroll'),{childList:true,subtree:true});document.getElementById('restaurantSearch121').oninput=e=>{let box=document.getElementById('searchResults121');if(!box){box=document.createElement('div');box.id='searchResults121';e.target.parentElement.append(box)}const q=e.target.value.trim().toLowerCase();box.innerHTML='';if(!q)return;document.querySelectorAll('#appSidebar .nav-category:not([hidden]) button:not([hidden])').forEach(b=>{if(b.textContent.toLowerCase().includes(q)){const x=document.createElement('button');x.textContent=b.textContent;x.onclick=()=>{b.click();box.innerHTML='';e.target.value=''};box.append(x)}})};
 await startRestaurantLogin140();
 window.addEventListener('focus',async()=>{
  if(!liveProfile)return;const owner=liveProfile.id,epoch=sessionEpoch121;
  const [p,r]=await Promise.all([ojmDb.from('profiles').select('*').eq('id',owner).maybeSingle(),ojmDb.from('restaurant_members121').select('*').eq('user_id',owner).maybeSingle()]);
  if(p.error||r.error||owner!==liveProfile?.id||epoch!==sessionEpoch121)return;
  if(!p.data||p.data.status!=='active'||p.data.role!==liveProfile.role||(!isAdmin121()&&(!r.data?.enabled||r.data.must_change_password||JSON.stringify(r.data.permissions)!==JSON.stringify(restaurantMember?.permissions)))){
   await logoutDemoUser();document.getElementById('loginError').textContent='Your access changed. Sign in again to load your assigned workspace.';return;
  }
  liveProfile=p.data;restaurantMember=r.data;syncNav121();const id=document.querySelector('.tab-content.active')?.id||'',scope=scopes121(id);
  if(!restaurantRouteAllowed128(id))switchTab(restaurantStart125());else if(scope==='inventory'||scope==='menu')menuStore108.render?.();else if(scope==='pos')window.pos118?.render();else if(scope==='settings')window.renderSettings121?.();
 });overview()}
function startRestaurant140(){window.restaurantReady140=restaurantReady().catch(error=>{loginProgress132('');loginStatus140('');document.getElementById('loginError').textContent=error.message||'The restaurant could not start.';window.restaurantBootFailure140?.(error)});return window.restaurantReady140}
if(window.restaurantBootLoading126)document.addEventListener('restaurant:boot126',startRestaurant140,{once:true});else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startRestaurant140);else startRestaurant140();
