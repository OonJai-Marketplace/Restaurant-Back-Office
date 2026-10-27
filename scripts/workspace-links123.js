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
  const frame=document.createElement('iframe');frame.title='Oon Jai public website';frame.className='restaurant-website-frame128';
  // An opaque origin prevents the customer preview from reading staff DOM,
  // browser storage or sessions. Never add allow-same-origin here.
  frame.setAttribute('sandbox','allow-scripts allow-forms allow-popups');
  frame.setAttribute('referrerpolicy','no-referrer');
  frame.src=OJM_RESTAURANT_APPS.public;
  const hint=document.createElement('span');hint.textContent='Isolated preview. Use Open full website for checkout and external links.';
  refresh.onclick=()=>{frame.src=OJM_RESTAURANT_APPS.public};const promote=document.createElement('button');promote.type='button';promote.textContent='Manage promotions';promote.onclick=()=>switchTab('restaurant-promotions');toolbar.append(title,promote,refresh,link,hint);root.replaceChildren(toolbar,frame);return true;
 }
 window.restaurantWorkspace123={publicSite(){if(!isAdmin121())return false;return switchTab('restaurant-website')},renderWebsite};
})();
