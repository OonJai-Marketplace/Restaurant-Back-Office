/* Public projection only. No authenticated sessions, private records or recipes. */
window.RestaurantPublic127=(()=>{'use strict';
 const categories=['burgers','sandwiches','texmex','pasta','bowl','smoothies','refreshers','wellness','bakery'];
 const safeImage=x=>typeof x==='string'&&(/^(https:\/\/[^\s<>"']+|assets\/images\/[a-zA-Z0-9._/-]+|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(x));
 function normalize(rows){
  if(!Array.isArray(rows))throw Error('Invalid public menu');
  const result=Object.fromEntries(categories.map(k=>[k,[]]));const ids=new Set();
  for(const r of rows){
   if(!r||!categories.includes(r.category)||!/^[-a-zA-Z0-9_]{1,60}$/.test(r.id)||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||!Number.isFinite(Number(r.price))||Number(r.price)<0||Number(r.price)>1e9)throw Error('Invalid public menu item');
   const o=r.options||{},custom={};
   if(o.isCustom===true){custom.isCustom=true;for(const k of ['maxSauces','maxVeggies','maxProteins']){if(!Number.isSafeInteger(o[k])||o[k]<0||o[k]>20)throw Error('Invalid custom menu choices');custom[k]=o[k];}if(o.specificProteins==='sandwichProteins')custom.specificProteins=o.specificProteins;if(o.needsWellnessChoice===true)custom.needsWellnessChoice=true;}
   ids.add(r.id);result[r.category].push({id:r.id,name:r.name.slice(0,150),desc:String(r.description||'').slice(0,3000),price:Number(r.price),images:(Array.isArray(r.images)?r.images:[]).filter(safeImage).slice(0,6),...custom});
  }
  return result;
 }
 function cached(){try{const c=JSON.parse(localStorage.getItem('oonjai_public127:'+window.OJM_SUPABASE_URL)||'null');if(c&&Number.isFinite(c.savedAt)&&Date.now()-c.savedAt>=0&&Date.now()-c.savedAt<86400000)return {menu:normalize(c.rows),page:c.page,stale:true};}catch{}return null;}
 async function load(){
  const base=window.OJM_SUPABASE_URL,key=window.OJM_SUPABASE_ANON_KEY;
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(base||'')||!key)return {stale:true};
  const cacheKey='oonjai_public127:'+base;let cached=null;
  try{cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(cached&&Date.now()-cached.savedAt>86400000)cached=null;}catch{}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
  try{
   const get=async path=>{const r=await fetch(base+'/rest/v1/'+path,{headers:{apikey:key},signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error('Public content unavailable');return r.json();};
   const [rows,content]=await Promise.all([get('storefront_items127?select=id,category,name,description,price,images,options,position&order=position.asc,id.asc&limit=1000'),get('storefront_content127?select=title,subtitle,intro_title,intro_text,announcement,phone,messenger&limit=1')]);
   const menu=normalize(rows),page=Array.isArray(content)?content[0]:null;
   try{localStorage.setItem(cacheKey,JSON.stringify({rows,page,savedAt:Date.now()}));}catch{}
   return {menu,page,stale:false};
  }catch{
   if(cached)try{return {menu:normalize(cached.rows),page:cached.page,stale:true};}catch{}
   return {stale:true};
  }finally{clearTimeout(timer);}
 }
 return {load,cached,normalize,safeImage};
})();
