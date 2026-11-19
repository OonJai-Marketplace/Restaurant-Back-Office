const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');

(async () => {
 const dom = new JSDOM('<body></body>', {runScripts:'outside-only'});
 const w = dom.window, doc = w.document;
 try {
  for (const file of ['pos-money','pos-shifts']) w.eval(fs.readFileSync('scripts/'+file+'.js','utf8'));
  const shift = {id:'internal-id',opened_at:'2026-11-15T02:00:00Z',opening_cash:{LAK:3000,USD:0,THB:0},cashier:'sample'};
  const state = {sample:true,shifts:[shift],orders:[],cash:[]};
  let printed,submit;
  const hooks = {state,esc:String,owner:()=>'sample',paperWidth:()=>58,status(){},render(){},
   dialog(title,body,onSubmit){
    const root=doc.createElement('div');
    root.innerHTML='<section class="pos-dialog118"><header><h3>'+title+'</h3><button data-close aria-label="Close dialog">×</button></header>'+body+'</section>';
    root.resolve108=()=>root.remove();root.querySelector('[data-close]').onclick=root.resolve108;
    doc.body.append(root);if(onSubmit)submit=onSubmit;return root;
   },
   runPrintButton:(button,job)=>job(),printPaper:(width,title,html)=>{printed={width,title,html}}
  };
  await w.posShifts.open('close',hooks);
  const form=doc.querySelector('form');
  const matrix=()=>form.querySelector('table[aria-label="Cash reconciliation"]');
  const columns=()=>Array.from(matrix().tHead.rows[0].cells,x=>x.textContent);
  const input=(currency,value)=>{
   const el=form.querySelector('[data-cash-count="'+currency+'"]');el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));
  };
  const preview=()=>{
   form.querySelector('[data-review-shift]').click();return doc.querySelector('.pos-shift-receipt');
  };
  assert.deepEqual(columns(),['Currency','LAK']);
  assert.deepEqual(Array.from(matrix().tBodies[0].rows,row=>row.cells[0].textContent),['Expected','Actual count','Difference']);
  assert.equal(form.querySelector('[data-variance]').textContent,'—');assert(!form.checkValidity());
  let paper=preview();paper.querySelector('.shift-print-action').click();assert.equal(printed.title,'Shift review');
  assert.match(printed.html,/SAMPLE26-SA001/);assert.doesNotMatch(printed.html,/internal-id|USD|THB/);paper.querySelector('[data-close]').click();
  input('LAK','2900');assert.equal(form.querySelector('[data-variance="LAK"]').textContent,'-100.00');
  state.cash.push({shift_id:shift.id,currency:'USD',amount:10},{shift_id:shift.id,currency:'USD',amount:-10});
  await form.querySelector('[data-refresh-shift]').onclick({currentTarget:form.querySelector('[data-refresh-shift]')});
  assert.deepEqual(columns(),['Currency','LAK','USD']);assert.equal(w.posMoney.value(form.querySelector('[data-cash-count="LAK"]')),2900);
  input('USD','0');assert.equal(form.querySelector('[data-variance="USD"]').textContent,'0.00');
  const more=form.querySelector('[data-include-cash]');more.value='THB';more.dispatchEvent(new w.Event('change'));
  input('THB','2');assert.equal(form.querySelector('[data-variance="THB"]').textContent,'+2.00');
  assert(form.checkValidity());await submit();paper=doc.querySelector('.pos-shift-receipt');
  assert.equal(paper.querySelector('.shift-print-action').textContent,'Print receipt');paper.querySelector('.shift-print-action').click();
  assert.match(printed.html,/SAMPLE26-SA001/);assert.match(printed.html,/THB/);assert.match(printed.html,/\+2\.00/);
  const snapshot=state.shifts[0].closing_report;assert.equal(snapshot.cash.find(c=>c.currency==='LAK').variance,-100);
  const cleanState={...state,sample:true,shifts:[{...shift,closed_at:null}],cash:[]};await w.posShifts.open('close',{...hooks,state:cleanState});
  const amt=doc.querySelector('form [data-cash-count="LAK"]');amt.value='3000';await submit();
  assert.equal(cleanState.shifts[0].closing_report.cash.find(c=>c.currency==='THB').counted,0);
  console.log('PASS shift counts, hidden zeros, unexpected cash, refresh, safe close, readable ID and both print actions');
 } finally {dom.window.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
