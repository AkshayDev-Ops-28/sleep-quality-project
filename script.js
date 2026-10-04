/* ════════════════════════════════════════════════════
   ICMR-STS 2026 · script.js
   Handles: navigation, chip/YN selection, eligibility,
   PSQI rendering & scoring, language toggle,
   localStorage persistence, admin dashboard.
════════════════════════════════════════════════════ */

'use strict';

/* ─── STATE ─────────────────────────────────────── */
let currentLang    = 'en';
let currentPage    = 0;
let selectedForm   = null;   // 'pta' | 'psqi'
let ynValues       = {};     // { fieldId: 'yes'|'no' }
let chipValues     = {};     // { groupId: value }
let multiChipVals  = {};     // { groupId: Set }
let psqiFreqVals   = {};     // { itemId: score }
let psqiPartnerVals = {};

/* Page sequence for PTA route:  0→1→2→3→4→5
   Page sequence for PSQI route: 0→1→4→5          */
const PTA_PAGES  = [0, 1, 2, 3, 4, 5];
const PSQI_PAGES = [0, 1, 4, 5];

/* ─── PSQI Q5 ITEMS ─────────────────────────────── */
const psqiQ5Items = [
  { id:'q5a', en:'Cannot get to sleep within 30 minutes',               hi:'30 मिनट के अंदर नींद नहीं आती' },
  { id:'q5b', en:'Wake up in the middle of the night or early morning', hi:'रात के बीच या सुबह जल्दी नींद टूटती है' },
  { id:'q5c', en:'Have to get up to use the bathroom',                  hi:'बाथरूम जाने के लिए उठना पड़ता है' },
  { id:'q5d', en:'Cannot breathe comfortably',                          hi:'आरामदायक तरीके से सांस नहीं ले पाते' },
  { id:'q5e', en:'Cough or snore loudly',                               hi:'खांसी या तेज़ खर्राटे' },
  { id:'q5f', en:'Feel too cold',                                       hi:'बहुत ठंड लगती है' },
  { id:'q5g', en:'Feel too hot',                                        hi:'बहुत गर्मी लगती है' },
  { id:'q5h', en:'Have bad dreams',                                     hi:'बुरे सपने आते हैं' },
  { id:'q5i', en:'Have pain',                                           hi:'दर्द होता है' },
  { id:'q5j', en:'Other reason(s), please describe:',                   hi:'अन्य कारण, कृपया बताएं:' },
];

const psqiPartnerItems = [
  { id:'p1', en:'Loud snoring', hi:'तेज़ खर्राटे' },

  { id:'p2', en:'Long pauses between breaths while asleep',
    hi:'नींद के दौरान सांस रुकना' },

  { id:'p3', en:'Legs twitching or jerking while asleep',
    hi:'नींद में पैरों का झटका' },

  { id:'p4', en:'Episodes of disorientation or confusion during sleep',
    hi:'नींद में भ्रम या भटकाव' },

  { id:'p5', en:'Other restlessness while asleep',
    hi:'नींद में अन्य बेचैनी' }
];

const freqOptions = [
  { score:0, en:'Not during past month', hi:'पिछले माह नहीं' },
  { score:1, en:'< once/week',           hi:'सप्ताह में एक बार से कम' },
  { score:2, en:'1–2×/week',             hi:'सप्ताह में 1–2 बार' },
  { score:3, en:'≥ 3×/week',             hi:'सप्ताह में ≥ 3 बार' },
];

/* ─── INIT ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  renderPSQIQ5();
  renderPSQIPartner();
  updateProgress();
  applyLang(currentLang);

  // Default enrolment date to today
  const enrolmentInput = document.getElementById('dateEnrolment');
  if (enrolmentInput && !enrolmentInput.value) {
    enrolmentInput.value = new Date().toISOString().split('T')[0];
  }

  // Auto-calculate age from DOB and auto-set age inclusion criteria
  const dobInput = document.getElementById('dob');
  const ageInput = document.getElementById('age');
  if (dobInput && ageInput) {
    dobInput.addEventListener('change', () => {
      const dobVal = dobInput.value;
      if (!dobVal) return;
      const dobDate = new Date(dobVal);
      const today = new Date();
      let calculatedAge = today.getFullYear() - dobDate.getFullYear();
      const m = today.getMonth() - dobDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
        calculatedAge--;
      }
      ageInput.value = calculatedAge >= 0 ? calculatedAge : '';
      
      // Auto-toggle inclusion check for age (18-35 years)
      const meetsAge = calculatedAge >= 18 && calculatedAge <= 35;
      ynValues['inc_age'] = meetsAge ? 'yes' : 'no';
      const yesBtn = document.querySelector('.yn-btn.yes[data-field="inc_age"]');
      const noBtn = document.querySelector('.yn-btn.no[data-field="inc_age"]');
      if (yesBtn && noBtn) {
        yesBtn.classList.toggle('active', meetsAge);
        noBtn.classList.toggle('active', !meetsAge);
      }
      
      if (currentPage === 2) {
        evaluateEligibility();
      }
    });
  }
});

/* ─── LANGUAGE ──────────────────────────────────── */
function setLang(lang) {
  currentLang = lang;
  document.getElementById('btn-en').classList.toggle('active', lang === 'en');
  document.getElementById('btn-hi').classList.toggle('active', lang === 'hi');
  applyLang(lang);
}

function applyLang(lang) {
  document.querySelectorAll('[data-en]').forEach(el => {
    const attr = el.tagName === 'INPUT' ? 'placeholder' : null;
    const key  = `data-${lang}`;
    const text = el.getAttribute(key);
    if (!text) return;
    if (attr) el.setAttribute(attr, text);
    else el.textContent = text;
  });

  /* Placeholder specifically */
  document.querySelectorAll('[data-ph-en]').forEach(el => {
    el.placeholder = el.getAttribute(`data-ph-${lang}`) || el.getAttribute('data-ph-en');
  });

  /* Re-render dynamic PSQI sections */
  renderPSQIQ5();
  renderPSQIPartner();
  restorePsqiFreqUI();
}

/* ─── CHIP SELECTION ────────────────────────────── */
function selectChip(el, groupId) {
  document.querySelectorAll(`#${CSS.escape(groupId)} .chip`).forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  chipValues[groupId] = el.dataset.value;

  if (groupId === 'psqi-q10') return; // handled separately

  /* Enable form-select next if a card is chosen */
  if (groupId === 'form-selector') checkFormSelectNext();
}

function toggleMultiChip(el, groupId) {
  if (!multiChipVals[groupId]) multiChipVals[groupId] = new Set();
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
    multiChipVals[groupId].delete(el.dataset.value);
  } else {
    el.classList.add('selected');
    multiChipVals[groupId].add(el.dataset.value);
  }
}

/* ─── YES/NO SELECTION ──────────────────────────── */
function selectYN(el) {
  const field = el.dataset.field;
  const val   = el.dataset.val;
  /* Clear siblings */
  document.querySelectorAll(`.yn-btn[data-field="${field}"]`).forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  ynValues[field] = val;

  /* If on eligibility page, re-evaluate */
  if (currentPage === 2) evaluateEligibility();
}

/* ─── ELIGIBILITY ───────────────────────────────── */
function evaluateEligibility() {
  const incFields = ['inc_age', 'inc_iem', 'inc_duration', 'inc_history', 'inc_tests', 'inc_consent'];
  const excFields = [
    'exc_hearing_loss', 'exc_ear_disease', 'exc_tinnitus', 'exc_symptoms',
    'exc_systemic', 'exc_psychiatric', 'exc_sleep_disorder', 'exc_treatment',
    'exc_ototoxic', 'exc_headphones_predominant'
  ];

  const allIncYes = incFields.every(f => ynValues[f] === 'yes');
  const anyExcYes = excFields.some(f => ynValues[f] === 'yes');

  const answered = [...incFields, ...excFields].filter(f => ynValues[f]).length;
  if (answered === 0) {
    document.querySelectorAll('#eligibility-decision .chip').forEach(c => c.classList.remove('selected'));
    document.getElementById('reason-container').style.display = 'none';
    return;
  }

  const isEligible = allIncYes && !anyExcYes;

  // Update chips
  document.querySelectorAll('#eligibility-decision .chip').forEach(c => {
    c.classList.toggle('selected', c.dataset.value === (isEligible ? 'eligible' : 'not-eligible'));
  });

  // Toggle reason container
  const reasonContainer = document.getElementById('reason-container');
  if (reasonContainer) {
    reasonContainer.style.display = isEligible ? 'none' : 'block';
  }

  // Auto-populate non-eligibility reason
  const reasonInput = document.getElementById('nonEligibilityReason');
  if (reasonInput) {
    if (isEligible) {
      reasonInput.value = '';
    } else {
      const failed = incFields.filter(f => ynValues[f] === 'no' || !ynValues[f]);
      const triggered = excFields.filter(f => ynValues[f] === 'yes');
      
      let reasons = [];
      if (failed.length > 0) {
        reasons.push(currentLang === 'hi'
          ? `समावेशन मानदंड छूटे: ${failed.map(f => f.replace('inc_', '')).join(', ')}`
          : `Failed inclusion: ${failed.map(f => f.replace('inc_', '')).join(', ')}`);
      }
      if (triggered.length > 0) {
        reasons.push(currentLang === 'hi'
          ? `बहिष्करण सक्रिय: ${triggered.map(f => f.replace('exc_', '')).join(', ')}`
          : `Triggered exclusion: ${triggered.map(f => f.replace('exc_', '')).join(', ')}`);
      }
      reasonInput.value = reasons.join('; ');
    }
  }

  // Update the button text
  const nextBtn = document.getElementById('elig-next-btn');
  if (nextBtn) {
    if (isEligible) {
      nextBtn.textContent = currentLang === 'hi' ? 'जारी रखें' : 'Continue';
      nextBtn.setAttribute('data-en', 'Continue');
      nextBtn.setAttribute('data-hi', 'जारी रखें');
    } else {
      nextBtn.textContent = currentLang === 'hi' ? 'जमा करें (अपात्र)' : 'Submit (Ineligible)';
      nextBtn.setAttribute('data-en', 'Submit (Ineligible)');
      nextBtn.setAttribute('data-hi', 'जमा करें (अपात्र)');
    }
  }
}

/* ─── PSQI RENDERING ────────────────────────────── */
function renderPSQIQ5() {
  const container = document.getElementById('psqi-q5-items');
  if (!container) return;
  container.innerHTML = '';

  psqiQ5Items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'psqi-item';

    const label = document.createElement('div');
    label.className = 'psqi-item-label';
    label.textContent = currentLang === 'hi' ? item.hi : item.en;
    row.appendChild(label);

    if (item.id === 'q5j') {
      /* Free text */
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.id = 'psqi-q5j-text';
      inp.placeholder = currentLang === 'hi' ? 'विवरण दर्ज करें' : 'Describe';
      inp.style.cssText = 'min-width:180px;';
      inp.className = 'field-group input';
      row.appendChild(inp);
    } else {
      const grp = document.createElement('div');
      grp.className = 'psqi-freq-group';
      freqOptions.forEach(opt => {
        const btn = document.createElement('div');
        btn.className = 'psqi-freq-btn';
        btn.textContent = currentLang === 'hi' ? opt.hi : opt.en;
        btn.dataset.score = opt.score;
        btn.dataset.item  = item.id;
        if (psqiFreqVals[item.id] == opt.score) btn.classList.add('selected');
        btn.onclick = () => {
          grp.querySelectorAll('.psqi-freq-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          psqiFreqVals[item.id] = opt.score;
        };
        grp.appendChild(btn);
      });
      row.appendChild(grp);
    }

    container.appendChild(row);
  });
}

function renderPSQIPartner() {
  const container = document.getElementById('psqi-partner-items');
  if (!container) return;
  container.innerHTML = '';

  psqiPartnerItems.forEach(item => {
    const row = document.createElement('div');
    row.className = 'psqi-item';

    const label = document.createElement('div');
    label.className = 'psqi-item-label';
    label.textContent = currentLang === 'hi' ? item.hi : item.en;
    row.appendChild(label);

    if (item.id === 'p5') {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = currentLang === 'hi'
    ? 'विवरण दर्ज करें'
    : 'Describe';
  inp.id = 'psqi-p5-text';
  inp.style.cssText = 'min-width:220px;margin-bottom:10px;';
  row.appendChild(inp);
}

    const grp = document.createElement('div');
    grp.className = 'psqi-freq-group';
    freqOptions.forEach(opt => {
      const btn = document.createElement('div');
      btn.className = 'psqi-freq-btn';
      btn.textContent = currentLang === 'hi' ? opt.hi : opt.en;
      btn.dataset.score = opt.score;
      if (psqiPartnerVals[item.id] == opt.score) btn.classList.add('selected');
      btn.onclick = () => {
        grp.querySelectorAll('.psqi-freq-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        psqiPartnerVals[item.id] = opt.score;
      };
      grp.appendChild(btn);
    });
    row.appendChild(grp);
    container.appendChild(row);
  });
}

function restorePsqiFreqUI() {
  /* Re-select after language re-render */
  Object.entries(psqiFreqVals).forEach(([itemId, score]) => {
    document.querySelectorAll(`.psqi-freq-btn[data-item="${itemId}"]`).forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.dataset.score) === score);
    });
  });
}

function togglePartnerQ(show) {
  const el = document.getElementById('partner-questions');
  if (el) el.style.display = show ? 'block' : 'none';
}

/* ─── FORM SELECTION (PAGE 1) ───────────────────── */
function selectForm(type) {
  selectedForm = type;
  document.getElementById('card-pta').classList.toggle('selected',  type === 'pta');
  document.getElementById('card-psqi').classList.toggle('selected', type === 'psqi');
  document.getElementById('form-select-next').disabled = false;
}

function goFromFormSelect() {
  if (!selectedForm) return;
  if (selectedForm === 'pta')  { currentPage = 2; showPage(2); }
  else                          { currentPage = 4; showPage(4); }
  updateProgress();
}

/* ─── NAVIGATION ────────────────────────────────── */
function goNext(fromPage) {
  if (fromPage === 0) {
    if (!validatePage0()) return;
    currentPage = 1; showPage(1);
  } else if (fromPage === 2) {
    const isElig = deriveEligibility() === 'Eligible';
    if (isElig) {
      currentPage = 3; showPage(3);
    } else {
      submitForm();
      return;
    }
  } else if (fromPage === 3) {
    currentPage = 4; showPage(4);
  } else if (fromPage === 4) {
    submitForm();
    return;
  }
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack(fromPage) {
  if (fromPage === 1) { currentPage = 0; showPage(0); }
  else if (fromPage === 2) { currentPage = 1; showPage(1); }
  else if (fromPage === 3) { currentPage = 2; showPage(2); }
  else if (fromPage === 4) {
    if (selectedForm === 'pta') { currentPage = 3; showPage(3); }
    else { currentPage = 1; showPage(1); }
  }
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showPage(n) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById(`page-${n}`);
  if (pg) { pg.classList.add('active'); }
}

/* ─── PROGRESS BAR ──────────────────────────────── */
function updateProgress() {
  const pages = selectedForm === 'psqi' ? PSQI_PAGES : PTA_PAGES;
  const idx   = pages.indexOf(currentPage);
  const pct   = idx < 0 ? 0 : (idx / (pages.length - 1)) * 100;
  const bar   = document.getElementById('progress-bar');
  if (bar) bar.style.width = pct + '%';
}

/* ─── PAGE 0 VALIDATION ─────────────────────────── */
function validatePage0() {
  const required = ['fullName','dateEnrolment','age','dob','contact','email','education','occupation','institution','investigatorName','address'];
  let ok = true;

  required.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.value.trim()) {
      el.style.borderColor = 'var(--red)';
      ok = false;
    } else {
      el.style.borderColor = '';
    }
  });

  if (!chipValues['gender']) {
    flashMissing('gender');
    ok = false;
  }
  if (!chipValues['residential']) {
    flashMissing('residential');
    ok = false;
  }

  if (!ok) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(currentLang === 'hi' ? 'कृपया सभी आवश्यक फ़ील्ड भरें।' : 'Please fill all required fields.');
  }
  return ok;
}

function flashMissing(groupId) {
  const el = document.getElementById(groupId);
  if (!el) return;
  el.style.outline = '2px solid var(--red)';
  el.style.borderRadius = '8px';
  setTimeout(() => { el.style.outline = ''; }, 2000);
}

/* ─── TOAST ─────────────────────────────────────── */
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = `
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      background:var(--red); color:#fff; padding:10px 22px;
      border-radius:24px; font-size:0.84rem; font-weight:600;
      z-index:9999; box-shadow:0 4px 18px rgba(0,0,0,0.4);
      animation:fadeSlide 0.3s ease;
    `;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

/* ─── PSQI SCORING ──────────────────────────────── */
function computePSQIScore() {
  const bedtime  = document.getElementById('psqi-bedtime')?.value  || '';
  const waketime = document.getElementById('psqi-waketime')?.value || '';
  const latency  = parseFloat(document.getElementById('psqi-latency')?.value) || 0;
  const hours    = parseFloat(document.getElementById('psqi-hours')?.value)   || 0;

  /* Component 1: Subjective sleep quality (Q6) */
  const c1 = parseInt(chipValues['psqi-q6'] ?? 0);

  /* Component 2: Sleep latency */
  let latScore = latency <= 15 ? 0 : latency <= 30 ? 1 : latency <= 60 ? 2 : 3;
  const q5aScore = psqiFreqVals['q5a'] ?? 0;
  const latSum   = latScore + q5aScore;
  const c2 = latSum === 0 ? 0 : latSum <= 2 ? 1 : latSum <= 4 ? 2 : 3;

  /* Component 3: Sleep duration */
  const c3 = hours > 7 ? 0 : hours >= 6 ? 1 : hours >= 5 ? 2 : 3;

  /* Component 4: Habitual sleep efficiency */
  let c4 = 0;
  if (bedtime && waketime) {
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = waketime.split(':').map(Number);
    let bedMins  = bh * 60 + bm;
    let wakeMins = wh * 60 + wm;
    if (wakeMins <= bedMins) wakeMins += 1440; // past midnight
    const timeInBed = (wakeMins - bedMins) / 60;
    const eff = timeInBed > 0 ? (hours / timeInBed) * 100 : 0;
    c4 = eff >= 85 ? 0 : eff >= 75 ? 1 : eff >= 65 ? 2 : 3;
  }

  /* Component 5: Sleep disturbances (Q5b–Q5j) */
  const distIds   = ['q5b','q5c','q5d','q5e','q5f','q5g','q5h','q5i','q5j'];
  const distSum   = distIds.reduce((s, id) => s + (psqiFreqVals[id] ?? 0), 0);
  const c5 = distSum === 0 ? 0 : distSum <= 9 ? 1 : distSum <= 18 ? 2 : 3;

  /* Component 6: Sleep medication (Q7) */
  const c6 = parseInt(chipValues['psqi-q7'] ?? 0);

  /* Component 7: Daytime dysfunction (Q8 + Q9) */
  const q8 = parseInt(chipValues['psqi-q8'] ?? 0);
  const q9 = parseInt(chipValues['psqi-q9'] ?? 0);
  const daySum = q8 + q9;
  const c7 = daySum === 0 ? 0 : daySum <= 2 ? 1 : daySum <= 4 ? 2 : 3;

  const total = c1 + c2 + c3 + c4 + c5 + c6 + c7;

  return { total, components: { c1, c2, c3, c4, c5, c6, c7 } };
}

/* ─── SUBMIT ────────────────────────────────────── */
function submitForm() {
  const pid = generatePID();
  const isElig = deriveEligibility() === 'Eligible';
  const hasPSQI = selectedForm === 'psqi' || (selectedForm === 'pta' && isElig);
  const psqi = hasPSQI ? computePSQIScore() : { total: 'N/A', components: {} };

  const record = {
    pid,
    timestamp: new Date().toISOString(),
    form: selectedForm,

    /* Section A */
    fullName:       document.getElementById('fullName')?.value       || '',
    dateEnrolment:  document.getElementById('dateEnrolment')?.value  || '',
    age:            document.getElementById('age')?.value            || '',
    dob:            document.getElementById('dob')?.value            || '',
    contact:        document.getElementById('contact')?.value        || '',
    email:          document.getElementById('email')?.value          || '',
    education:      document.getElementById('education')?.value      || '',
    occupation:     document.getElementById('occupation')?.value     || '',
    institution:    document.getElementById('institution')?.value    || '',
    investigator:   document.getElementById('investigatorName')?.value || '',
    address:        document.getElementById('address')?.value        || '',
    gender:         chipValues['gender']      || '',
    residential:    chipValues['residential'] || '',

    /* Section B (PTA) */
    eligibility:    selectedForm === 'pta' ? deriveEligibility() : 'N/A',
    ynAnswers:      { ...ynValues },

    /* Section C/D/E (PTA) */
    earphoneType:   chipValues['c1-types']        || '',
    c1OtherSpecify: document.getElementById('c1OtherSpecify')?.value || '',
    brand:          document.getElementById('c2Brand')?.value     || '',
    model:          document.getElementById('c2Model')?.value     || '',
    priceRange:     document.getElementById('c2Price')?.value     || '',
    
    // Additional pairs (C3)
    c3Pair2Brand:   document.getElementById('c3Pair2Brand')?.value || '',
    c3Pair2Model:   document.getElementById('c3Pair2Model')?.value || '',
    c3Pair2Price:   document.getElementById('c3Pair2Price')?.value || '',
    c3Pair3Brand:   document.getElementById('c3Pair3Brand')?.value || '',
    c3Pair3Model:   document.getElementById('c3Pair3Model')?.value || '',
    c3Pair3Price:   document.getElementById('c3Pair3Price')?.value || '',

    dailyUse:       chipValues['c4-daily']        || '',
    dailyHours:     document.getElementById('c4HoursExact')?.value || '',
    
    cumulativeUse:  chipValues['c5-cumulative']   || '',
    c5Years:        document.getElementById('c5Years')?.value    || '',
    c5Months:       document.getElementById('c5Months')?.value   || '',

    volume:         chipValues['c6-volume']       || '',
    c6StepCurrent:  document.getElementById('c6StepCurrent')?.value || '',
    c6StepMax:      document.getElementById('c6StepMax')?.value      || '',

    volLimit:       chipValues['c7-safe-mode']    || '',
    purpose:        multiChipVals['c8-purpose'] ? [...multiChipVals['c8-purpose']] : [],
    timeOfDay:      chipValues['c9-time']         || '',
    sleepUse:       chipValues['c10-sleep']       || '',

    c11Use:         ynValues['c11_use']           || '',
    c11Hours:       document.getElementById('c11Hours')?.value   || '',
    c11BrandType:   document.getElementById('c11BrandType')?.value || '',

    /* PSQI */
    psqiBedtime:    hasPSQI ? document.getElementById('psqi-bedtime')?.value || '' : '',
    psqiWaketime:   hasPSQI ? document.getElementById('psqi-waketime')?.value || '' : '',
    psqiLatency:    hasPSQI ? document.getElementById('psqi-latency')?.value || '' : '',
    psqiHours:      hasPSQI ? document.getElementById('psqi-hours')?.value || '' : '',
    psqiFreqVals:   hasPSQI ? { ...psqiFreqVals } : {},
    psqiQ6:         hasPSQI ? chipValues['psqi-q6'] || '' : '',
    psqiQ7:         hasPSQI ? chipValues['psqi-q7'] || '' : '',
    psqiQ8:         hasPSQI ? chipValues['psqi-q8'] || '' : '',
    psqiQ9:         hasPSQI ? chipValues['psqi-q9'] || '' : '',
    psqiQ10:        hasPSQI ? chipValues['psqi-q10'] || '' : '',
    psqiScore:      psqi.total,
    psqiComponents: psqi.components,
  };

  saveRecord(record);

  /* Show PID on thank-you page */
  const pidEl = document.getElementById('ty-pid');
  if (pidEl) {
    if (selectedForm === 'psqi') {
      pidEl.textContent = `Participant ID: ${pid} | PSQI Score: ${psqi.total}/21 ${psqi.total > 5 ? '(Poor Sleep)' : '(Good Sleep)'}`;
    } else {
      pidEl.textContent = isElig
        ? `Participant ID: ${pid} | PTA Form Submitted Successfully | PSQI Score: ${psqi.total}/21`
        : `Participant ID: ${pid} | PTA Form Submitted (Not Eligible)`;
    }
  }

  currentPage = 5;
  showPage(5);
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deriveEligibility() {
  const incFields = ['inc_age', 'inc_iem', 'inc_duration', 'inc_history', 'inc_tests', 'inc_consent'];
  const excFields = [
    'exc_hearing_loss', 'exc_ear_disease', 'exc_tinnitus', 'exc_symptoms',
    'exc_systemic', 'exc_psychiatric', 'exc_sleep_disorder', 'exc_treatment',
    'exc_ototoxic', 'exc_headphones_predominant'
  ];
  const allInc = incFields.every(f => ynValues[f] === 'yes');
  const anyExc = excFields.some(f => ynValues[f] === 'yes');
  return (allInc && !anyExc) ? 'Eligible' : 'Not Eligible';
}

function generatePID() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substr(2,4).toUpperCase();
  return `STS-${ts}-${rand}`;
}

/* ─── SUPABASE BACKUP INIT ──────────────────────── */
const SUPABASE_URL = 'https://xtmhlebcugpzbfpojrvz.supabase.co'; // Replace with your URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0bWhsZWJjdWdwemJmcG9qcnZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTQ5NDAsImV4cCI6MjEwNjY5MDk0MH0.WXCDhn9D2faubsejb3eaVog99zM23A5wN4dyHZAa010'; // Replace with your Key
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── LOCAL STORAGE ─────────────────────────────── */
/* ─── LOCAL STORAGE & SUPABASE BACKUP ───────────── */
const STORAGE_KEY = 'icmr_sts_2026_records';

async function saveRecord(record) {
  // 1. Existing localStorage logic (remains unchanged)
  const all = getRecords();
  all.push(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));

  // 2. Supabase Backup Logic (runs asynchronously)
  try {
    const { error } = await supabaseClient
      .from('records_backup')
      .insert([
        {
          pid: record.pid,
          form_type: record.form,
          eligibility: record.eligibility || 'N/A',
          full_data: record // Dumps the complete JSON object for backup
        }
      ]);

    if (error) {
      console.error('Supabase backup failed:', error.message);
    } else {
      console.log('Record successfully backed up to Supabase.');
    }
  } catch (err) {
    console.error('Unexpected error during Supabase backup:', err);
  }
}

function getRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

/* ─── ADMIN ─────────────────────────────────────── */
const ADMIN_CREDS = { user: 'icmr2026', pass: 'STS@admin' };

function showAdminLogin() {
  document.getElementById('admin-modal').style.display = 'flex';
  document.getElementById('admin-err').style.display   = 'none';
  document.getElementById('admin-user').value = '';
  document.getElementById('admin-pass').value = '';
  document.getElementById('admin-user').focus();
}

function closeAdminModal() {
  document.getElementById('admin-modal').style.display = 'none';
}

function adminLogin() {
  const u = document.getElementById('admin-user').value.trim();
  const p = document.getElementById('admin-pass').value;
  if (u === ADMIN_CREDS.user && p === ADMIN_CREDS.pass) {
    closeAdminModal();
    openAdminDashboard();
  } else {
    document.getElementById('admin-err').style.display = 'block';
  }
}

function openAdminDashboard() {
  const records = getRecords();
  const dash    = document.getElementById('admin-dashboard');
  const tbody   = document.getElementById('admin-tbody');
  const empty   = document.getElementById('admin-empty');
  const count   = document.getElementById('admin-count');

  dash.style.display = 'flex';
  count.textContent  = `${records.length} Profile${records.length !== 1 ? 's' : ''}`;
  tbody.innerHTML    = '';

  if (records.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    records.forEach((r, i) => {
      const tr = document.createElement('tr');
      const eligClass = r.eligibility === 'Eligible' ? 'yes' : r.eligibility === 'N/A' ? 'na' : 'no';
      const eligLabel = r.eligibility === 'N/A' ? 'N/A (PSQI)' : r.eligibility;
      const date = new Date(r.timestamp).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' });
      tr.innerHTML = `
        <td style="font-family:monospace;font-size:0.72rem;color:var(--amber)">${r.pid}</td>
        <td>${r.fullName}</td>
        <td>${r.age}</td>
        <td style="text-transform:capitalize">${r.gender}</td>
        <td>${r.contact}</td>
        <td>${date}</td>
        <td><span style="font-weight:600;text-transform:uppercase">${r.form}</span></td>
        <td><span class="badge-elig ${eligClass}">${eligLabel}</span></td>
        <td><button class="view-btn" onclick="openDetailModal(${i})">View</button> <button class="view-btn" onclick="deleteUser('${r.pid}')">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });
  }
}



function deleteUser(pid) {
  if (!confirm('Do you really want to delete this user?')) return;
  const all = getRecords();
  const filtered = all.filter(r => r.pid !== pid);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  // Refresh admin dashboard view
  openAdminDashboard();
}




function openDetailModal(idx) {
  const r = getRecords()[idx];
  if (!r) return;

  document.getElementById('detail-title').textContent = `${r.fullName} — ${r.pid}`;
  const body = document.getElementById('detail-body');

  const psqiInt = r.psqiScore !== undefined ? r.psqiScore : '—';
  const psqiQual = typeof r.psqiScore === 'number' ? (r.psqiScore > 5 ? ' (Poor Sleep Quality)' : ' (Good Sleep Quality)') : '';

  body.innerHTML = `
    <div class="detail-section">
      <h4>Personal Details</h4>
      ${row('Full Name', r.fullName)}
      ${row('Age', r.age)} ${row('DOB', r.dob)}
      ${row('Gender', r.gender)} ${row('Contact', r.contact)}
      ${row('Email', r.email)} ${row('Education', r.education)}
      ${row('Occupation', r.occupation)} ${row('Institution', r.institution)}
      ${row('Investigator', r.investigator)}
      ${row('Address', r.address)}
      ${row('Residential', r.residential)}
      ${row('Date of Enrolment', r.dateEnrolment)}
    </div>

    <div class="detail-section">
      <h4>Study Info</h4>
      ${row('Form Type', r.form?.toUpperCase())}
      ${row('Eligibility', r.eligibility)}
      ${row('Participant ID', r.pid)}
      ${row('Submitted At', new Date(r.timestamp).toLocaleString('en-IN'))}
    </div>

    ${r.form === 'pta' ? `
    <div class="detail-section">
      <h4>Earphone Profile (Section C)</h4>
      ${row('Type', r.earphoneType)}
      ${row('Brand', r.brand)} ${row('Model', r.model)}
      ${row('Price Range', r.priceRange)}
      ${row('Daily Use', r.dailyUse)} ${row('Daily Hours', r.dailyHours)}
      ${row('Cumulative Use', r.cumulativeUse)}
      ${row('Volume Level', r.volume)} ${row('Vol. Limiter', r.volLimit)}
      ${row('Purpose', (r.purpose || []).join(', '))}
      ${row('Time of Day', r.timeOfDay)} ${row('Sleep Use', r.sleepUse)}
    </div>

    <div class="detail-section">
      <h4>Hearing Symptoms (Section D)</h4>
      ${['d1','d2','d3','d4','d5','d6','d7'].map(k =>
        row(k.toUpperCase(), r.ynAnswers?.[k] || '—')
      ).join('')}
    </div>

    <div class="detail-section">
      <h4>Sleep Habits (Section E)</h4>
      ${['e1','e2','e3'].map(k => row(k.toUpperCase(), r.ynAnswers?.[k] || '—')).join('')}
    </div>
    ` : ''}

    <div class="detail-section">
      <h4>PSQI Results</h4>
      ${row('Bed Time', r.psqiBedtime)} ${row('Wake Time', r.psqiWaketime)}
      ${row('Sleep Latency (min)', r.psqiLatency)}
      ${row('Actual Sleep Hours', r.psqiHours)}
      ${row('Q6 – Overall Quality', r.psqiQ6)}
      ${row('Q7 – Sleep Medication', r.psqiQ7)}
      ${row('Q8 – Daytime Function', r.psqiQ8)}
      ${row('Q9 – Enthusiasm', r.psqiQ9)}
      ${row('Q10 – Bed Partner', r.psqiQ10)}
      ${row('PSQI Total Score', `${psqiInt}${psqiQual}`)}
      ${r.psqiComponents ? Object.entries(r.psqiComponents).map(([k,v]) => row(`  Component ${k.slice(1)}`, v)).join('') : ''}
    </div>
  `;

  document.getElementById('detail-modal').style.display = 'flex';
}

function row(key, val) {
  return `<div class="detail-row"><span class="detail-key">${key}</span><span class="detail-val">${val ?? '—'}</span></div>`;
}

function closeDetailModal() {
  document.getElementById('detail-modal').style.display = 'none';
}

/* ─── KEYBOARD SHORTCUTS ────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAdminModal();
    closeDetailModal();
    closeAdmin();
  }
});