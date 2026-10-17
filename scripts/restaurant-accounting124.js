/* One navigation anchor for every workspace; no moving tablet-only controls. */
(()=>{'use strict';
const $=id=>document.getElementById(id);let queued=false,lastTablet,lastTab='';
function tablet(){return (navigator.maxTouchPoints>1||matchMedia('(pointer:coarse)').matches)&&Math.min(screen.width,screen.height)>=600}
function drawer(){return tablet()||innerWidth<=1024}
function aria(){const open=document.body.classList.contains('restaurant-nav-open'),sidebar=$('appSidebar');$('mobileMenuToggle')?.setAttribute('aria-expanded',String(open));if(sidebar){sidebar.inert=drawer()&&!open;sidebar.setAttribute('aria-hidden',String(drawer()&&!open))}}
function sync(){queued=false;const yes=tablet();if(yes!==lastTablet){lastTablet=yes;document.body.classList.toggle('tablet118',yes);closeMobileNavigation()}document.body.classList.toggle('tablet-portrait117',yes&&innerHeight>innerWidth);aria();
 const active=document.querySelector('.tab-content.active');if(!active||!liveProfile||$('restaurantApp').hidden)return;
 // Wide tables scroll within their own region, keeping filters and actions in view.
 for(const table of [...active.querySelectorAll('table'),...document.querySelectorAll('.restaurant-dialog table')]){
  if(table.closest('.im-scroll104,.table-container,.restaurant-table-scroll130,.receipt118'))continue;
  const region=document.createElement('div');region.className='restaurant-table-scroll130';region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label',(table.closest('section')?.querySelector('h2,h3')?.textContent||'Records')+' table');table.before(region);region.append(table);
 }
 const navs=[$('categoryTabs'),...active.querySelectorAll('.settings-tabs121,.pos-main-tabs118,.pos-subtabs118')];
 const key=active.id+':'+navs.map(n=>n?.querySelector('button.active')?.textContent||'').join(':');
 for(const nav of navs){if(!nav)continue;for(const b of nav.querySelectorAll('button')){if(b.classList.contains('active')){if(b.getAttribute('aria-current')!=='page')b.setAttribute('aria-current','page');if(key!==lastTab)b.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})}else if(b.hasAttribute('aria-current'))b.removeAttribute('aria-current')}}lastTab=key;
}
function queue(){if(!queued){queued=true;requestAnimationFrame(sync)}}
function ready(){const sidebar=$('appSidebar'),trigger=$('mobileMenuToggle');trigger?.setAttribute('aria-controls','appSidebar');
 const toggle=window.toggleMobileNavigation,close=window.closeMobileNavigation;
 window.toggleMobileNavigation=()=>{toggle();aria();if(drawer()&&document.body.classList.contains('restaurant-nav-open'))$('closeNavigation130')?.focus()};
 window.closeMobileNavigation=()=>{const restore=drawer()&&sidebar.contains(document.activeElement);close();aria();if(restore)trigger?.focus()};
 sidebar.addEventListener('click',e=>{if(e.target.closest('.nav-header,.tab-btn'))closeMobileNavigation()});
 document.addEventListener('keydown',e=>{if(e.key!=='Tab'||!drawer()||!document.body.classList.contains('restaurant-nav-open'))return;const items=[...sidebar.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]'));const first=items[0],last=items.at(-1);if(!first)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}});
 window.addEventListener('resize',queue);window.addEventListener('orientationchange',queue);
 new MutationObserver(queue).observe($('restaurantApp'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});new MutationObserver(queue).observe(document.body,{childList:true});sync();
}
window.restaurantAccounting124={sync,tablet};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
