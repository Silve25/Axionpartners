/* Axfinancement.js — v3
 * - Valide le mini-formulaire (Particulier / Entreprise)
 * - Génère les messages E-mail & WhatsApp (CRLF corrects)
 * - Bloque les CTAs si incomplet (+ notice)
 * - Pixel robuste vers Apps Script (batch côté serveur) avec sid + ip
 * - Mesure scroll, temps par section, progression formulaire, clics clés
 */
(function(){
  'use strict';

  // ====== CONFIG ======
  const PIXEL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyAks9NK0jJH03CjpYbw_DyKEDf8bU6g8lZ_zGbC-hgTc37WFVZv1bth171R41C8pbj_A/exec';
  const EMAIL_TO = 'Contact@axionpartners.eu';
  const WHATS_PHONE = '447403650201'; // sans '+'
  const SID_STORAGE_KEY = 'axion_sid';

  // ====== UTILS ======
  const $  = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
  const now = () => Date.now();
  const trim = (s) => (s||'').toString().trim();
  const digits = (s) => (s||'').replace(/\D+/g,'');
  const encodeWA   = (txt) => encodeURIComponent(txt);
  const encodeMail = (txt) => encodeURIComponent(String(txt).replace(/\r?\n/g, '\r\n'));
  const throttle = (fn, wait=600) => {
    let last=0, tmr=null;
    return (...a)=>{ const t=now(); if(t-last>=wait){ last=t; fn.apply(null,a); }
      else if(!tmr){ tmr=setTimeout(()=>{ last=now(); tmr=null; fn.apply(null,a); }, wait-(t-last)); } };
  };

  // Session ID (stable pour l’onglet)
  function getSID(){
    try{
      const ss = window.sessionStorage;
      let sid = ss.getItem(SID_STORAGE_KEY);
      if(!sid){ sid = (Date.now().toString(36)+Math.random().toString(36).slice(2,10)); ss.setItem(SID_STORAGE_KEY, sid); }
      return sid;
    }catch(_){
      return (Date.now().toString(36)+Math.random().toString(36).slice(2,10));
    }
  }
  const SID = getSID();

  // IP client (pour pays côté serveur)
  let CLIENT_IP = '';
  (async function fetchIP(){
    try{
      const r = await fetch('https://api.ipify.org?format=json',{cache:'no-store'});
      const j = await r.json();
      CLIENT_IP = j.ip || '';
    }catch(_){}
  })();

  // ====== PIXEL ROBUSTE ======
  function b64(str){ try{ return btoa(unescape(encodeURIComponent(str))); }catch(_){ return ''; } }
  function logEvent(event, payload={}){
    const bodyObj = {
      event,
      ts: now(),
      sid: SID,
      ip: CLIENT_IP || undefined,
      href: location.href,
      path: location.pathname+location.hash,
      ref: document.referrer || '',
      ua: navigator.userAgent,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio||1 },
      ...payload,
    };
    const textBody = JSON.stringify(bodyObj);

    // 1) sendBeacon (text/plain)
    try{
      if(navigator.sendBeacon){
        const ok = navigator.sendBeacon(PIXEL_ENDPOINT, new Blob([textBody], {type:'text/plain'}));
        if(ok) return;
      }
    }catch(_){}

    // 2) fetch POST no-cors keepalive
    try{
      fetch(PIXEL_ENDPOINT, {
        method:'POST', mode:'no-cors', keepalive:true,
        headers:{'Content-Type':'text/plain'},
        body:textBody
      });
    }catch(_){}

    // 3) GET fallback
    try{
      const img = new Image();
      img.src = `${PIXEL_ENDPOINT}?v=1&data=${encodeURIComponent(b64(textBody))}`;
    }catch(_){}
  }

  // ====== FORM & CTAs ======
  const form = $('#miniForm');
  if(!form){ console.warn('[Axfinancement] #miniForm introuvable'); return; }

  const rParticulier = $('#modeParticulier');
  const rEntreprise  = $('#modeEntreprise');

  // Particulier
  const fPrenom = $('#prenom');
  const fNom    = $('#nom');
  const fTel    = $('#telephone');
  const fEmail  = $('#email');

  // Entreprise
  const fSociete  = $('#societe');
  const fContact  = $('#contact');
  const fTelEnt   = $('#telEntreprise');
  const fEmailEnt = $('#emailEntreprise');

  // CTAs
  const ctaEmail  = $('#ctaEmail');
  const ctaWhats  = $('#ctaWhats');
  const ctaNotice = $('#ctaNotice');

  function getMode(){ return (rEntreprise && rEntreprise.checked) ? 'entreprise' : 'particulier'; }
  function getProduit(){
    const r = $('input[name="produit"]:checked');
    return r ? r.value : 'je ne sais pas encore';
  }
  function phoneLooksValid(s){ return digits(s).length >= 8; }

  function applyRequired(){
    const m = getMode();
    [fPrenom,fNom,fTel,fEmail,fSociete,fTelEnt,fEmailEnt].forEach(el=>{ if(el) el.required=false; });
    if(m==='entreprise'){ if(fSociete) fSociete.required=true; if(fTelEnt) fTelEnt.required=true; if(fEmailEnt) fEmailEnt.required=true; }
    else { if(fPrenom) fPrenom.required=true; if(fNom) fNom.required=true; if(fTel) fTel.required=true; if(fEmail) fEmail.required=true; }
  }
  function collectData(){
    const mode = getMode();
    const produit = getProduit();
    if(mode==='entreprise'){
      return {
        mode, produit,
        societe: trim(fSociete && fSociete.value),
        contact: trim(fContact && fContact.value),
        tel:     trim(fTelEnt && fTelEnt.value),
        email:   trim(fEmailEnt && fEmailEnt.value),
      };
    }
    return {
      mode, produit,
      prenom: trim(fPrenom && fPrenom.value),
      nom:    trim(fNom && fNom.value),
      tel:    trim(fTel && fTel.value),
      email:  trim(fEmail && fEmail.value),
    };
  }
  function firstInvalid(fields){
    return fields.find(el => !el || !trim(el.value))
        || fields.find(el => el && el.type==='email' && !el.value.includes('@'))
        || fields.find(el => el && el.dataset._phoneInvalid==='1');
  }
  function validate(){
    const m = getMode();
    let required = (m==='entreprise') ? [fSociete, fTelEnt, fEmailEnt] : [fPrenom, fNom, fTel, fEmail];

    const telField = (m==='entreprise') ? fTelEnt : fTel;
    if(telField){ telField.dataset._phoneInvalid = phoneLooksValid(telField.value) ? '' : '1'; }

    const bad = firstInvalid(required);
    return { ok: !bad, badEl: bad };
  }
  function buildMessages(d){
    const produit = d.produit || 'je ne sais pas encore';
    if(d.mode==='entreprise'){
      const who = d.contact ? `Nous sommes ${d.societe}. Je suis ${d.contact}.` : `Nous sommes ${d.societe}.`;
      const body =
`Bonjour Axion Partners,
${who}
Nous souhaitons obtenir ${produit}.
Voici notre numéro WhatsApp : ${d.tel}.

Merci,
${d.societe}`;
      return { subject:`Ouverture de dossier — ${d.societe}`, body };
    }
    const fullName = `${d.prenom} ${d.nom}`.trim();
    const body =
`Bonjour Axion Partners,
Je suis ${fullName} et je souhaite obtenir ${produit}.
Voici mon numéro WhatsApp : ${d.tel}. Vous pouvez me contacter dessus.

Merci,
${fullName}`;
    return { subject:`Ouverture de dossier — ${fullName}`, body };
  }
  function toMailto(subject, body){
    return `mailto:${EMAIL_TO}?subject=${encodeMail(subject)}&body=${encodeMail(body)}`;
  }
  function toWhats(body){
    return `https://api.whatsapp.com/send?phone=${WHATS_PHONE}&text=${encodeWA(body)}`;
  }
  function showNotice(msg){
    if(!ctaNotice) return;
    ctaNotice.textContent = msg || 'Veuillez compléter le mini-formulaire (nom/société, téléphone, e-mail).';
    ctaNotice.classList.remove('hidden');
    setTimeout(()=>ctaNotice.classList.add('hidden'), 5000);
  }
  function focusFirstBad(el){ try{ el && el.focus && el.focus(); }catch(_){} }

  function handleCTA(kind){
    const valid = validate();
    const data  = collectData();

    logEvent('cta_click_attempt', { mode:data.mode, produit:data.produit, valid:valid.ok });

    if(!valid.ok){
      showNotice("Formulaire incomplet. Merci d'ajouter vos coordonnées.");
      focusFirstBad(valid.badEl);
      logEvent('cta_blocked', { kind });
      return;
    }
    const { subject, body } = buildMessages(data);
    if(kind==='email'){
      location.href = toMailto(subject, body);
      logEvent('cta_email_opened', { mode:data.mode, produit:data.produit, form: snapshotForm() });
    }else{
      window.open(toWhats(body), '_blank', 'noopener');
      logEvent('cta_whatsapp_opened', { mode:data.mode, produit:data.produit, form: snapshotForm() });
    }
  }

  function bindCTAs(){
    if(ctaEmail){
      ctaEmail.addEventListener('click',  e=>{ e.preventDefault(); handleCTA('email'); });
      ctaEmail.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); handleCTA('email'); }});
    }
    if(ctaWhats){
      ctaWhats.addEventListener('click',  e=>{ e.preventDefault(); handleCTA('whatsapp'); });
      ctaWhats.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); handleCTA('whatsapp'); }});
    }
  }

  // ====== PROGRESSION FORM & SNAPSHOT ======
  function snapshotForm(){
    const d = collectData();
    if(d.mode==='entreprise'){
      return {
        mode:d.mode, produit:d.produit,
        societe:d.societe || '', contact:d.contact || '',
        tel:(d.tel||''), email:(d.email||'')
      };
    }
    return {
      mode:d.mode, produit:d.produit,
      prenom:(d.prenom||''), nom:(d.nom||''),
      tel:(d.tel||''), email:(d.email||'')
    };
  }

  let progTimer=null, lastProgSent=0;
  function scheduleProgress(){
    clearTimeout(progTimer);
    progTimer = setTimeout(()=>{
      const d  = collectData();
      const filled = Object.entries(d).filter(([k,v])=> !!v && !['mode','produit'].includes(k)).length;
      const snap = snapshotForm();
      // n’envoie pas plus d’un progress toutes les 10 s
      const t = now();
      if(t - lastProgSent > 10000){
        logEvent('form_progress', { mode:d.mode, produit:d.produit, filled, form:snap });
        lastProgSent = t;
      }
    }, 1200);
  }
  function bindFormInputs(){
    $$('#miniForm input').forEach(el=>{
      el.addEventListener('input', scheduleProgress);
      el.addEventListener('change', scheduleProgress);
    });
  }

  // Segment change
  function bindSegmentation(){
    [rParticulier, rEntreprise].forEach(r=>{
      if(!r) return;
      r.addEventListener('change', ()=>{
        applyRequired();
        logEvent('segment_change', { mode:getMode() });
      });
    });
    applyRequired();
  }

  // ====== SCROLL & SECTIONS ======
  let maxDepth=0;
  function onScroll(){
    const d = Math.floor((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100);
    if(d > maxDepth){
      maxDepth = d;
      [25,50,75,90].forEach(m => { if(d>=m && maxDepth===d) logEvent('scroll_depth', { depth:m }); });
    }
  }
  function bindScroll(){ window.addEventListener('scroll', throttle(onScroll,600)); onScroll(); }

  // Section time
  const sections = [
    {el: $('.hero'), key:'hero'},
    {el: $('#miniForm'), key:'form'},
    {el: $('#temoignages'), key:'temoignages'},
    {el: $('#faq'), key:'faq'},
  ].filter(x=>x.el);
  const timers={};
  function startTimer(k){ timers[k]=now(); }
  function stopTimer(k){ if(timers[k]){ const dt=Math.round((now()-timers[k])/1000); logEvent('section_time',{ section:k, seconds:dt }); delete timers[k]; } }
  function bindSectionObserver(){
    if(!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        const key = e.target.getAttribute('data-section-key');
        if(!key) return;
        if(e.isIntersecting) startTimer(key); else stopTimer(key);
      });
    }, {threshold:0.6});
    sections.forEach(({el,key})=>{ el.setAttribute('data-section-key',key); io.observe(el); });
  }

  // Clic logo (retour accueil)
  const logoLink = document.querySelector('header a[href="/"]');
  if(logoLink){
    logoLink.addEventListener('click', ()=> logEvent('ui_click', { target:'logo_home' }));
  }

  // ====== EXIT ======
  const T0 = now();
  function sendExit(){
    const d = collectData();
    const dt = Math.round((now()-T0)/1000);
    logEvent('page_exit', { mode:d.mode, produit:d.produit, seconds:dt, form_valid: validate().ok, form: snapshotForm() });
  }
  window.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') sendExit(); });
  window.addEventListener('beforeunload', sendExit);

  // ====== INIT ======
  function init(){
    bindSegmentation();
    bindFormInputs();
    bindCTAs();
    bindScroll();
    bindSectionObserver();
    logEvent('page_open', { mode:getMode(), produit:getProduit() });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
