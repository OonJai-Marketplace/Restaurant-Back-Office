const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');let count=0;
const check=async(name,fn)=>{await fn();console.log('PASS',name);count++};
class Node{
 constructor(tag='div',id='',classes=''){this.tagName=tag;this.id=id;this.children=[];this.attributes={};this.dataset={};this.hidden=false;this._html='';this.textContent='';this.classes=new Set(classes.split(' ').filter(Boolean));this.classList={contains:x=>this.classes.has(x),add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),toggle:(x,on)=>{on=on??!this.classes.has(x);on?this.classes.add(x):this.classes.delete(x);return on}};}
 set innerHTML(v){this._html=v;this.children=[]}get innerHTML(){return this._html}
 setAttribute(k,v){this.attributes[k]=v;if(k==='hidden')this.hidden=true}getAttribute(k){return this.attributes[k]??null}removeAttribute(k){delete this.attributes[k]}
 append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n)}}prepend(n){n.parentElement=this;this.children.unshift(n)}replaceChildren(...nodes){this.children=[];this.append(...nodes)}
 querySelector(s){return this.querySelectorAll(s)[0]||null}querySelectorAll(s){if(s==='iframe')return this.children.filter(n=>n.tagName==='iframe');if(s==='.nav-header')return this.children.filter(n=>n.classes.has('nav-header'));if(s==='.tab-btn:not([hidden])')return this.children.filter(n=>n.classes.has('tab-btn')&&!n.hidden);return []}
 addEventListener(){}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this)}
}
function setup(){
 const nodes=new Map(),tabs=[],categories=[],buttons=[],inserted=[],events={};
 const make=(id,classes='')=>{const n=new Node('div',id,classes);nodes.set(id,n);return n};
 for(const id of ['restaurantApp','loginGate','loginError','restaurantOverviewGrid','mainHeaderTitle','categoryTabShell','categoryTabs','restaurantSettings121','restaurantSearch121'])make(id);
 const scroll=make('workspace-scroll');
 for(const [id,module] of [['restaurant-overview','dashboard'],['restaurant-no-access','dashboard'],['restaurant-website','website'],['restaurant-settings','settings'],['inv-items','inventory'],['inv-preparation124','inventory'],['menu-recipe','menu'],['pos118','pos']]){const n=make(id,'tab-content');n.dataset.module=module;tabs.push(n);scroll.append(n)}
 for(const [scope,route] of [['dashboard','restaurant-overview'],['inventory','inv-items'],['menu','menu-recipe'],['pos','pos118'],['website','restaurant-website'],['settings','restaurant-settings'],['online','pos118']]){
  const cat=make('nav-module-'+scope,'nav-category');cat.dataset.module=scope;categories.push(cat);
  const head=new Node('button','','nav-header');head.setAttribute('onclick',`switchTab('${route}')`);head.textContent=scope;cat.append(head);
  if(['inventory','menu'].includes(scope))for(const [id,label] of scope==='inventory'?[['inv-items','Master List'],['inv-preparation124','Preparation & Costs']]:[['menu-recipe','Recipes']]){const b=new Node('button','','tab-btn');b.setAttribute('onclick',`switchTab('${id}')`);b.textContent=label;cat.append(b);buttons.push(b)}
 }
 const body=new Node('body');body.append=(...ns)=>{inserted.push(...ns);ns.forEach(n=>{n.parentElement=body})};
 const doc={readyState:'loading',baseURI:'https://example.test/Restaurant/',body,createElement:t=>new Node(t),createTextNode:t=>({textContent:t}),getElementById:id=>nodes.get(id),addEventListener:(n,fn)=>{events[n]=fn},
 querySelector(s){if(s==='.workspace-scroll')return scroll;if(s==='.tab-content.active')return tabs.find(n=>n.classes.has('active'))||null;const m=s.match(/^#nav-module-([a-z]+) \.nav-header$/);if(m)return nodes.get('nav-module-'+m[1])?.children[0];return null},
 querySelectorAll(s){if(s==='.workspace-scroll>.tab-content')return tabs;if(s==='#appSidebar .tab-btn')return buttons;if(s==='#appSidebar .nav-category')return categories;if(s==='#appSidebar .nav-category:not([hidden]) button:not([hidden])')return categories.filter(n=>!n.hidden).flatMap(n=>n.children.filter(b=>!b.hidden));return []}};
 const storage=new Map(),c={console,document:doc,URL,URLSearchParams,Date,Intl,Promise,Set,Map,Error,Number,JSON,Object,location:{protocol:'https:',hostname:'example.test',search:'',href:'https://example.test/Restaurant/'},navigator:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout,clearTimeout,requestAnimationFrame:()=>{},MutationObserver:class{observe(){}},addEventListener(){}};c.window=c;vm.createContext(c);
 for(const file of ['restaurant-backoffice.js','restaurant-permissions125.js','workspace-config123.js','workspace-links123.js'])vm.runInContext(fs.readFileSync(root+'/scripts/'+file,'utf8'),c);
 vm.runInContext('banner=()=>{};showCenterStatus=()=>{};renderSettings121=()=>{};',c);
 const role=(permissions={},admin=false,status='active')=>vm.runInContext(`liveProfile=${JSON.stringify({id:'user',full_name:'Test',role:admin?'admin':'submitter',status})};restaurantMember=${JSON.stringify({enabled:true,must_change_password:false,permissions})};`,c);
 return {c,nodes,tabs,categories,buttons,inserted,storage,role,run:s=>vm.runInContext(s,c)};
}
(async()=>{
 const f=setup(),{c,role,run,nodes}=f;
 await check('Visitors cannot open any private route or load staff modules',async()=>{
  for(const id of ['restaurant-overview','restaurant-website','pos118','inv-preparation124','restaurant-settings'])assert.equal(c.restaurantRouteAllowed128(id),false);
  vm.runInContext(fs.readFileSync(root+'/scripts/restaurant-modules125.js','utf8'),c);assert.equal(c.switchTab('pos118'),false);assert.equal(f.inserted.length,0);
 });
 await check('Cashiers see only their assigned POS area and cannot restore a hidden workspace',async()=>{
  role({pos:{view:true,sell:true,tabs:{'pos-sales-new':true}}});run('syncNav121()');
  assert.deepEqual(f.categories.filter(x=>!x.hidden).map(x=>x.dataset.module),['pos']);assert.equal(c.restaurantStart125(),'pos118');
  for(const id of ['restaurant-overview','restaurant-website','menu-recipe','inv-items','restaurant-settings','made-up-id'])assert.equal(c.switchTab(id),false);
  assert.equal(f.inserted.length,0);
 });
 await check('Kitchen-only grants expose just assigned kitchen tabs',async()=>{
  role({inventory:{view:true,prepare:true,tabs:{'inv-preparation124':true}}});run('syncNav121()');
  assert.deepEqual(f.categories.filter(x=>!x.hidden).map(x=>x.dataset.module),['inventory']);assert.equal(c.restaurantStart125(),'inv-preparation124');
  assert.equal(c.restaurantRouteAllowed128('inv-items'),false);assert.equal(c.restaurantRouteAllowed128('inv-preparation124'),true);
  assert.equal(f.buttons.find(x=>x.textContent==='Master List').hidden,true);
 });
 await check('Empty, null, string-valued and unknown grants fail closed',async()=>{
  for(const tabs of [{},null,{'pos-sales-new':'true'},{'unknown':true}]){role({pos:{view:true,sell:true,tabs}});assert.equal(c.restaurantRouteAllowed128('pos118'),false);assert.equal(c.restaurantStart125(),'restaurant-no-access')}
  role({pos:{view:'true',sell:true,tabs:{'pos-sales-new':true}}});assert.equal(c.restaurantRouteAllowed128('pos118'),false);
 });
 await check('Inactive accounts cannot navigate even with administrator role',async()=>{role({},true,'inactive');assert.equal(c.restaurantRouteAllowed128('restaurant-website'),false);assert.equal(c.restaurantCan('pos'),false)});
 await check('Administrator Website view embeds the actual complete public document once',async()=>{
  role({},true);assert.equal(c.restaurantWorkspace123.publicSite(),true);
  const frame=nodes.get('restaurant-website').querySelector('iframe');assert(frame);assert.equal(frame.src,'https://example.test/Restaurant/public-restaurant/');
  assert.equal(frame.title,'Oon Jai public website');assert.equal(frame.src,c.OJM_RESTAURANT_APPS.public);
  c.restaurantWorkspace123.publicSite();assert.equal(nodes.get('restaurant-website').querySelector('iframe'),frame);
 });
 await check('POS entry paths stay live even with an obsolete saved sample preference',async()=>{
  role({},true);assert.equal(c.restaurantPosMode128(),'live');c.location.search='?workspace=pos';assert.equal(c.restaurantPosMode128(),'live');
  f.storage.set('ojm_pos_mode119_user','sample');assert.equal(c.restaurantPosMode128(),'live');c.location.search='';assert.equal(c.restaurantPosMode128(),'live');
  role({pos:{view:true,tabs:{'pos-sales-new':true}}});assert.equal(c.restaurantPosMode128(),'live');
  c.localStorage.getItem=()=>{throw Error('Storage unavailable')};role({},true);assert.equal(c.restaurantPosMode128(),'live');
 });
 await check('Search excludes hidden tabs even when their module is visible',async()=>{
  role({inventory:{view:true,tabs:{'inv-preparation124':true}}});run('syncNav121()');run('startRestaurantLogin140=async()=>{}');await run('restaurantReady()');
  const parent=new Node();nodes.get('restaurantSearch121').parentElement=parent;nodes.get('restaurantSearch121').oninput({target:{value:'master',parentElement:parent}});
  assert.equal(parent.children.at(-1).children.length,0);
 });
 await check('Public page contains no staff navigation or password form',async()=>{
  const html=fs.readFileSync(root+'/public-restaurant/index.html','utf8');assert(!/type=["']password|restaurantLogin|switchTab\('pos118'\)|workspaceApps122/.test(html));
  assert(html.includes("window.self!==window.top"));assert(html.includes("link.target=window.self!==window.top?'_blank':'_self'"));
 });
 console.log('COMPLETE',count);
})().catch(e=>{console.error(e);process.exit(1)});
