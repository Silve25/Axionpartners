'use strict';
/**
 * Axfinancement.js — CTAs dynamiques, validation formulaire, et pixel d'événements
 * Version: v1
 * Dépendances: Aucune (vanilla JS)
 *
 * Ce script:
 * 1) Valide le mini‑formulaire (selon Particulier / Entreprise)
 * 2) Génère les messages E‑mail et WhatsApp à partir des champs saisis
 * 3) Bloque le clic sur les CTAs si le formulaire est incomplet
 * 4) Envoie des événements ("pixel") vers un Apps Script pour suivi/Telegram
 * 5) Mesure scroll, temps de lecture des sections et abandon
 */

(function(){
  const PIXEL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwTUY2U3Tw2KOCLyBAckwoKSQw7Bn3itpttkwPwxwt8PsmCyInOq5OlXqgjgR0907JCxA/exec';
  const EMAIL_TO = 'Contact@axionpartners.eu';
  const WHATS_PHONE = '447403650201'; // format international sans +

  // ————— Utilitaires —————
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const now = () => Date.now();

  const encodeMail = (txt) => encodeURIComponent(txt).replace(/%20/g,'+');
  const encodeWA   = (txt) => encodeURIComponent(txt);

  const trim = (s) => (s||'').toString().trim();
  const digits = (s) => (s||'').replace(/\D+/g,'');

  const phoneLooksValid = (s) => {
    if(!s) return false;
    // Autoriser formats: +32 470 12 34 56, 0032..., ou digits >= 8
    const d = digits(s);
    return d.length >= 8; // simple, robuste
  };

  // Pixel — try sendBeacon, fallback fetch
  function logEvent(event, payload={}){
    try{
      const body = JSON.stringify({
        event,
        ts: now(),
        path: location.pathname+location.hash,
        ref: document.referrer || '',
        ua: navigator.userAgent,
        lang: navigator.language,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screen: {w: screen.width, h: screen.height, dpr: window.devicePixelRatio||1},
        ...payload,
      });
      if(navigator.sendBeacon){
        const blob = new Blob([body], {type: 'application/json'});
        navigator.sendBeacon(PIXEL_ENDPOINT, blob);
      } else {
        fetch(PIXEL_ENDPOINT, {method:'POST', headers:{'Content-Type':'application/json'}, body});
      }
    }catch(e){ /* no-op */ }
  }

  // ————— Éléments —————
  const form = $('#miniForm');
  if(!form){
    console.warn('[Axfinancement.js] Formulaire #miniForm introuvable');
    return;
  }

  // Radios de segmentation
  const rParticulier = $('#modeParticulier');
  const rEntreprise  = $('#modeEntreprise');

  // Champs Particulier
  const fPrenom   = $('#prenom');
  const fNom      = $('#nom');
  const fTel      = $('#telephone');
  const fEmail    = $('#email');

  // Champs Entreprise
  const fSociete  = $('#societe');
  const fContact  = $('#contact');
  const fTelEnt   = $('#telEntreprise');
  const fEmailEnt = $('#emailEntreprise');

  // CTAs
  const ctaEmail  = $('#ctaEmail');
  const ctaWhats  = $('#ctaWhats');
  const ctaNotice = $('#ctaNotice') || {classList:{add(){},remove(){}}};

  // Produit (si présent dans certaines versions HTML)
  function getProduit(){
    const r = $('input[name="produit"]:checked');
    if(r) return r.value; // ex: "un prêt à 2,5 %" / "une subvention" / "je ne sais pas encore"
    return 'je ne sais pas encore';
  }

  function getMode(){
    return (rEntreprise && rEntreprise.checked) ? 'entreprise' : 'particulier';
  }

  function firstInvalid(fields){
    return fields.find(el => !el || !trim(el.value)) || fields.find(el => el && el.type==='email' && !el.value.includes('@')) || fields.find(el => el && el.dataset._phoneInvalid==='1');
  }

  function collectData(){
    const mode = getMode();
    const produit = getProduit();

    if(mode === 'entreprise'){
      const societe = trim(fSociete && fSociete.value);
      const contact = trim(fContact && fContact.value);
      const tel     = trim(fTelEnt && fTelEnt.value);
      const email   = trim(fEmailEnt && fEmailEnt.value);

      return { mode, produit, societe, contact, tel, email };
    }
    // particulier
    const prenom = trim(fPrenom && fPrenom.value);
    const nom    = trim(fNom && fNom.value);
    const tel    = trim(fTel && fTel.value);
    const email  = trim(fEmail && fEmail.value);

    return { mode, produit, prenom, nom, tel, email };
  }

  function validate(){
    const m = getMode();
    let required = [];
    if(m === 'entreprise'){
      required = [fSociete, fTelEnt, fEmailEnt];
    } else {
      required = [fPrenom, fNom, fTel, fEmail];
    }

    // Vérif tel simple
    const telField = (m==='entreprise') ? fTelEnt : fTel;
    if(telField){
      if(!phoneLooksValid(telField.value)) telField.dataset._phoneInvalid = '1';
      else delete telField.dataset._phoneInvalid;
    }

    const bad = firstInvalid(required);
    return { ok: !bad, badEl: bad };
  }

  function buildMessages(data){
    const produit = data.produit || 'je ne sais pas encore';
    if(data.mode === 'entreprise'){
      const whoLine = data.contact ? `Nous sommes ${data.societe}. Je suis ${data.contact}.` : `Nous sommes ${data.societe}.`;
      const body = [
        'Bonjour Axion Partners,',
        `${whoLine}`,
        `Nous souhaitons obtenir ${produit}.`,
        `Voici notre numéro WhatsApp : ${data.tel}.`,
        '',
        'Merci,',
        `${data.societe}`
      ].join('\n');
      const subject = `Ouverture de dossier — ${data.societe}`;
      return { subject, body };
    }

    // particulier
    const fullName = `${data.prenom} ${data.nom}`.trim();
    const body = [
      'Bonjour Axion Partners,',
      `Je suis ${fullName} et je souhaite obtenir ${produit}.`,
      `Voici mon numéro WhatsApp : ${data.tel}. Vous pouvez me contacter dessus.`,
      '',
      'Merci,',
      `${fullName}`
    ].join('\n');
    const subject = `Ouverture de dossier — ${fullName}`;
    return { subject, body };
  }

  function toMailto(subject, body){
    return `mailto:${EMAIL_TO}?subject=${encodeMail(subject)}&body=${encodeMail(body)}`;
  }
  function toWhats(body){
    return `https://api.whatsapp.com/send?phone=${WHATS_PHONE}&text=${encodeWA(body)}`;
  }

  function showNotice(msg){
    if(!ctaNotice) return;
    ctaNotice.textContent = msg || 'Veuillez compléter le mini‑formulaire (nom/société, téléphone et e‑mail).';
    ctaNotice.classList.remove('hidden');
    setTimeout(()=> ctaNotice.classList.add('hidden'), 4000);
  }

  function focusFirstBad(badEl){
    try{ badEl && badEl.focus && badEl.focus(); }catch(e){}
  }

  // ————— CTA handlers —————
  function handleCTA(kind){
    const valid = validate();
    const data  = collectData();

    // Pixel: tentative de clic + statut
    logEvent('cta_click_attempt', { kind, mode: data.mode, produit: data.produit, valid: valid.ok });

    if(!valid.ok){
      showNotice('Veuillez renseigner vos coordonnées avant d\'envoyer.');
      focusFirstBad(valid.badEl);
      logEvent('cta_blocked', { kind });
      return;
    }

    const { subject, body } = buildMessages(data);

    if(kind === 'email'){
      const url = toMailto(subject, body);
      // mailto: doit naviguer dans l\'onglet courant
      location.href = url;
      logEvent('cta_email_opened', { mode: data.mode, produit: data.produit });
    } else {
      const url = toWhats(body);
      window.open(url, '_blank', 'noopener');
      logEvent('cta_whatsapp_opened', { mode: data.mode, produit: data.produit });
    }
  }

  function bindCTAs(){
    if(ctaEmail){
      ctaEmail.addEventListener('click', (e)=>{ e.preventDefault(); handleCTA('email'); });
      ctaEmail.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); handleCTA('email'); } });
    }
    if(ctaWhats){
      ctaWhats.addEventListener('click', (e)=>{ e.preventDefault(); handleCTA('whatsapp'); });
      ctaWhats.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); handleCTA('whatsapp'); } });
    }
  }

  // ————— Segmentation: champs requis dynamiques —————
  function applyRequired(){
    const m = getMode();
    // reset
    [fPrenom,fNom,fTel,fEmail,fSociete,fTelEnt,fEmailEnt].forEach(el=>{ if(el){ el.required = false; } });

    if(m==='entreprise'){
      if(fSociete)  fSociete.required  = true;
      if(fTelEnt)   fTelEnt.required   = true;
      if(fEmailEnt) fEmailEnt.required = true;
    } else {
      if(fPrenom) fPrenom.required = true;
      if(fNom)    fNom.required    = true;
      if(fTel)    fTel.required    = true;
      if(fEmail)  fEmail.required  = true;
    }
  }

  function bindSegmentation(){
    [rParticulier, rEntreprise].forEach(r=>{
      if(!r) return;
      r.addEventListener('change', ()=>{
        applyRequired();
        logEvent('segment_change', { mode: getMode() });
      });
    });
    applyRequired(); // initial
  }

  // ————— Form progress + validation douce —————
  let progressTimer = null;
  function scheduleProgressPing(){
    clearTimeout(progressTimer);
    progressTimer = setTimeout(()=>{
      const d = collectData();
      const filled = Object.entries(d).filter(([k,v])=> !!v && !['mode','produit'].includes(k)).length;
      logEvent('form_progress', { mode: d.mode, produit: d.produit, filled });
    }, 1200);
  }

  function bindFormInputs(){
    const inputs = $$('#miniForm input');
    inputs.forEach(el=>{
      el.addEventListener('input', scheduleProgressPing);
      el.addEventListener('change', scheduleProgressPing);
    });
  }

  // ————— Scroll depth & sections —————
  let maxDepth = 0;
  function onScroll(){
    const d = Math.floor((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100);
    if(d > maxDepth){
      maxDepth = d;
      const marks = [25,50,75,90];
      marks.forEach(m=>{ if(d>=m && maxDepth===d) logEvent('scroll_depth', { depth:m }); });
    }
  }

  function bindScroll(){
    window.addEventListener('scroll', throttle(onScroll, 600));
    onScroll();
  }

  // Throttle helper
  function throttle(fn, wait){
    let last = 0, timer;
    return function(...args){
      const t = now();
      if(t - last >= wait){ last = t; fn.apply(this,args); }
      else if(!timer){ timer = setTimeout(()=>{ last = now(); timer=null; fn.apply(this,args); }, wait - (t-last)); }
    };
  }

  // ————— Section read-time via IntersectionObserver —————
  const sections = [
    {el: $('.hero'), key:'hero'},
    {el: $('#miniForm'), key:'form'},
    {el: $('#temoignages'), key:'temoignages'},
    {el: $('#faq'), key:'faq'},
  ].filter(x=>x.el);

  const timers = {};
  function startTimer(key){ timers[key] = now(); }
  function stopTimer(key){ if(timers[key]){ const dt = Math.round((now()-timers[key])/1000); logEvent('section_time', { section:key, seconds: dt }); delete timers[key]; } }

  function bindSectionObserver(){
    if(!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        const key = e.target.getAttribute('data-section-key');
        if(!key) return;
        if(e.isIntersecting){ startTimer(key); }
        else { stopTimer(key); }
      });
    }, {threshold: 0.6});

    sections.forEach(({el,key})=>{ el.setAttribute('data-section-key', key); io.observe(el); });
  }

  // ————— Abandon & déchargement —————
  const t0 = now();
  function sendExit(){
    const t = Math.round((now()-t0)/1000);
    const d = collectData();
    const valid = validate().ok;
    logEvent('page_exit', { seconds:t, mode:d.mode, produit:d.produit, form_valid: valid });
  }
  window.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') sendExit(); });
  window.addEventListener('beforeunload', sendExit);

  // ————— Init —————
  function init(){
    bindSegmentation();
    bindFormInputs();
    bindCTAs();
    bindScroll();
    bindSectionObserver();

    logEvent('page_open', {
      mode:getMode(),
      produit:getProduit(),
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
