/* Show the actual public website, without a second copy or a staff session. */
(()=>{'use strict';
 function renderWebsite(){
  if(!isAdmin121())return false;
  const root=document.getElementById('restaurant-website');if(!root)return false;
  if(root.querySelector('iframe'))return true;
  const toolbar=document.createElement('nav');toolbar.className='restaurant-website-tools128';toolbar.setAttribute('aria-label','Website controls');
  const title=document.createElement('strong');title.textContent='Public Website';
  const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh website';
  const link=document.createElement('a');link.href=OJM_RESTAURANT_APPS.public;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open full website ↗';
  const frame=document.createElement('iframe');frame.title='Oon Jai public website';frame.className='restaurant-website-frame128';frame.src=OJM_RESTAURANT_APPS.public;frame.setAttribute('allow','clipboard-write; web-share');
  refresh.onclick=()=>{frame.src=OJM_RESTAURANT_APPS.public};toolbar.append(title,refresh,link);root.replaceChildren(toolbar,frame);return true;
 }
 window.restaurantWorkspace123={publicSite(){if(!isAdmin121())return false;return switchTab('restaurant-website')},renderWebsite};
})();
