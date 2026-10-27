/* Confirmed, retry-safe Word of Hope delivery. */
window.OonJaiHopePublic183=(()=>{'use strict';
 const key='oonjai_hope_draft183',endpoint='https://nhjsesfhapnjtwlxvirm.supabase.co/functions/v1/word-of-hope';
 let busy=false,draft=null;
 // Opaque-origin previews may omit randomUUID; getRandomValues stays secure.
 const uuid=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)};
 const load=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}};
 const save=(k,v)=>{try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v));}catch{}};
 function setup(){
  const form=document.getElementById('customForm'),message=form.querySelector('#message'),name=form.querySelector('#name'),consent=form.querySelector('#hopeConsent183'),status=document.getElementById('statusMsg'),counter=document.getElementById('wordCounter'),submit=document.getElementById('submitBtn');
  let device=load('oonjai_hope_device183');if(!device){device=uuid();save('oonjai_hope_device183',device);}
  draft=load(key);if(draft&&typeof draft.message==='string'){message.value=draft.message;name.value=draft.name||'';consent.checked=!!draft.consent;}
  const payload=()=>({message:message.value.trim(),name:name.value.trim(),consent:consent.checked});
  function keep(){const p=payload();if(!draft||JSON.stringify(p)!==JSON.stringify({message:draft.message,name:draft.name,consent:draft.consent}))draft={...p,id:uuid()};save(key,draft);counter.textContent=message.value.length+' / 1,500 characters';counter.style.color='#b9cbc2';return draft;}
  form.addEventListener('input',keep);keep();
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(busy||!form.reportValidity())return;const p=keep();if(p.message.length<10){status.style.color='#fca5a5';status.textContent='Please write at least 10 characters.';return;}
   busy=true;const controls=[...form.querySelectorAll('input,textarea,button')];controls.forEach(n=>n.disabled=true);status.style.color='#d5e4dc';status.textContent='Saving your message…';
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
   try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,action:'submit',device,website:form.querySelector('[name=website]').value}),signal:controller.signal});const data=await r.json();if(!r.ok||data.saved!==true)throw Error(data.error||'Could not confirm receipt.');
    save(key,null);draft=null;form.reset();counter.textContent='0 / 1,500 characters';status.style.color='#86efac';status.textContent='Thank you! Your message has been received for review. Reference: '+data.id;
   }catch(e){status.style.color='#fca5a5';status.textContent=(e.name==='AbortError'?'Confirmation is taking too long.':e.message)+' Your draft is kept. Retry to check the same submission without sending a duplicate.';}
   finally{clearTimeout(timer);busy=false;controls.forEach(n=>n.disabled=false);submit.disabled=false;}
  });
 }
 function clear(){if(busy)return;if(document.getElementById('message').value&&!confirm('Clear this message draft?'))return;document.getElementById('customForm').reset();draft=null;save(key,null);document.getElementById('wordCounter').textContent='0 / 1,500 characters';document.getElementById('statusMsg').textContent='';}
 return {setup,clear};
})();
