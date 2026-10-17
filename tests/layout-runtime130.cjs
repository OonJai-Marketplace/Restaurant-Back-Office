const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../scripts/restaurant-accounting124.js'),'utf8');let checks=0;
class Element{
 constructor(id=''){this.id=id;this.attrs={};this.children=[];this.events={};this.hidden=false;this.classes=new Set();this.classList={contains:n=>this.classes.has(n),toggle:(n,on)=>on?this.classes.add(n):this.classes.delete(n)};this.textContent='';}
 setAttribute(k,v){this.attrs[k]=String(v)}getAttribute(k){return this.attrs[k]??null}hasAttribute(k){return k in this.attrs}removeAttribute(k){delete this.attrs[k]}
 addEventListener(k,f){this.events[k]=f}focus(){document.activeElement=this}getClientRects(){return [1]}contains(n){return n===this||this.children.includes(n)}
 querySelectorAll(s){if(s==='button')return this.children;if(s==='table')return this.tables||[];if(s.startsWith('button:'))return this.children;return []}
 querySelector(s){return s==='button.active'?this.children.find(b=>b.classes.has('active')):null}
 scrollIntoView(){this.scrolls=(this.scrolls||0)+1}closest(s){if(s.includes('restaurant-table-scroll130'))return this.parentElement?.className==='restaurant-table-scroll130'?this.parentElement:null;return null}
 before(n){this.wrapper=n}append(n){this.children.push(n);n.parentElement=this}
}
const ids=Object.fromEntries(['restaurantApp','appSidebar','mobileMenuToggle','closeNavigation130','categoryTabs'].map(x=>[x,new Element(x)]));
const active=new Element('inv-items'),table=new Element('table'),button=new Element('active-tab');button.textContent='Master List';button.classes.add('active');ids.categoryTabs.children=[button];active.tables=[table];
const body=new Element('body'),events={};const document={body,readyState:'complete',activeElement:null,getElementById:id=>ids[id],querySelector:s=>s==='.tab-content.active'?active:null,querySelectorAll:()=>[],createElement:()=>new Element(),addEventListener:(k,f)=>events[k]=f};
ids.appSidebar.children=[ids.closeNavigation130,new Element('last-link')];
const c={document,navigator:{maxTouchPoints:0},screen:{width:1440,height:900},innerWidth:1440,innerHeight:900,matchMedia:()=>({matches:false}),liveProfile:{id:'fixture'},requestAnimationFrame:()=>{},MutationObserver:class{observe(){}},addEventListener(){},toggleMobileNavigation(){body.classList.toggle('restaurant-nav-open',!body.classes.has('restaurant-nav-open'))},closeMobileNavigation(){body.classList.toggle('restaurant-nav-open',false)}};c.window=c;vm.createContext(c);vm.runInContext(source,c);
function check(name,fn){fn();checks++;console.log('PASS',name)}
check('Desktop sidebar is reachable without making duplicate navigation',()=>{assert.equal(ids.appSidebar.inert,false);assert.equal(ids.mobileMenuToggle.getAttribute('aria-controls'),'appSidebar');assert(!ids.tabletMenu118)});
check('Wide tables receive exactly one keyboard-accessible scroll region',()=>{assert.equal(table.parentElement.className,'restaurant-table-scroll130');assert.equal(table.parentElement.tabIndex,0);const wrapper=table.parentElement;c.restaurantAccounting124.sync();assert.equal(table.parentElement,wrapper)});
check('Active tab is exposed and only scrolled after navigation changes',()=>{assert.equal(button.getAttribute('aria-current'),'page');assert.equal(button.scrolls,1);c.restaurantAccounting124.sync();assert.equal(button.scrolls,1)});
check('Phone drawer is hidden from keyboard navigation when closed',()=>{c.innerWidth=390;c.restaurantAccounting124.sync();assert.equal(ids.appSidebar.inert,true);assert.equal(ids.appSidebar.getAttribute('aria-hidden'),'true')});
check('Opening drawer focuses its close control and traps Tab inside it',()=>{c.toggleMobileNavigation();assert.equal(document.activeElement,ids.closeNavigation130);assert.equal(ids.appSidebar.inert,false);let prevented=false;document.activeElement=ids.appSidebar.children.at(-1);events.keydown({key:'Tab',shiftKey:false,preventDefault(){prevented=true}});assert(prevented);assert.equal(document.activeElement,ids.closeNavigation130)});
check('Closing drawer restores focus to the persistent menu button',()=>{c.closeMobileNavigation();assert.equal(document.activeElement,ids.mobileMenuToggle);assert.equal(ids.mobileMenuToggle.getAttribute('aria-expanded'),'false');assert.equal(ids.appSidebar.inert,true)});
check('Landscape touch tablet keeps drawer behavior above the desktop breakpoint',()=>{c.navigator.maxTouchPoints=5;c.screen={width:1194,height:834};c.innerWidth=1194;c.innerHeight=834;c.restaurantAccounting124.sync();assert(body.classes.has('tablet118'));assert.equal(ids.appSidebar.inert,true)});
check('Returning to desktop restores access to the sidebar',()=>{c.navigator.maxTouchPoints=0;c.restaurantAccounting124.sync();assert.equal(ids.appSidebar.inert,false);assert.equal(ids.appSidebar.getAttribute('aria-hidden'),'false')});
check('Repeated header synchronization performs no redundant visibility or badge writes',()=>{
 let writes=0;const nodes={};for(const id of ['restaurantApp','workspaceTools108','switchAccount110','posFullscreen122','headerNoticeBadge104','upcomingBell101']){let hide=false,text='';nodes[id]={get hidden(){return hide},set hidden(v){writes++;hide=v},get textContent(){return text},set textContent(v){writes++;text=v},setAttribute(){}}}
 const shell=fs.readFileSync(path.join(__dirname,'../scripts/restaurant-shell122.js'),'utf8');
 const context={queued:false,focus:false,liveProfile:{role:'admin'},$:id=>nodes[id],document:{querySelector:()=>null,querySelectorAll:()=>[]},notices:()=>[],restaurantTabCan125:()=>true};vm.createContext(context);
 vm.runInContext(shell.slice(shell.indexOf('function hidden('),shell.indexOf('function queue(')),context);context.sync();writes=0;context.sync();assert.equal(writes,0);
});
console.log('COMPLETE',checks);
