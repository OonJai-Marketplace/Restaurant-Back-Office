// Only the customer's current-sale view crosses the LAN. No account tokens,
// database access, transaction commands, or payment credentials are accepted.
const encoder=new TextEncoder(),decoder=new TextDecoder();
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function decode(s){if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid link');return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
export const randomKey=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
export const nonce=()=>encode(crypto.getRandomValues(new Uint8Array(18)));
export function localIPv4(host){const p=String(host).split('.').map(Number);return /^\d+\.\d+\.\d+\.\d+$/.test(host)&&p.length===4&&p.every(v=>Number.isInteger(v)&&v>=0&&v<=255)&&(p[0]===10||p[0]===192&&p[1]===168||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===169&&p[1]===254);}
export function pairing(value){
 const p=typeof value==='string'?JSON.parse(value):value;
 if(!['oonjai-display/1','oonjai-kitchen/1'].includes(p?.protocol)||!localIPv4(p.host)||!Number.isInteger(p.port)||p.port<1024||p.port>65535||decode(p.key).length!==32)throw Error('This is not an Oon Jai device pairing code.');
 if(p.protocol==='oonjai-kitchen/1' && (typeof p.stream!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(p.stream)))throw Error('Invalid main POS identity.');
 return {protocol:p.protocol,host:p.host,port:p.port,key:p.key,...(p.protocol==='oonjai-kitchen/1'?{stream:p.stream}:{})};
}
async function key(secret){const raw=decode(secret);if(raw.length!==32)throw Error('Invalid key');return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);}
export async function seal(secret,data,direction){
 const iv=crypto.getRandomValues(new Uint8Array(12)),plain=encoder.encode(JSON.stringify(data));if(plain.length>60000)throw Error('Display message is too large');
 const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('oonjai-display/1/'+direction)},await key(secret),plain);
 return JSON.stringify({v:1,iv:encode(iv),body:encode(bytes)});
}
export async function unseal(secret,wire,direction){
 if(typeof wire!=='string'||wire.length>100000)throw Error('Invalid display message');
 const e=JSON.parse(wire);if(e.v!==1||decode(e.iv).length!==12)throw Error('Invalid display message');
 return JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(e.iv),additionalData:encoder.encode('oonjai-display/1/'+direction)},await key(secret),decode(e.body))));
}
const text=v=>String(v??'').slice(0,200);
const number=v=>Number.isFinite(Number(v))?Math.max(-1e12,Math.min(1e12,Number(v))):0;
export function saleView(draft,calculation){
 const d=draft?.data;if(!d||!Array.isArray(d.lines))return {lines:[],subtotal:0,discount:0,total:0,currency:'LAK'};
 return {lines:d.lines.slice(0,150).map(l=>({name:text(l.name),quantity:number(l.quantity),amount:number(l.unitPrice)*number(l.quantity),options:(Array.isArray(l.options)?l.options:[]).slice(0,12).map(text)})),subtotal:number(calculation?.subtotal),discount:number(calculation?.discount),total:number(calculation?.total),currency:'LAK'};
}
export function receivedView(v){
 if(!v||v.currency!=='LAK'||!Array.isArray(v.lines)||v.lines.length>150)throw Error('Invalid sale display');
 return {lines:v.lines.map(l=>({name:text(l.name),quantity:number(l.quantity),amount:number(l.amount),options:(Array.isArray(l.options)?l.options:[]).slice(0,12).map(text)})),subtotal:number(v.subtotal),discount:number(v.discount),total:number(v.total),currency:'LAK'};
}
