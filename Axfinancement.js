'use strict';
/**
 * Axfinancement.js — v2
 * - Mailto encodé proprement (espaces = %20, CRLF = %0D%0A)
 * - WhatsApp inchangé
 * - Pixel : sendBeacon(text/plain) + fetch(no-cors, keepalive) + GET image fallback
 * - Validation & CTAs inchangés
 */
(function(){
  // === Constantes ===
  const PIXEL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwTUY2U3Tw2KOCLyBAckwoKSQw7Bn3itpttkwPwxwt8PsmCyInOq5OlXqgjgR0907JCxA/exec';
  const EMAIL_TO = 'Contact@axionpartners.eu';
  const WHATS_PHONE = '447403650201'; // format international sans '+'

  // === Utils ===
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const now = () => Date.now();
  const trim = (s) => (s||'').toString().trim();
  const digits = (s) => (s||'').replace(/\D+/g,'');

  // Encodage mailto (ne pas convertir espace -> '+', forcer CRLF)
  const encodeMail = (txt) => encodeURIComponent(txt.replace(/\r?\n/g, '\r\n'));
  const encodeWA   = (txt) => encodeURIComponent(txt);

  const phoneLooksValid = (s) => {
    if(!s) return false;
    return digits(s).length >= 8; // simple et robuste
  };

  // Base64 pour fallback GET
  function b64(str){
    try { return btoa(unescape(encodeURIComponent(str))); }
    catch(_) { return ''; }
  }

  // === Pixel robuste (3 voies) ===
  function logEvent(event, payload={}){
    const bodyObj = {
      event,
      ts: now(),
      path: location.pathname + location.hash,
      href: location.href,
      ref: document.referrer || '',
      ua: navigator.userAgent,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio||1 },
      ...payload,
    };
    const textBody = JSON.stringify(bodyObj);

    // 1) sendBeacon (text/plain pour éviter le préflight)
    try{
      if(navigator.sendBeacon){
        const ok = navigator.sendBeacon(PIXEL_ENDPOINT, new Blob([textBody], {type:'text/plain'}));
        if(ok) return;
      }
    }catch(e){/* noop */}

    // 2) fetch POST no-cors (keepalive pour avant déchargement)
    try{
      fetch(PIXEL_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        headers: { 'Content-Type':'text/plain' },
        body: textBody
      });
    }catch(e){/* noop */}

    // 3) GET image fallback (nécessite doGet côté Apps Script)
    try{
      const img = new Image();
      img.src = `${PIXEL_ENDPOINT}?v=1&data=${encodeURIComponent(b64(textBody))}`;
    }catch(e){/* noop */}
  }

  // === Références DOM ===
  const form = $('#miniForm');
  if(!form){ console.warn('[Axfinancement.js] #miniForm introuvable'); return; }

  const rParticulier = $('#modeParticulier');
  const rEntreprise  = $('#modeEntreprise');

  // Particulier
  const fPrenom   = $('#prenom');
  const fNom      = $('#nom');
  const fTel      = $('#telephone');
  const fEmail    = $('#email');

  // Entreprise
  const fSociete  = $('#societe');
  const fContact  = $('#contact');
  const fTelEnt   = $('#telEntreprise');
  const fEmailEnt = $('#emailEntreprise');

  // CTAs
  const ctaEmail  = $('#ctaEmail');
  const ctaWhats  = $('#ctaWhats');
  const ctaNotice = $('#ctaNotice');

  // Produit
  function getProduit(){
    const r = $('input[name="produit"]:checked');
    return r ? r.value : 'je ne sais pas encore';
  }
  function getMode(){
    return (rEntreprise && rEntreprise.checked) ? 'entreprise' : 'particulier';
  }

  function firstInvalid(fields){
    return fields.find(el => !el || !trim(el.value))
        || fields.find(el => el && el.type==='email' && !el.value.includes('@'))
        || fields.find(el => el && el.dataset._phoneInvalid==='1');
  }

  function collectData(){
    const mode = getMode();
    const produit = getProduit();

    if(mode === 'entreprise'){
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

  function validate(){
    const m = getMode();
    let required = (m === 'entreprise')
      ? [fSociete, fTelEnt, fEmailEnt]
      : [fPrenom, fNom, fTel, fEmail];

    // tél
    const telField = (m==='entreprise') ? fTelEnt : fTel;
    if(telField){
      if(!phoneLooksValid(telField.value)) telField.dataset._phoneInvalid = '1';
      else delete telField.dataset._phoneInvalid;
    }

    const bad = firstInvalid(required);
    return { ok: !bad, badEl: bad };
  }

  // === Messages ===
  function buildMessages(data){
    const produit = data.produit || 'je ne sais pas encore';

    if(data.mode === 'entreprise'){
      const whoLine = data.contact
        ? `Nous sommes ${data.societe}. Je suis ${data.contact}.`
        : `Nous sommes ${data.societe}.`;

      const body =
`Bonjour Axion Partners,
${whoLine}
Nous souhaitons obtenir ${produit}.
Voici notre numéro WhatsApp : ${data.tel}.

Merci,
${data.societe}`;

      const subject = `Ouverture de dossier — ${data.societe}`;
      return { subject, body };
    }

    // particulier
    const fullName = `${data.prenom} ${data.nom}`.trim();
    const body =
`Bonjour Axion Partners,
Je suis ${fullName} et je souhaite obtenir ${produit}.
Voici mon numéro WhatsApp : ${data.tel}. Vous pouvez me contacter dessus.

Merci,
${fullName}`;
    const subject = `Ouverture de dossier — ${fullName}`;
    return { subject, body };
  }

  function toMailto(subject, body){
    const subj = encodeMail(subject);
    const bod  = encodeMail(body);
    return `mailto:${EMAIL_TO}?subject=${subj}&body=${bod}`;
  }
  function toWhats(body){
    return `https://api.whatsapp.com/send?phone=${WHATS_PHONE}&text=${encodeWA(body)}`;
  }

  // === UI helpers ===
  function showNotice(msg){
    if(!ctaNotice) return;
    ctaNotice.textContent = msg || 'Veuillez remplir le mini-formulaire (nom/société, téléphone, e-mail).';
    ctaNotice.classList.remove('hidden');
    // laisse visible 5s pour qu’on le voie vraiment
    setTimeout(()=> ctaNotice.classList.add('hidden'), 5000);
  }
  function focusFirstBad(badEl){
    try{ badEl && badEl.focus && badEl.focus(); }catch(_){}
  }

  // === CTA ===
  function handleCTA(kind){
    const valid = validate();
    const data  = collectData();

    logEvent('cta_click_attempt', { kind, mode: data.mode, produit: data.produit, valid: valid.ok });

    if(!valid.ok){
      showNotice("Formulaire incomplet. Merci d'ajouter vos coordonnées.");
      focusFirstBad(valid.badEl);
      logEvent('cta_blocked', { kind });
      return;
    }

    const { subject, body } = buildMessages(data);

    if(kind === 'email'){
      const url = toMailto(subject, body);
      location.href = url; // mail client
      logEvent('cta_email_opened', { mode: data.mode, produit: data.produit });
    } else {
      const url = toWhats(body);
      window.open(url, '_blank', 'noopener');
      logEvent('cta_whatsapp_opened', { mode: data.mode, produit: data.produit });
    }
  }

  function bindCTAs(){
    if(ctaEmail){
      ctaEmail.addEventListener('click',  (e)=>{ e.preventDefault(); handleCTA('email'); });
      ctaEmail.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); handleCTA('email'); }});
    }
    if(ctaWhats){
      ctaWhats.addEventListener('click',  (e)=>{ e.preventDefault(); handleCTA('whatsapp'); });
      ctaWhats.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); handleCTA('whatsapp'); }});
    }
  }

  // === Required dynamiques (UX) ===
  function applyRequired(){
    const m = getMode();
    [fPrenom,fNom,fTel,fEmail,fSociete,fTelEnt,fEmailEnt].forEach(el=>{ if(el) el.required=false; });
    if(m==='entreprise'){ if(fSociete) fSociete.required=true; if(fTelEnt) fTelEnt.required=true; if(fEmailEnt) fEmailEnt.required=true; }
    else { if(fPrenom) fPrenom.required=true; if(fNom) fNom.required=true; if(fTel) fTel.required=true; if(fEmail) fEmail.required=true; }
  }
  function bindSegmentation(){
    [rParticulier,rEntreprise].forEach(r=>{
      if(!r) return;
      r.addEventListener('change', ()=>{ applyRequired(); logEvent('segment_change', { mode:getMode() }); });
    });
    applyRequired();
  }

  // === Progress pings ===
  let progressTimer = null;
  function scheduleProgressPing(){
    clearTimeout(progressTimer);
    progressTimer = setTimeout(()=>{
      const d = collectData();
      const filled = Object.entries(d).filter(([k,v])=> !!v && !['mode','produit'].includes(k)).length;
      logEvent('form_progress', { mode:d.mode, produit:d.produit, filled });
    }, 1200);
  }
  function bindFormInputs(){
    $$('#miniForm input').forEach(el=>{
      el.addEventListener('input', scheduleProgressPing);
      el.addEventListener('change', scheduleProgressPing);
    });
  }

  // === Scroll depth ===
  let maxDepth = 0;
  function onScroll(){
    const d = Math.floor((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100);
    if(d > maxDepth){
      maxDepth = d;
      [25,50,75,90].forEach(m=>{ if(d>=m && maxDepth===d) logEvent('scroll_depth', { depth:m }); });
    }
  }
  function bindScroll(){
    window.addEventListener('scroll', throttle(onScroll, 600));
    onScroll();
  }
  function throttle(fn, wait){
    let last = 0, tmr;
    return function(...args){
      const t = now();
      if(t - last >= wait){ last = t; fn.apply(this,args); }
      else if(!tmr){ tmr = setTimeout(()=>{ last = now(); tmr=null; fn.apply(this,args); }, wait - (t-last)); }
    };
  }

  // === Time-in-section ===
  const sections = [
    {el: $('.hero'), key:'hero'},
    {el: $('#miniForm'), key:'form'},
    {el: $('#temoignages'), key:'temoignages'},
    {el: $('#faq'), key:'faq'},
  ].filter(x=>x.el);
  const timers = {};
  function startTimer(k){ timers[k] = now(); }
  function stopTimer(k){ if(timers[k]){ const dt = Math.round((now()-timers[k])/1000); logEvent('section_time', { section:k, seconds:dt }); delete timers[k]; } }
  function bindSectionObserver(){
    if(!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        const key = e.target.getAttribute('data-section-key');
        if(!key) return;
        if(e.isIntersecting) startTimer(key);
        else stopTimer(key);
      });
    }, {threshold:0.6});
    sections.forEach(({el,key})=>{ el.setAttribute('data-section-key', key); io.observe(el); });
  }

  // === Exit ===
  const t0 = now();
  function sendExit(){
    const d  = collectData();
    const dt = Math.round((now()-t0)/1000);
    logEvent('page_exit', { seconds:dt, mode:d.mode, produit:d.produit, form_valid: validate().ok });
  }
  window.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') sendExit(); });
  window.addEventListener('beforeunload', sendExit);

  // === Init ===
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
