/* Accounting final-v118 / TeamHome14227 tablet navigation, restaurant adapter.
   Touch tablets use a drawer in portrait and landscape. The navigation trigger
   stays in the active area's tab row instead of a separate empty header. */
(()=>{'use strict';
const $=id=>document.getElementById(id);let button,queued=false,lastTablet;
function tablet(){return (navigator.maxTouchPoints>1||matchMedia('(pointer:coarse)').matches)&&Math.min(screen.width,screen.height)>=600}
function aria(){const open=document.body.classList.contains('restaurant-nav-open');for(const id of ['mobileMenuToggle','tabletMenu118'])$(id)?.setAttribute('aria-expanded',String(open));const drawer=tablet()||innerWidth<=1024,sidebar=$('appSidebar');if(sidebar){sidebar.inert=drawer&&!open;sidebar.setAttribute('aria-hidden',String(drawer&&!open))}}
function sync(){queued=false;const yes=tablet();if(yes!==lastTablet){lastTablet=yes;document.body.classList.toggle('tablet118',yes);closeMobileNavigation()}document.body.classList.toggle('tablet-portrait117',yes&&innerHeight>innerWidth);aria();if(!button)return;
 const hidden=!yes||!liveProfile||$('restaurantApp').hidden;if(button.hidden!==hidden)button.hidden=hidden;
 if(!yes){if(button.parentElement!==document.body)document.body.append(button);return}
 const active=document.querySelector('.tab-content.active');let target;
 if(active?.id==='pos118')target=active.querySelector('.pos-main-tabs118');
 else if(active?.id==='restaurant-settings')target=active.querySelector('.settings-tabs121');
 else if(active?.id==='restaurant-overview'){
  target=active.querySelector('.restaurant-home-tabs124');if(!target){target=document.createElement('nav');target.className='restaurant-home-tabs124';target.setAttribute('aria-label','Restaurant sections');const tab=document.createElement('button');tab.type='button';tab.className='active';tab.textContent='Overview';tab.setAttribute('aria-current','page');tab.onclick=()=>switchTab('restaurant-overview');target.append(tab);active.prepend(target)}
 }else target=$('categoryTabShell');
 if(target&&button.parentElement!==target)target.prepend(button);
 const logo=$('companyLogo101')?.src||'assets/brand/oonjai-logo.png';if(button.firstChild.src!==logo)button.firstChild.src=logo;
}
function queue(){if(!queued){queued=true;requestAnimationFrame(sync)}}
function ready(){button=document.createElement('button');button.id='tabletMenu118';button.type='button';button.className='restaurant-tablet-nav124';button.setAttribute('aria-label','Open main navigation');button.setAttribute('aria-controls','appSidebar');button.setAttribute('aria-expanded','false');const logo=document.createElement('img');logo.alt='';button.append(logo);button.onclick=e=>{e.stopPropagation();toggleMobileNavigation();aria()};document.body.append(button);$('mobileMenuToggle')?.setAttribute('aria-controls','appSidebar');
 const toggle=window.toggleMobileNavigation,close=window.closeMobileNavigation;window.toggleMobileNavigation=()=>{toggle();aria()};window.closeMobileNavigation=()=>{close();aria()};
 $('appSidebar').addEventListener('click',e=>{if(e.target.closest('.nav-header,.tab-btn'))closeMobileNavigation()});
 window.addEventListener('resize',queue);window.addEventListener('orientationchange',queue);window.visualViewport?.addEventListener('resize',queue);
 new MutationObserver(queue).observe($('restaurantApp'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','src']});sync();
}
window.restaurantAccounting124={sync,tablet};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
