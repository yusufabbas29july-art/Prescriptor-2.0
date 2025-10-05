/* script.js — Full replacement for Fit Clinic Rx composer
   - Rearranges RX entry so Medicine is very wide on its own row
   - Moves Dosage + Timings to the line below Medicine (consistent layout)
   - Robust autocomplete suggestions with absolute positioning under medName
   - Print helpers: ensures C/o, Observation, Investigation, Diagnosis and Rx table are included
   - Autosave, render preview, cart editing, keyboard ergonomics, accessibility
   - Branding modal + Excel export (SheetJS) integration
   - Defensive, commented, single-file
*/

/* ===========================
   Lightweight helpers
   =========================== */
const $ = (s, root = document) => (root || document).querySelector(s);
const $$ = (s, root = document) => Array.from((root || document).querySelectorAll(s));
const esc = s => String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
const uid = (p='id') => `${p}_${Math.random().toString(36).slice(2,9)}`;
const noop = () => {};
const debounce = (fn, ms=160) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

/* detect touch to adapt some interactions */
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

/* ===========================
   Suppress specific debug message (optional)
   =========================== */
(function suppressSpecificConsoleInfo(){
  try {
    const origInfo = console.info.bind(console);
    console.info = (...args) => {
      try {
        if(args && args.length && String(args[0]).includes('Cleaning complete. Use window.meds_10000_cleaned')) {
          return; // quiet noisy meds loader message
        }
      } catch(e){}
      origInfo(...args);
    };
  } catch(e){}
})();

/* ===========================
   DOM references (expected IDs/classes)
   =========================== */
/* patient & vitals */
const nameEl = $('#name');
const ageEl = $('#age');
const genderEl = $('#gender');
const phoneEl = $('#phone');
const patientIdEl = $('#patientId');
const dateEl = $('#date');

const bpEl = $('#bp'), pulseEl = $('#pulse'), rrEl = $('#rr'), tempEl = $('#temp'), spo2El = $('#spo2'), weightEl = $('#weight'), heightEl = $('#height'), bmiEl = $('#bmi'), gluEl = $('#glu');

/* rich text notes */
const coEl = $('#co'), obsEl = $('#observation'), investEl = $('#invest'), dxEl = $('#dx');

/* preview elements */
const pvDateEl = $('#pvDate'), pvNameEl = $('#pvName'), pvIdEl = $('#pvId'), pvVitalsEl = $('#pvVitals'), pvDetailsEl = $('#pvDetails'), pvCoEl = $('#pvCo'), pvObsEl = $('#pvObs'), pvInvestEl = $('#pvInvest'), pvDxEl = $('#pvDx'), pvTable = $('#pvTable tbody'), pvPrintedEl = $('#pvPrinted');

/* Rx / meds elements */
let medType = $('#medType'), medName = $('#medName'), medDosage = $('#medDosage'), medTimings = $('#medTimings'), medDays = $('#medDays'), medRemarks = $('#medRemarks'), addMedStructuredBtn = $('#addMedStructuredBtn');
let medSuggestions = $('#medSuggestions'), medTableBody = $('#medTableBody'), medCount = $('#medCount');

/* topbar / action buttons (exists in HTML) */
const saveDraftBtn = $('#saveDraft'), exportJsonBtn = $('#exportJson'), printAllBtn = $('#printAll'), downloadPdfBtn = $('#downloadPdf'), saveFinalBtn = $('#saveFinal'), newPatientBtn = $('#newPatient'), clearAllBtn = $('#clearAll'), clearMedCartBtn = $('#clearMedCart'), saveMedListBtn = $('#saveMedList');

/* defensive: if some elements missing create no-op placeholders */
function ensureEl(el, id){
  if(!el){
    const tmp = document.getElementById(id);
    return tmp || null;
  }
  return el;
}

/* re-assign just in case of earlier DOM differences */
medType = ensureEl(medType, 'medType');
medName = ensureEl(medName, 'medName');
medDosage = ensureEl(medDosage, 'medDosage');
medTimings = ensureEl(medTimings, 'medTimings');
medDays = ensureEl(medDays, 'medDays');
medRemarks = ensureEl(medRemarks, 'medRemarks');
addMedStructuredBtn = ensureEl(addMedStructuredBtn, 'addMedStructuredBtn');
medSuggestions = ensureEl(medSuggestions, 'medSuggestions');
medTableBody = ensureEl(medTableBody, 'medTableBody');
medCount = ensureEl(medCount, 'medCount');

/* state */
let cart = JSON.parse(localStorage.getItem('fit_cart') || '[]');
let patients = JSON.parse(localStorage.getItem('fit_patients') || '[]');

/* Branding state helper (persisted under fit_branding)
   shape: { clinicName, doctorName, contactLine, logoBase64 }
*/
const BRANDING_KEY = 'fit_branding';
function loadBrandingState(){ try { return JSON.parse(localStorage.getItem(BRANDING_KEY) || '{}') || {}; } catch(e){ return {}; } }
function saveBrandingState(b){ try{ localStorage.setItem(BRANDING_KEY, JSON.stringify(b)); }catch(e){} }
let branding = Object.assign({ clinicName: 'Hospital', doctorName: 'Dr Suneo Honekawa MBBS, MD', contactLine: '', logoBase64: '' }, loadBrandingState());

/* medicine dataset (fallback builtin small list; optionally window.meds_10000 may exist) */
const builtinMeds = [
  {name:'Amoxicillin',strength:'500 mg',form:'tab'},
  {name:'Paracetamol',strength:'500 mg',form:'tab'},
  {name:'Cetirizine',strength:'10 mg',form:'tab'},
  {name:'Metformin',strength:'500 mg',form:'tab'},
  {name:'Amlodipine',strength:'5 mg',form:'tab'},
  {name:'Omeprazole',strength:'20 mg',form:'cap'},
  {name:'Azithromycin',strength:'250 mg',form:'tab'},
  {name:'Salbutamol',strength:'2 mg',form:'inh'},
  {name:'Ibuprofen',strength:'400 mg',form:'tab'},
  {name:'Ranitidine',strength:'150 mg',form:'tab'}
];

let medList = [];
if(window && window.meds_10000 && Array.isArray(window.meds_10000) && window.meds_10000.length>0){
  medList = window.meds_10000.map(x => ({ name: x.name||'', strength: x.strength||'', form: x.form||'' }));
  console.info('Using window.meds_10000: count=', medList.length);
} else {
  medList = builtinMeds.slice();
}

/* ===========================
   DOM re-structure for Rx entry
   =========================== */
function restructureRxEntry(){
  try {
    const rxEntry = document.querySelector('.rx-entry') || (() => {
      const card = document.getElementById('card-rx') || document.querySelector('#card-rx');
      if(!card) return null;
      const wrapper = document.createElement('div'); wrapper.className = 'rx-entry';
      const row1 = card.querySelector('.rx-row1');
      const row2 = card.querySelector('.rx-row2');
      if(row1) wrapper.appendChild(row1);
      if(row2) wrapper.appendChild(row2);
      const firstChild = card.firstElementChild;
      card.insertBefore(wrapper, firstChild ? firstChild.nextSibling : null);
      return wrapper;
    })();

    if(!rxEntry) return;

    let row1 = rxEntry.querySelector('.rx-row1');
    let row2 = rxEntry.querySelector('.rx-row2');

    if(!row1){
      row1 = document.createElement('div'); row1.className = 'rx-row1'; rxEntry.insertBefore(row1, rxEntry.firstChild);
    }
    if(!row2){
      row2 = document.createElement('div'); row2.className = 'rx-row2'; rxEntry.appendChild(row2);
    }

    // Ensure wrappers for each input so we can move them safely
    function wrapIfNeeded(el, cls){
      if(!el) return null;
      const p = el.parentElement;
      if(p && p.classList && p.classList.contains(cls)) return p;
      const w = document.createElement('div'); w.className = cls;
      if(p) p.replaceChild(w, el);
      w.appendChild(el);
      return w;
    }

    if(medType) wrapIfNeeded(medType, 'field-compact');
    if(medName) wrapIfNeeded(medName, 'field-grow');
    if(medDosage) wrapIfNeeded(medDosage, 'field-medium');
    if(medTimings) wrapIfNeeded(medTimings, 'field-small');
    if(medDays) wrapIfNeeded(medDays, 'field-medium');
    if(medRemarks) wrapIfNeeded(medRemarks, 'field-grow');
    if(addMedStructuredBtn) wrapIfNeeded(addMedStructuredBtn, 'field-action');

    // clear rows (avoid duplicates)
    while(row1.firstChild) row1.removeChild(row1.firstChild);
    while(row2.firstChild) row2.removeChild(row2.firstChild);

    // append in intended order
    if(medType && medType.parentElement) row1.appendChild(medType.parentElement);
    if(medName && medName.parentElement) row1.appendChild(medName.parentElement);

    if(medDosage && medDosage.parentElement) row2.appendChild(medDosage.parentElement);
    if(medTimings && medTimings.parentElement) row2.appendChild(medTimings.parentElement);
    if(medDays && medDays.parentElement) row2.appendChild(medDays.parentElement);
    if(medRemarks && medRemarks.parentElement) row2.appendChild(medRemarks.parentElement);
    if(addMedStructuredBtn && addMedStructuredBtn.parentElement) row2.appendChild(addMedStructuredBtn.parentElement);

    // inline visual adjustments
    if(medName){ medName.style.width = '100%'; medName.style.minWidth = '0'; medName.style.boxSizing = 'border-box'; }
    if(medDosage){ medDosage.style.width = '100%'; medDosage.style.boxSizing = 'border-box'; }
    if(medTimings){ medTimings.style.width = '100%'; medTimings.style.boxSizing = 'border-box'; }

    rxEntry.setAttribute('role','group');
    rxEntry.setAttribute('aria-label','Rx entry');

  } catch(e){
    console.warn('restructureRxEntry failed:', e);
  }
}

/* ===========================
   Suggestion box placement & autocomplete
   =========================== */
function placeSuggestionsUnderMedName(){
  if(!medSuggestions || !medName) return;
  const rect = medName.getBoundingClientRect();
  const rxEntry = medName.closest('.rx-entry') || medSuggestions.closest('.rx-entry') || document.body;
  const rxRect = rxEntry.getBoundingClientRect();
  const left = Math.max(8, rect.left - rxRect.left);
  const top = rect.bottom - rxRect.top + 6;
  const maxWidth = Math.min(rxRect.width - left - 12, Math.max(280, rect.width));
  medSuggestions.style.position = 'absolute';
  medSuggestions.style.left = left + 'px';
  medSuggestions.style.top = top + 'px';
  medSuggestions.style.width = Math.max(250, Math.min(maxWidth, 900)) + 'px';
  medSuggestions.style.display = medSuggestions.getAttribute('aria-hidden') === 'false' ? 'block' : 'none';
  medSuggestions.style.zIndex = '4000';
}

function clearSuggestions(){
  if(!medSuggestions) return;
  medSuggestions.innerHTML = '';
  medSuggestions.style.display = 'none';
  medSuggestions.setAttribute('aria-hidden','true');
}

function showSuggestions(items){
  if(!medSuggestions) return;
  medSuggestions.innerHTML = '';
  if(!items || !items.length){ clearSuggestions(); return; }
  items.forEach((it, idx) => {
    const li = document.createElement('li');
    li.className = 'suggestion-item';
    li.tabIndex = 0;
    li.setAttribute('role','option');
    li.setAttribute('aria-selected','false');
    li.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div style="min-width:0"><strong style="display:block">${esc(it.name)}</strong><span class="small" style="font-weight:500">${esc(it.strength||'')} ${it.form?('• '+esc(it.form)):''}</span></div>
      <div style="opacity:.65;font-size:12px">${idx+1}</div>
    </div>`;
    li.addEventListener('click', ()=> {
      if(medName) medName.value = it.name || '';
      if(medDosage) medDosage.value = it.strength || '';
      clearSuggestions();
      medDosage && medDosage.focus();
      renderPreview();
    });
    li.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); li.click(); }
      else if(e.key === 'ArrowDown'){ e.preventDefault(); const next = li.nextElementSibling; next && next.focus(); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); const prev = li.previousElementSibling; if(prev) prev.focus(); else medName && medName.focus(); }
      else if(e.key === 'Escape'){ clearSuggestions(); medName && medName.focus(); }
    });
    medSuggestions.appendChild(li);
  });
  medSuggestions.setAttribute('aria-hidden','false');
  medSuggestions.style.display = 'block';
  placeSuggestionsUnderMedName();
}

function filterMeds(q){
  if(!q) return medList.slice(0, 12);
  const Q = q.trim().toLowerCase();
  const out = [];
  for(let i=0;i<medList.length && out.length<18;i++){
    const m = medList[i];
    const hay = ((m.name||'') + ' ' + (m.strength||'') + ' ' + (m.form||'')).toLowerCase();
    if(hay.includes(Q)) out.push(m);
  }
  out.sort((a,b)=>{
    const A = (a.name||'').toLowerCase(), B = (b.name||'').toLowerCase();
    const aScore = A.startsWith(Q) ? 0 : 1;
    const bScore = B.startsWith(Q) ? 0 : 1;
    return aScore - bScore || A.localeCompare(B);
  });
  return out.slice(0, 12);
}

function initAutocomplete(){
  if(!medName || !medSuggestions) return;
  const deb = debounce(v => {
    const arr = filterMeds(v);
    showSuggestions(arr);
  }, 90);

  medName.addEventListener('input', e => {
    const v = e.target.value || '';
    if(!v.trim()){ clearSuggestions(); return; }
    deb(v);
  });

  medName.addEventListener('keydown', e => {
    if(e.key === 'ArrowDown'){
      const first = medSuggestions && medSuggestions.querySelector('li');
      first && first.focus();
      e.preventDefault();
    } else if(e.key === 'Escape'){
      clearSuggestions();
    } else if(e.key === 'Enter'){
      const visible = medSuggestions && medSuggestions.getAttribute('aria-hidden') === 'false';
      if(!visible){ e.preventDefault(); medDosage && medDosage.focus(); }
    }
  });

  // hide suggestions when clicking outside rx-entry
  document.addEventListener('click', (evt) => {
    if(!evt.target.closest('.rx-entry')) clearSuggestions();
  });

  window.addEventListener('resize', debounce(placeSuggestionsUnderMedName, 120));
  window.addEventListener('scroll', debounce(placeSuggestionsUnderMedName, 160), true);
}

/* ===========================
   Cart (rx table) rendering and manipulation
   =========================== */
function persistCart(){ localStorage.setItem('fit_cart', JSON.stringify(cart)); }
function renderCart(){
  try{
    if(!medTableBody) return;
    medTableBody.innerHTML = '';
    if(!cart || !cart.length){
      const tr = document.createElement('tr');
      tr.className = 'rx-empty';
      tr.innerHTML = `<td colspan="8">No medicines added yet</td>`;
      medTableBody.appendChild(tr);
    } else {
      cart.forEach((m, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${idx+1}</td>
          <td>${esc(m.type)}</td>
          <td>${esc(m.name)}</td>
          <td>${esc(m.dosage)}</td>
          <td>${esc(m.timings)}</td>
          <td>${esc(m.days)}</td>
          <td>${esc(m.remarks)}</td>
          <td>
            <button class="iconBtn editRow" data-idx="${idx}" title="Edit">✏️</button>
            <button class="iconBtn delRow" data-idx="${idx}" title="Delete">🗑️</button>
            <button class="iconBtn upRow" data-idx="${idx}" title="Up">▲</button>
            <button class="iconBtn downRow" data-idx="${idx}" title="Down">▼</button>
          </td>
        `;
        medTableBody.appendChild(tr);
      });
    }
    medCount && (medCount.textContent = cart.length);
    $$('.editRow').forEach(btn => btn.addEventListener('click', e => editCartItem(+btn.dataset.idx)));
    $$('.delRow').forEach(btn => btn.addEventListener('click', e => deleteCartItem(+btn.dataset.idx)));
    $$('.upRow').forEach(btn => btn.addEventListener('click', e => moveCart(+btn.dataset.idx, +btn.dataset.idx - 1)));
    $$('.downRow').forEach(btn => btn.addEventListener('click', e => moveCart(+btn.dataset.idx, +btn.dataset.idx + 1)));
  } catch(e){
    console.warn('renderCart error', e);
  }
}

function addStructuredMedicine(){
  if(!medName) return;
  const name = (medName.value || '').trim();
  if(!name){ medName.focus(); return alert('Please enter medicine name'); }
  const entry = {
    id: uid('med'),
    type: medType && medType.value || '',
    name,
    dosage: medDosage && medDosage.value || '',
    timings: medTimings && medTimings.value || '',
    days: medDays && medDays.value || '',
    remarks: medRemarks && medRemarks.value || ''
  };
  cart.push(entry);
  persistCart();
  renderCart();
  renderPreview();
  clearStructuredInputs();
  medName && medName.focus();
}

function clearStructuredInputs(){
  if(medType) medType.value = 'Tab';
  if(medName) medName.value = '';
  if(medDosage) medDosage.value = '';
  if(medTimings) medTimings.value = '';
  if(medDays) medDays.value = '';
  if(medRemarks) medRemarks.value = '';
  clearSuggestions();
}

function editCartItem(i){
  if(i < 0 || i >= cart.length) return;
  const m = cart[i];
  if(medType) medType.value = m.type || 'Tab';
  if(medName) medName.value = m.name || '';
  if(medDosage) medDosage.value = m.dosage || '';
  if(medTimings) medTimings.value = m.timings || '';
  if(medDays) medDays.value = m.days || '';
  if(medRemarks) medRemarks.value = m.remarks || '';
  cart.splice(i, 1);
  persistCart();
  renderCart();
  medName && medName.focus();
}

function deleteCartItem(i){
  if(i < 0 || i >= cart.length) return;
  if(!confirm('Delete this medicine?')) return;
  cart.splice(i, 1);
  persistCart();
  renderCart();
  renderPreview();
}

function moveCart(from, to){
  if(from < 0 || from >= cart.length || to < 0 || to >= cart.length) return;
  const it = cart.splice(from, 1)[0];
  cart.splice(to, 0, it);
  persistCart();
  renderCart();
  renderPreview();
}

/* ===========================
   Preview and autosave
   =========================== */
function pvVitalsText(){
  const p=[];
  bpEl && bpEl.value && p.push('BP: '+bpEl.value);
  pulseEl && pulseEl.value && p.push('Pulse: '+pulseEl.value+' bpm');
  rrEl && rrEl.value && p.push('RR: '+rrEl.value);
  tempEl && tempEl.value && p.push('Temp: '+tempEl.value+' °C');
  spo2El && spo2El.value && p.push('SpO₂: '+spo2El.value+'%');
  weightEl && weightEl.value && p.push('Wt: '+weightEl.value+' kg');
  heightEl && heightEl.value && p.push('Ht: '+heightEl.value+' cm');
  bmiEl && bmiEl.value && p.push('BMI: '+bmiEl.value);
  gluEl && gluEl.value && p.push('Glu: '+gluEl.value+' mg/dL');
  return p.join(' • ');
}

function assignPatientIdIfEmpty(){
  if(patientIdEl && patientIdEl.value && patientIdEl.value.trim()) return patientIdEl.value.trim();
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const d = String(dt.getDate()).padStart(2,'0');
  const rand = Math.random().toString(36).slice(2,6).toUpperCase();
  const pid = `P-${y}${m}${d}-${rand}`;
  if(patientIdEl) patientIdEl.value = pid;
  return pid;
}

/* render preview (live) */
function renderPreview(){
  try{
    const now = new Date();
    pvDateEl && (pvDateEl.textContent = now.toLocaleString());
    pvNameEl && (pvNameEl.textContent = nameEl && nameEl.value ? nameEl.value : '--');
    pvIdEl && (pvIdEl.textContent = patientIdEl && patientIdEl.value ? 'ID: '+patientIdEl.value : '');

    // Apply branding text in preview panels (clinic & doc)
    try {
      const clinicEl = document.querySelector('.clinic');
      const docEl = document.querySelector('.doc');
      const contactEl = document.querySelector('.pres-head .muted');
      if(clinicEl) clinicEl.textContent = branding && branding.clinicName ? branding.clinicName : 'Fit Clinic';
      if(docEl) docEl.textContent = branding && branding.doctorName ? branding.doctorName : 'Dr M. Yusuf Abbas MBBS, MD';
      if(contactEl) contactEl.textContent = branding && branding.contactLine ? branding.contactLine : 'Regn: XYZ/12345 • +91 9988776655';
    } catch(e){}

    pvVitalsEl && (pvVitalsEl.textContent = pvVitalsText() || '--');
    pvDetailsEl && (pvDetailsEl.textContent = `Age: ${ageEl && ageEl.value || '--'} • Gender: ${genderEl && genderEl.value || '--'} • Phone: ${phoneEl && phoneEl.value || '--'}`);
    pvCoEl && (pvCoEl.textContent = coEl && (coEl.innerText || coEl.textContent) || '--');
    pvObsEl && (pvObsEl.textContent = obsEl && (obsEl.innerText || obsEl.textContent) || '--');
    pvInvestEl && (pvInvestEl.textContent = investEl && (investEl.innerText || investEl.textContent) || '--');
    pvDxEl && (pvDxEl.textContent = dxEl && (dxEl.innerText || dxEl.textContent) || '--');

    if(pvTable){
      pvTable.innerHTML = '';
      cart.forEach(c => {
        const tr = document.createElement('tr');
        const med = esc(c.name) + (c.dosage ? (' ('+esc(c.dosage)+')') : '');
        tr.innerHTML = `<td style="padding:6px">${med}</td><td style="padding:6px">${esc(c.dosage)}</td><td style="padding:6px">${esc(c.timings)}</td><td style="padding:6px">${esc(c.days)}</td>`;
        pvTable.appendChild(tr);
      });
    }

    pvPrintedEl && (pvPrintedEl.textContent = new Date().toLocaleString());

    // autosave snapshot
    try {
      const snapshot = {
        ts: new Date().toISOString(),
        patient: {
          name: nameEl && nameEl.value || '',
          age: ageEl && ageEl.value || '',
          gender: genderEl && genderEl.value || '',
          phone: phoneEl && phoneEl.value || '',
          id: patientIdEl && patientIdEl.value || ''
        },
        vitals: {
          bp: bpEl && bpEl.value || '',
          pulse: pulseEl && pulseEl.value || '',
          rr: rrEl && rrEl.value || '',
          temp: tempEl && tempEl.value || '',
          spo2: spo2El && spo2El.value || '',
          weight: weightEl && weightEl.value || '',
          height: heightEl && heightEl.value || '',
          bmi: bmiEl && bmiEl.value || '',
          glu: gluEl && gluEl.value || ''
        },
        notes: {
          co: coEl && (coEl.innerHTML || '') || '',
          obs: obsEl && (obsEl.innerHTML || '') || '',
          invest: investEl && (investEl.innerHTML || '') || '',
          dx: dxEl && (dxEl.innerHTML || '') || ''
        },
        rx: cart
      };
      localStorage.setItem('fit_autosave', JSON.stringify(snapshot));
    } catch(e){}
  } catch(e){
    console.warn('renderPreview error', e);
  }
}

/* load autosave if present */
function loadAutosave(){
  try{
    const raw = localStorage.getItem('fit_autosave') || null;
    if(!raw) return;
    const auto = JSON.parse(raw);
    if(!auto) return;
    if(nameEl) nameEl.value = auto.patient.name || '';
    if(ageEl) ageEl.value = auto.patient.age || '';
    if(genderEl) genderEl.value = auto.patient.gender || 'M';
    if(phoneEl) phoneEl.value = auto.patient.phone || '';
    if(patientIdEl) patientIdEl.value = auto.patient.id || '';
    if(bpEl) bpEl.value = auto.vitals.bp || '';
    if(pulseEl) pulseEl.value = auto.vitals.pulse || '';
    if(rrEl) rrEl.value = auto.vitals.rr || '';
    if(tempEl) tempEl.value = auto.vitals.temp || '';
    if(spo2El) spo2El.value = auto.vitals.spo2 || '';
    if(weightEl) weightEl.value = auto.vitals.weight || '';
    if(heightEl) heightEl.value = auto.vitals.height || '';
    if(bmiEl) bmiEl.value = auto.vitals.bmi || '';
    if(gluEl) gluEl.value = auto.vitals.glu || '';
    if(coEl) coEl.innerHTML = auto.notes.co || '';
    if(obsEl) obsEl.innerHTML = auto.notes.obs || '';
    if(investEl) investEl.innerHTML = auto.notes.invest || '';
    if(dxEl) dxEl.innerHTML = auto.notes.dx || '';
    cart = auto.rx || cart || [];
    renderCart();
    renderPreview();
  } catch(e){
    console.warn('loadAutosave error', e);
  }
}

/* ===========================
   Printing helpers
   =========================== */
(function installPrintHelpers(){
  let printableClone = document.querySelector('.printable-clone');
  if(!printableClone){
    printableClone = document.createElement('div');
    printableClone.className = 'printable-clone';
    printableClone.style.display = 'none';
    document.body.appendChild(printableClone);
  }

  function buildPrintHtml(){
    const coHtml = coEl ? (coEl.innerHTML || '') : '';
    const obsHtml = obsEl ? (obsEl.innerHTML || '') : '';
    const investHtml = investEl ? (investEl.innerHTML || '') : '';
    const dxHtml = dxEl ? (dxEl.innerHTML || '') : '';

    const rows = (cart || []).map(c => `<tr>
      <td style="padding:6px;border:1px solid #ddd">${esc(c.type)}</td>
      <td style="padding:6px;border:1px solid #ddd">${esc(c.name)}</td>
      <td style="padding:6px;border:1px solid #ddd">${esc(c.dosage)}</td>
      <td style="padding:6px;border:1px solid #ddd">${esc(c.timings)}</td>
      <td style="padding:6px;border:1px solid #ddd">${esc(c.days)}</td>
      <td style="padding:6px;border:1px solid #ddd">${esc(c.remarks)}</td>
    </tr>`).join('') || `<tr><td colspan="6" style="padding:8px;color:#666">No medicines</td></tr>`;

    const logoImg = branding && branding.logoBase64 ? `<img src="${branding.logoBase64}" alt="Clinic Logo" style="height:70px;width:auto">` : `<div style="height:70px;width:90px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:#f3f5f8;color:#666;margin-right:12px">LOGO</div>`;
    const clinicTitle = branding && branding.clinicName ? esc(branding.clinicName) : 'THE FIT CLINIC';
    const doctorLine = branding && branding.doctorName ? esc(branding.doctorName) : 'Dr M. Yusuf Abbas MBBS, MD';

    const headerHtml = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px">
          ${logoImg}
          <div>
            <h2 style="margin:0;font-size:22px">${clinicTitle}</h2>
            <div style="font-size:14px;color:#444">Caring for Life, Building Health</div>
            <div style="font-size:13px;color:#555;margin-top:4px">${doctorLine}</div>
          </div>
        </div>
        <div style="text-align:right;font-size:13px;color:#333">
          <div><strong>Date:</strong> ${new Date().toLocaleString()}</div>
          <div><strong>Patient:</strong> ${esc(nameEl && nameEl.value || '--')}</div>
          <div><strong>Age:</strong> ${esc(ageEl && ageEl.value || '--')} | <strong>Gender:</strong> ${esc(genderEl && genderEl.value || '--')}</div>
          <div><strong>Phone:</strong> ${esc(phoneEl && phoneEl.value || '--')}</div>
          <div><strong>ID:</strong> ${esc(patientIdEl && patientIdEl.value || '--')}</div>
        </div>
      </div>
    `;

    const notesHtml = `
      <div style="margin-top:8px"><strong>C/o — Chief Complaint</strong><div style="margin-top:4px">${coHtml || '<span style="color:#666">--</span>'}</div></div>
      <div style="margin-top:12px"><strong>Observation / Exam</strong><div style="margin-top:4px">${obsHtml || '<span style="color:#666">--</span>'}</div></div>
      <div style="margin-top:12px"><strong>Investigation / Advice</strong><div style="margin-top:4px">${investHtml || '<span style="color:#666">--</span>'}</div></div>
      <div style="margin-top:12px"><strong>Diagnosis (Dx)</strong><div style="margin-top:4px">${dxHtml || '<span style="color:#666">--</span>'}</div></div>
    `;

    const rxHtml = `
      <div style="margin-top:16px">
        <h3 style="margin:0 0 6px 0">Prescription</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:#f8f8f8">
            <tr>
              <th style="padding:6px;border:1px solid #ddd">Type</th>
              <th style="padding:6px;border:1px solid #ddd">Medicine</th>
              <th style="padding:6px;border:1px solid #ddd">Dose</th>
              <th style="padding:6px;border:1px solid #ddd">Freq</th>
              <th style="padding:6px;border:1px solid #ddd">Dur</th>
              <th style="padding:6px;border:1px solid #ddd">Remarks</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    printableClone.innerHTML = `<div style="padding:18px;font-family:Inter,Arial;color:#111">${headerHtml}${notesHtml}${rxHtml}<div style="margin-top:24px;text-align:right;color:#444">Signature: ____________________</div></div>`;
  }

  function onBeforePrint(){
    buildPrintHtml();
    printableClone.style.display = 'block';
    document.documentElement.classList.add('printing-mode');
  }
  function onAfterPrint(){
    printableClone.style.display = 'none';
    document.documentElement.classList.remove('printing-mode');
  }

  if(window.matchMedia){
    const mq = window.matchMedia('print');
    mq.addListener(m => { if(m.matches) onBeforePrint(); else onAfterPrint(); });
  }
  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);

})();

/* ===========================
   Branding modal (uses existing #modalBackdrop modal if present)
   - For compatibility: uses #modalBackdrop (provided in your HTML) as the generic modal container
   - If not present, create a simple modal id=brandingModal
   =========================== */
function ensureGenericModal(){
  let mb = document.getElementById('modalBackdrop');
  if(mb) return mb;
  // create a lightweight modal backdrop if none present
  mb = document.createElement('div');
  mb.id = 'modalBackdrop';
  mb.className = 'modal-backdrop';
  mb.setAttribute('aria-hidden','true');
  mb.style.display = 'none';
  mb.innerHTML = `
    <div class="modal" role="document" style="max-width:560px">
      <div class="modal-header"><strong id="modalTitle">Modal</strong><button id="modalClose" class="btn btn-ghost">✕</button></div>
      <div id="modalBody" style="margin-top:8px"></div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        <button id="modalCancel" class="btn btn-outline">Cancel</button>
        <button id="modalConfirm" class="btn btn-primary">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(mb);
  return mb;
}
const genericModal = ensureGenericModal();
const modalTitle = $('#modalTitle');
const modalBody = $('#modalBody');
const modalClose = $('#modalClose');
const modalCancel = $('#modalCancel');
const modalConfirm = $('#modalConfirm');

/* open Branding modal inside the generic modal */
function openBrandingModal(){
  const b = loadBrandingState();
  modalTitle && (modalTitle.textContent = 'Clinic & Doctor Branding');
  modalBody && (modalBody.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <label>Clinic / Company name
        <input id="brandingClinic" type="text" value="${esc(b.clinicName || '')}" placeholder="e.g. Fit Clinic" />
      </label>
      <label>Doctor / Signature name
        <input id="brandingDoctor" type="text" value="${esc(b.doctorName || '')}" placeholder="e.g. Dr M. Yusuf Abbas MBBS, MD" />
      </label>
      <label>Contact / registration line
        <input id="brandingContact" type="text" value="${esc(b.contactLine || '')}" placeholder="e.g. Regn: XYZ/12345 • +91 9988776655" />
      </label>
      <label>Logo (PNG/JPG) — will be stored locally in browser
        <input id="brandingLogoFile" type="file" accept="image/*" />
      </label>
      <div style="display:flex;gap:12px;align-items:center">
        <div id="brandingPreview" aria-hidden="true">${b.logoBase64 ? `<img src="${b.logoBase64}" alt="logo" style="max-height:64px">` : 'No logo'}</div>
        <div class="small muted">Uploading saves image to localStorage (Base64). Use a small file for performance.</div>
      </div>
      <div class="small muted">Saved branding affects preview & printed/popup output only on this device/browser.</div>
    </div>
  `);

  // show modal
  genericModal.setAttribute('aria-hidden','false');
  genericModal.style.display = 'flex';

  // hook file input change (deferred until DOM nodes exist)
  setTimeout(()=> {
    const fileInput = document.getElementById('brandingLogoFile');
    const previewDiv = document.getElementById('brandingPreview');
    if(fileInput){
      fileInput.addEventListener('change', (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if(!f) return;
        const reader = new FileReader();
        reader.onload = function(e){
          const data = e.target.result;
          previewDiv.innerHTML = `<img src="${data}" alt="logo" style="max-height:64px">`;
          // temporary store new logo in genericModal object for confirm handler
          genericModal._brandingNewLogo = data;
        };
        reader.readAsDataURL(f);
      });
    }
  }, 40);
}

function closeGenericModal(){
  if(!genericModal) return;
  genericModal.setAttribute('aria-hidden','true');
  genericModal.style.display = 'none';
  // cleanup temporary fields
  delete genericModal._brandingNewLogo;
}

/* add topbar extras (branding button and CSV/Excel) if not in HTML already */
function addTopbarExtras(){
  try {
    const actions = document.querySelector('.topbar .actions') || document.querySelector('.actions');
    if(!actions) return;

    // Branding button (if not present in HTML)
    if(!document.getElementById('brandingBtn')){
      const b = document.createElement('button');
      b.id = 'brandingBtn';
      b.className = 'btn btn-ghost';
      b.title = 'Branding — change clinic / doctor / logo';
      b.textContent = 'Branding';
      b.addEventListener('click', ()=> openBrandingModal());
      actions.appendChild(b);
    } else {
      // wire existing brandingBtn to open modal
      document.getElementById('brandingBtn').addEventListener('click', ()=> openBrandingModal());
    }

    // Export Excel button (if not present)
    if(!document.getElementById('exportExcel')){
      const ex = document.createElement('button');
      ex.id = 'exportExcel';
      ex.className = 'btn btn-ghost';
      ex.title = 'Export patients/prescriptions to Excel (XLSX)';
      ex.textContent = 'Export Excel';
      actions.appendChild(ex);
      ex.addEventListener('click', ()=> triggerExcelDownload());
    } else {
      // ensure existing exportExcel wired
      document.getElementById('exportExcel').addEventListener('click', ()=> triggerExcelDownload());
    }

    // also provide a CSV quick-export button (optional)
    if(!document.getElementById('exportCsv')){
      const b2 = document.createElement('button');
      b2.id = 'exportCsv';
      b2.className = 'btn btn-outline';
      b2.title = 'Export patient details (CSV for Excel)';
      b2.textContent = 'Export CSV';
      b2.addEventListener('click', ()=> exportPatientToCsv());
      actions.appendChild(b2);
    }

  } catch(e){}
}

/* Export patient data (CSV) */
function exportPatientToCsv(){
  try{
    const pid = assignPatientIdIfEmpty();
    const header = [
      'Patient ID','Name','Age','Gender','Phone','Visit Date',
      'BP','Pulse','RR','Temp','SpO2','Weight (kg)','Height (cm)','BMI','Glucose (mg/dL)',
      'C/o','Observation','Investigation','Diagnosis','Medicines (Type|Name|Dose|Freq|Dur|Remarks)'
    ];
    const medsFlat = (cart || []).map(m => {
      const parts = [m.type||'', m.name||'', m.dosage||'', m.timings||'', m.days||'', m.remarks||''];
      return parts.map(p => String(p||'').replace(/"/g,'""')).join('|');
    }).join(' || ');
    const row = [
      patientIdEl && patientIdEl.value || pid,
      nameEl && nameEl.value || '',
      ageEl && ageEl.value || '',
      genderEl && genderEl.value || '',
      phoneEl && phoneEl.value || '',
      dateEl && dateEl.value || '',
      bpEl && bpEl.value || '',
      pulseEl && pulseEl.value || '',
      rrEl && rrEl.value || '',
      tempEl && tempEl.value || '',
      spo2El && spo2El.value || '',
      weightEl && weightEl.value || '',
      heightEl && heightEl.value || '',
      bmiEl && bmiEl.value || '',
      gluEl && gluEl.value || '',
      (coEl && (coEl.innerText || coEl.textContent) || ''),
      (obsEl && (obsEl.innerText || obsEl.textContent) || ''),
      (investEl && (investEl.innerText || investEl.textContent) || ''),
      (dxEl && (dxEl.innerText || dxEl.textContent) || ''),
      medsFlat
    ];

    function csvEscapeCell(val){
      if(val === null || val === undefined) return '';
      const s = String(val);
      if(s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')){
        return `"${s.replace(/"/g,'""')}"`;
      }
      return s;
    }

    const csvLines = [];
    csvLines.push(header.map(csvEscapeCell).join(','));
    csvLines.push(row.map(csvEscapeCell).join(','));
    const csv = csvLines.join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patient_${(patientIdEl && patientIdEl.value) || pid}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 2000);
  }catch(e){
    console.warn('exportPatientToCsv error', e);
    alert('Export failed: '+ (e && e.message ? e.message : 'unknown'));
  }
}

/* Build Excel workbook using SheetJS (XLSX must be included via CDN) */
function buildExcelWorkbook(){
  if(typeof XLSX === 'undefined'){
    alert('SheetJS (XLSX) not loaded. Ensure the CDN script is included in the HTML head.');
    return null;
  }
  const wb = XLSX.utils.book_new();

  const patientInfo = [
    { Field: 'Name', Value: (nameEl && nameEl.value) || '' },
    { Field: 'Age', Value: (ageEl && ageEl.value) || '' },
    { Field: 'Gender', Value: (genderEl && genderEl.value) || '' },
    { Field: 'Phone', Value: (phoneEl && phoneEl.value) || '' },
    { Field: 'Patient ID', Value: (patientIdEl && patientIdEl.value) || '' },
    { Field: 'Visit Date', Value: (dateEl && dateEl.value) || '' },
    { Field: 'Doctor', Value: (branding && branding.doctorName) || '' },
    { Field: 'Clinic', Value: (branding && branding.clinicName) || '' },
  ];
  const ws1 = XLSX.utils.json_to_sheet(patientInfo, {header:['Field','Value']});
  XLSX.utils.book_append_sheet(wb, ws1, 'Patient Info');

  const vitals = [
    { Field: 'BP', Value: bpEl && bpEl.value || '' },
    { Field: 'Pulse', Value: pulseEl && pulseEl.value || '' },
    { Field: 'RR', Value: rrEl && rrEl.value || '' },
    { Field: 'Temp', Value: tempEl && tempEl.value || '' },
    { Field: 'SpO2', Value: spo2El && spo2El.value || '' },
    { Field: 'Weight (kg)', Value: weightEl && weightEl.value || '' },
    { Field: 'Height (cm)', Value: heightEl && heightEl.value || '' },
    { Field: 'BMI', Value: bmiEl && bmiEl.value || '' },
    { Field: 'Glucose', Value: gluEl && gluEl.value || '' },
  ];
  const ws2 = XLSX.utils.json_to_sheet(vitals, {header:['Field','Value']});
  XLSX.utils.book_append_sheet(wb, ws2, 'Vitals');

  const notes = [
    { Field: 'Chief Complaint (C/o)', Value: coEl ? (coEl.innerText || '') : '' },
    { Field: 'Observation', Value: obsEl ? (obsEl.innerText || '') : '' },
    { Field: 'Investigation / Advice', Value: investEl ? (investEl.innerText || '') : '' },
    { Field: 'Diagnosis (Dx)', Value: dxEl ? (dxEl.innerText || '') : '' },
    { Field: 'Doctor Notes', Value: (document.getElementById('docNotes') && document.getElementById('docNotes').value) || '' }
  ];
  const ws3 = XLSX.utils.json_to_sheet(notes, {header:['Field','Value']});
  XLSX.utils.book_append_sheet(wb, ws3, 'Notes');

  const rxRows = (cart || []).map((c, idx) => ({
    SlNo: idx+1,
    Type: c.type || '',
    Medicine: c.name || '',
    Dose: c.dosage || '',
    Freq: c.timings || '',
    Dur: c.days || '',
    Remarks: c.remarks || ''
  }));
  const ws4 = XLSX.utils.json_to_sheet(rxRows);
  XLSX.utils.book_append_sheet(wb, ws4, 'Prescription');

  return wb;
}

function triggerExcelDownload(){
  try{
    const wb = buildExcelWorkbook();
    if(!wb) return;
    const clinic = (branding && branding.clinicName ? branding.clinicName : 'FitClinic').replace(/\s+/g,'_');
    const pid = patientIdEl && patientIdEl.value ? patientIdEl.value : assignPatientIdIfEmpty();
    const fname = `${clinic}_prescription_${pid}.xlsx`;
    XLSX.writeFile(wb, fname);
  } catch(e){
    console.error('export excel error', e);
    alert('Unable to export Excel: ' + (e && e.message || 'Unknown error'));
  }
}

/* ===========================
   Bind UI actions (save, export, print, add, clear)
   =========================== */
function initActions(){
  // topbar extras
  addTopbarExtras();

  // branding (generic modal confirm handler)
  modalClose && modalClose.addEventListener('click', ()=> closeGenericModal());
  modalCancel && modalCancel.addEventListener('click', ()=> closeGenericModal());
  modalConfirm && modalConfirm.addEventListener('click', ()=> {
    // if modal has branding fields, save them
    const clinicInput = document.getElementById('brandingClinic');
    if(clinicInput){
      const b = loadBrandingState();
      b.clinicName = clinicInput.value || '';
      b.doctorName = (document.getElementById('brandingDoctor') && document.getElementById('brandingDoctor').value) || '';
      b.contactLine = (document.getElementById('brandingContact') && document.getElementById('brandingContact').value) || '';
      if(genericModal._brandingNewLogo){
        b.logoBase64 = genericModal._brandingNewLogo;
        delete genericModal._brandingNewLogo;
      }
      saveBrandingState(b);
      branding = Object.assign({}, branding, b);
      renderPreview();
      closeGenericModal();
      alert('Branding saved locally');
      return;
    }
    // default close if confirm used for other purposes
    closeGenericModal();
  });

  // add structured med
  addMedStructuredBtn && addMedStructuredBtn.addEventListener('click', addStructuredMedicine);

  // clear med cart
  clearMedCartBtn && clearMedCartBtn.addEventListener('click', ()=>{
    if(!confirm('Clear medicine list?')) return;
    cart = [];
    localStorage.removeItem('fit_cart');
    renderCart();
    renderPreview();
  });

  // save med list
  saveMedListBtn && saveMedListBtn.addEventListener('click', ()=>{ persistCart(); alert('Medicine list saved to prescription'); });

  // save draft
  saveDraftBtn && saveDraftBtn.addEventListener('click', ()=>{
    const pid = assignPatientIdIfEmpty();
    const doc = {
      id: uid('draft'),
      ts: new Date().toISOString(),
      patient: { name:nameEl && nameEl.value || '', age:ageEl && ageEl.value || '', gender:genderEl && genderEl.value || '', phone:phoneEl && phoneEl.value || '', id: pid },
      vitals: { bp:bpEl&&bpEl.value||'', pulse:pulseEl&&pulseEl.value||'', rr:rrEl&&rrEl.value||'', temp:tempEl&&tempEl.value||'', spo2:spo2El&&spo2El.value||'', weight:weightEl&&weightEl.value||'', height:heightEl&&heightEl.value||'', bmi:bmiEl&&bmiEl.value||'', glu:gluEl&&gluEl.value||'' },
      co: coEl && (coEl.innerHTML||''), obs: obsEl && (obsEl.innerHTML||''), invest: investEl && (investEl.innerHTML||''), dx: dxEl && (dxEl.innerHTML||''), rx: cart
    };
    localStorage.setItem('fit_last_draft', JSON.stringify(doc));
    alert('Draft saved — Patient ID: '+pid);
  });

  // export JSON
  exportJsonBtn && exportJsonBtn.addEventListener('click', ()=>{
    const payload = { patients, autosave: JSON.parse(localStorage.getItem('fit_autosave') || 'null'), rx: cart };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fit_clinic_export.json';
    a.click();
    setTimeout(()=> URL.revokeObjectURL(url), 2000);
  });

  // print / save pdf
  printAllBtn && printAllBtn.addEventListener('click', ()=>{
    renderPreview();
    const pid = assignPatientIdIfEmpty();
    const popup = window.open('','_blank','width=900,height=700,scrollbars=yes');
    if(!popup) { alert('Popup blocked. Allow popups for printing.'); return; }
    const rows = (cart || []).map(c => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd">${esc(c.type || '')}</td>
        <td style="padding:8px;border:1px solid #ddd">${esc(c.name || '')}</td>
        <td style="padding:8px;border:1px solid #ddd">${esc(c.dosage || '')}</td>
        <td style="padding:8px;border:1px solid #ddd">${esc(c.timings || '')}</td>
        <td style="padding:8px;border:1px solid #ddd">${esc(c.days || '')}</td>
        <td style="padding:8px;border:1px solid #ddd">${esc(c.remarks || '')}</td>
      </tr>`).join('') || `<tr><td colspan="6" style="padding:8px;color:#666">No medicines</td></tr>`;

    const logoImg = branding && branding.logoBase64 ? `<img src="${branding.logoBase64}" alt="Clinic Logo" style="height:50px;width:auto">` : '';
    const clinicTitle = branding && branding.clinicName ? esc(branding.clinicName) : 'Hospital';
    const doctorLine = branding && branding.doctorName ? esc(branding.doctorName) : 'Dr Suneo Honekawa MBBS, MD';

    const doc = `
      <!doctype html><html><head><meta charset="utf-8"><title>Print - ${clinicTitle}</title>
      <style>
        body{font-family:Inter,Arial;color:#111;padding:18px}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ddd;padding:8px;text-align:left}
        thead th{background:#f8f8f8}
        .meta{margin-bottom:12px}
        .header{display:flex;justify-content:space-between;align-items:center}
        .left{display:flex;align-items:center;gap:12px}
      </style>
      </head><body>
        <div class="header">
          <div class="left">
            ${logoImg}
            <div>
              <h2 style="margin:2px 0">${clinicTitle}</h2>
              <div style="color:#444">${doctorLine}</div>
            </div>
          </div>
          <div style="text-align:right">
            <div>${new Date().toLocaleString()}</div>
          </div>
        </div>
        <hr/>
        <div class="meta"><strong>Patient:</strong> ${esc(nameEl && nameEl.value||'--')} &nbsp; <strong>Age:</strong> ${esc(ageEl && ageEl.value||'--')} &nbsp; <strong>ID:</strong> ${esc(pid)}</div>
        <div style="margin-top:8px"><strong>Vitals:</strong> ${esc(pvVitalsText())}</div>
        <div style="margin-top:8px"><strong>C/o:</strong> ${coEl ? (coEl.innerText || '') : '--'}</div>
        <div style="margin-top:8px"><strong>Observation:</strong> ${obsEl ? (obsEl.innerText || '') : '--'}</div>
        <div style="margin-top:8px"><strong>Investigation:</strong> ${investEl ? (investEl.innerText || '') : '--'}</div>
        <div style="margin-top:12px">
          <strong>Rx:</strong>
          <table style="margin-top:8px">
            <thead><tr><th>Type</th><th>Medicine</th><th>Dose</th><th>Freq</th><th>Dur</th><th>Remarks</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="margin-top:30px;text-align:right;color:#666">Signature: ____________________</div>
      </body></html>
    `;
    popup.document.open();
    popup.document.write(doc);
    popup.document.close();
    setTimeout(()=>{ popup.focus(); popup.print(); }, 600);
  });

  // download PDF triggers printAll
  downloadPdfBtn && downloadPdfBtn.addEventListener('click', ()=>{ printAllBtn && printAllBtn.click(); });

  // save final
  saveFinalBtn && saveFinalBtn.addEventListener('click', ()=>{
    const pid = assignPatientIdIfEmpty();
    const pres = { id: uid('pres'), ts: new Date().toISOString(), patient: { name: nameEl && nameEl.value||'', age: ageEl && ageEl.value||'', gender: genderEl && genderEl.value||'', phone: phoneEl && phoneEl.value||'', id: pid }, vitals: { bp:bpEl&&bpEl.value||'', pulse:pulseEl&&pulseEl.value||'', rr:rrEl&&rrEl.value||'', temp:tempEl&&tempEl.value||'', spo2:spo2El&&spo2El.value||'', weight:weightEl&&weightEl.value||'', height:heightEl&&heightEl.value||'', bmi:bmiEl&&bmiEl.value||'', glu:gluEl&&gluEl.value||'' }, co:coEl&&coEl.innerHTML||'', obs:obsEl&&obsEl.innerHTML||'', invest:investEl&&investEl.innerHTML||'', dx:dxEl&&dxEl.innerHTML||'', rx:cart };
    const all = JSON.parse(localStorage.getItem('fit_prescriptions') || '[]');
    all.unshift(pres);
    localStorage.setItem('fit_prescriptions', JSON.stringify(all));
    alert('Final prescription saved (Patient ID: '+pid+')');
  });

  // new patient
  newPatientBtn && newPatientBtn.addEventListener('click', ()=>{
    if(!nameEl||!nameEl.value) return alert('Enter name');
    const pid = assignPatientIdIfEmpty();
    patients.unshift({ id: pid, name: nameEl.value, age: ageEl.value, gender: genderEl.value, phone: phoneEl.value });
    localStorage.setItem('fit_patients', JSON.stringify(patients));
    alert('Patient added — ID: '+pid);
  });

  // clear all
  clearAllBtn && clearAllBtn.addEventListener('click', ()=>{
    if(!confirm('Clear all fields?')) return;
    if(nameEl) nameEl.value=''; if(ageEl) ageEl.value=''; if(genderEl) genderEl.value='M'; if(phoneEl) phoneEl.value=''; if(patientIdEl) patientIdEl.value=''; if(dateEl) dateEl.value='';
    if(bpEl) bpEl.value=''; if(pulseEl) pulseEl.value=''; if(rrEl) rrEl.value=''; if(tempEl) tempEl.value=''; if(spo2El) spo2El.value=''; if(weightEl) weightEl.value=''; if(heightEl) heightEl.value=''; if(bmiEl) bmiEl.value=''; if(gluEl) gluEl.value='';
    if(coEl) coEl.innerHTML=''; if(obsEl) obsEl.innerHTML=''; if(investEl) investEl.innerHTML=''; if(dxEl) dxEl.innerHTML='';
    cart = []; localStorage.removeItem('fit_cart'); renderCart(); renderPreview();
  });

  // keyboard shortcuts
  window.addEventListener('keydown', (e)=>{
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); saveDraftBtn && saveDraftBtn.click(); }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase() === 'p'){ e.preventDefault(); printAllBtn && printAllBtn.click(); }
    if(e.key === 'Escape'){ clearSuggestions(); if(genericModal && genericModal.getAttribute('aria-hidden') === 'false') closeGenericModal(); }
  });
}

/* ===========================
   Extra UI polish: vitals helpers
   =========================== */
function initVitalsHelpers(){
  const calcBtn = $('#calcBmi');
  const fillBtn = $('#fillNormal');
  const copyVitalsBtn = $('#copyVitals');

  calcBtn && calcBtn.addEventListener('click', ()=>{
    const w = parseFloat(weightEl && weightEl.value) || 0;
    const hcm = parseFloat(heightEl && heightEl.value) || 0;
    if(!w || !hcm) return alert('Enter weight (kg) and height (cm) to calculate BMI');
    const m = hcm/100;
    const bmi = (w / (m*m));
    if(bmiEl) bmiEl.value = bmi.toFixed(1);
    renderPreview();
  });

  fillBtn && fillBtn.addEventListener('click', ()=>{
    if(bpEl) bpEl.value = '120/80'; if(pulseEl) pulseEl.value='72'; if(spo2El) spo2El.value='98'; if(tempEl) tempEl.value='98';
    renderPreview();
  });

  copyVitalsBtn && copyVitalsBtn.addEventListener('click', ()=>{
    const txt = pvVitalsText();
    if(!txt) return alert('No vitals to copy');
    if(obsEl) obsEl.innerHTML = `<div>${esc(txt)}</div>` + (obsEl.innerHTML || '');
    renderPreview();
  });
}

/* ===========================
   Init: restructure, attach autocomplete, load autosave, bind actions
   =========================== */
function init(){
  try {
    restructureRxEntry();
    initAutocomplete();
    initActions();
    initVitalsHelpers();
    loadAutosave();
    renderCart();
    renderPreview();

    // apply branding immediately to preview
    try { branding = Object.assign({}, branding, loadBrandingState()); renderPreview(); } catch(e){}

    // reposition suggestions after restructure
    setTimeout(placeSuggestionsUnderMedName, 200);
    // keep preview refreshed
    setInterval(renderPreview, 2500);

    if(medName){
      medName.addEventListener('focus', ()=> setTimeout(placeSuggestionsUnderMedName, 60));
      medName.addEventListener('blur', ()=> setTimeout(()=>{ /* keep suggestions for click on item */ }, 120));
    }
  } catch(e){
    console.error('Init error', e);
  }
}

/* Kickoff */
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ===========================
   Accessibility small tweaks
   =========================== */
(function finalAccessibilityTweak(){
  if(medSuggestions){
    medSuggestions.setAttribute('role','listbox');
    medSuggestions.setAttribute('aria-label','Medicine suggestions');
  }
  const ro = new ResizeObserver(debounce(() => { placeSuggestionsUnderMedName(); }, 120));
  try {
    medName && ro.observe(medName);
    const rxEntry = document.querySelector('.rx-entry');
    rxEntry && ro.observe(rxEntry);
  } catch(e){}
})();

/* ===========================
   Console helpers for debugging
   =========================== */
window.__fitClinicDebug = {
  loadBranding: () => loadBrandingState(),
  saveBranding: (obj) => { saveBrandingState(obj); branding = Object.assign({}, branding, obj); renderPreview(); },
  exportCSV: () => exportPatientToCsv(),
  exportXLSX: () => triggerExcelDownload(),
  openBranding: () => openBrandingModal(),
  medCount: () => cart.length,
  medListPreview: () => medList.slice(0,20)
};


