/* Invalidate derived views after acknowledged writes; no record data crosses tabs. */
(()=>{'use strict';
 const scopes=new Set(['catalog','stock','sales','website','orders','config','shifts','kitchen']);let channel;
 function apply(list,source){
  if(!liveProfile)return;
  const changes=new Set(list.filter(x=>scopes.has(x)));if(!changes.size)return;
  const catalog=changes.has('catalog'),stock=changes.has('stock');
  if((catalog||stock)&&source!=='catalog'){
   window.menuStore108?.cancelLoad?.();const s=window.menuStore108?.state;if(s){s.loaded=false;s.ledgerLoaded144=false;}
  }
  if(catalog||stock){window.restaurantIntegration132?.invalidatePlan?.();if(window.restaurantIntegration132?.state)restaurantIntegration132.state.loaded=false;}
  if(catalog||stock||changes.has('kitchen'))window.kitchen124?.invalidate?.(changes);
  if(catalog&&window.pos118?.state)pos118.state.catalogVersion125=null;
  if(source!=='pos'&&(catalog||stock||['orders','config','shifts','sales'].some(scope=>changes.has(scope))))window.posPerformance125?.invalidate?.(catalog);
  if(changes.has('sales')||changes.has('shifts')){window.pos118?.clearReport?.();window.restaurantPosReports156?.invalidate()}
  if(changes.has('sales'))window.restaurantHome139?.invalidate?.();
  if(catalog||stock||changes.has('sales'))window.restaurantSales143?.invalidate?.();
  if(catalog||stock||changes.has('website')||changes.has('config')||changes.has('sales')||changes.has('shifts'))window.restaurantReadiness144?.invalidate?.();
 }
 function changed(list,source=''){
  const clean=Array.isArray(list)?list.filter(x=>scopes.has(x)):[];
  apply(clean,source);try{channel?.postMessage({scopes:clean})}catch{}
 }
 try{channel=new BroadcastChannel('oonjai-restaurant-data144');channel.onmessage=e=>{if(Array.isArray(e.data?.scopes))apply(e.data.scopes,'remote')}}catch{}
 window.restaurantData144={changed};
})();
