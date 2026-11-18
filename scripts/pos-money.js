/* Live decimal entry without changing the amount or moving the caret to the end. */
(()=>{'use strict';
const raw=value=>String(value??'').replaceAll(',','').trim();
const value=input=>Number(raw(typeof input==='object'?input.value:input));
const display=(amount,precision=2)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:precision}).format(Number(amount)||0);
function edit(text,caret,precision=2){
 const input=raw(text),position=raw(text.slice(0,caret)).length;
 if(!input||input==='-')return {text:input,caret:position};
 if(!/^-?\d*(?:\.\d*)?$/.test(input))return {text,caret};
 const [whole,part='']=input.split('.');if(part.length>precision)return {text,caret};
 const integer=whole==='-'?'-0':whole||'0';
 const formatted=integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+part.padEnd(2,'0');
 let at=0,seen=0,target=position+(whole===''||whole==='-'?1:0);
 while(at<formatted.length&&seen<target){if(formatted[at]!==',')seen++;at++}
 return {text:formatted,caret:at};
}
function bind(root){
 for(const input of root.querySelectorAll('input[data-pos-money]')){
  if(input.dataset.moneyBound)continue;input.dataset.moneyBound='1';
  const precision=Number(input.dataset.posMoney)||2;
  function validate(){const v=raw(input.value),number=Number(v);const valid=!v||new RegExp('^-?\\d+(?:\\.\\d{0,'+precision+'})?$').test(v)&&Number.isFinite(number)&&(!input.hasAttribute('min')||number>=Number(input.min))&&(!input.hasAttribute('max')||number<=Number(input.max));input.setCustomValidity(valid?'':'Enter a valid amount with up to '+precision+' decimal places.');}
  input.addEventListener('beforeinput',e=>{if(e.data==='.'&&input.selectionStart===input.selectionEnd&&input.value.includes('.')){e.preventDefault();const at=input.value.indexOf('.')+1;input.setSelectionRange(at,at)}});
  input.addEventListener('input',()=>{const result=edit(input.value,input.selectionStart??input.value.length,precision);input.value=result.text;input.setSelectionRange(result.caret,result.caret);validate()});
  input.addEventListener('focus',()=>{if(input.value&&value(input)===0)input.select()});
  input.addEventListener('blur',()=>{if(input.value&&input.validity.valid)input.value=display(value(input),precision);validate()});
  if(input.value&&Number.isFinite(value(input)))input.value=display(value(input),precision);validate();
 }
}
function formData(form){const data=Object.fromEntries(new FormData(form));for(const input of form.querySelectorAll('input[data-pos-money][name]'))data[input.name]=raw(input.value);return data}
window.posMoney={raw,value,display,edit,bind,formData};
})();
