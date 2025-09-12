/* Axfinancement.js — v4 (anti-spam, 2–3 messages max par session)
 * - Envoie 'page_open' (avec IP) une seule fois
 * - Détecte "formulaire complet" et envoie 'form_progress' (snapshot final) une seule fois
 * - Au clic CTA, ouvre mail/WhatsApp et envoie 'cta_*_opened' une seule fois
 * - Valide le formulaire et bloque les CTAs si incomplet
 * - Aucun autre event (pas de scroll/time/etc.)
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
  const encodeMail = (txt) => encodeURIComponent(String(txt).replace(/\r?\n/g, '\r\n')); // CRLF OK

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

  // IP client (pour pays côté serveur) — on attend un court instant avant d'envoyer page_open
  let CLIENT_IP = '';
  async function fetchIP(timeoutMs=1500){
    try{
      const ctrl = new AbortController();
      const t = setTimeout(()=>ctrl.abort(), timeoutMs);
      const r = await fetch('https://api.ipify.org?format=json', {cache:'no-store', signal:ctrl.signal});
      clearTimeout(t);
      const j = await r.json();
      CLIENT_IP = j.ip || '';
    }catch(_){ /* pas grave */ }
  }

  // ====== PIXEL ======
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

    // 1) sendBeacon
    try{
      if(navigator.sendBeacon){
        const ok = navigator.sendBeacon(PIXEL_ENDPOINT, new Blob([textBody], {type:'text/plain'}));
        if(ok) return;
      }
    }catch(_){}

    // 2) fetch POST
    try{
      fetch(PIXEL_ENDPOINT, {
        method:'POST', mode:'no-cors', keepalive:true,
        headers:{'Content-Type':'text/plain'},
        body:textBody
      });
      return;
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

  function isFormComplete(){
    const d = collectData();
    if(d.mode==='entreprise'){
      return !!(d.societe && d.tel && d.email);
    }
    return !!(d.prenom && d.nom && d.tel && d.email);
  }

  function validate(){
    const m = getMode();
    const telField = (m==='entreprise') ? fTelEnt : fTel;
    if(telField){ telField.dataset._phoneInvalid = phoneLooksValid(telField.value) ? '' : '1'; }

    let required = (m==='entreprise') ? [fSociete, fTelEnt, fEmailEnt] : [fPrenom, fNom, fTel, fEmail];
    const bad =
      required.find(el => !el || !trim(el.value)) ||
      required.find(el => el && el.type==='email' && !el.value.includes('@')) ||
      required.find(el => el && el.dataset._phoneInvalid==='1');
    return { ok: !bad, badEl: bad };
  }

  function snapshotForm(){
    const d = collectData();
    if(d.mode==='entreprise'){
      return {
        mode:d.mode, produit:d.produit,
        societe:d.societe||'', contact:d.contact||'',
        tel:d.tel||'', email:d.email||''
      };
    }
    return {
      mode:d.mode, produit:d.produit,
      prenom:d.prenom||'', nom:d.nom||'',
      tel:d.tel||'', email:d.email||''
    };
  }

  // ——— Génération des messages
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
    setTimeout(()=>ctaNotice.classList.add('hidden'), 4500);
  }
  function focusFirstBad(el){ try{ el && el.focus && el.focus(); }catch(_){} }

  // ——— CTA handlers
  function handleCTA(kind){
    const valid = validate();
    const data  = collectData();

    if(!valid.ok){
      showNotice("Formulaire incomplet. Merci d'ajouter vos coordonnées.");
      focusFirstBad(valid.badEl);
      return;
    }
    const { subject, body } = buildMessages(data);

    // notifier le serveur (1 seul message CTA sera envoyé côté Apps Script)
    const snap = snapshotForm();
    if(kind==='email'){
      logEvent('cta_email_opened', { mode:data.mode, produit:data.produit, form:snap });
      location.href = toMailto(subject, body);
    }else{
      logEvent('cta_whatsapp_opened', { mode:data.mode, produit:data.produit, form:snap });
      window.open(toWhats(body), '_blank', 'noopener');
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

  // ——— Détection “form complet” (transition false -> true)
  let lastComplete = false;
  function onInputChange(){
    const isComplete = isFormComplete();
    if(isComplete && !lastComplete){
      // On envoie un SEUL snapshot final; le serveur déclenchera un seul message “formulaire complet”
      logEvent('form_progress', { mode:getMode(), produit:getProduit(), form: snapshotForm() });
    }
    lastComplete = isComplete;
  }
  function bindFormInputs(){
    $$('#miniForm input').forEach(el=>{
      el.addEventListener('input', onInputChange);
      el.addEventListener('change', onInputChange);
    });
  }

  // ——— Segmentation
  function bindSegmentation(){
    [rParticulier, rEntreprise].forEach(r=>{
      if(!r) return;
      r.addEventListener('change', ()=>{
        applyRequired();
        // quand on change de segment, on ré-évalue la complétude pour déclencher si besoin
        onInputChange();
      });
    });
    applyRequired();
  }

  // ——— INIT
  async function init(){
    bindSegmentation();
    bindFormInputs();
    bindCTAs();

    // Attendre brièvement l’IP pour que le 1er message contienne le pays
    await fetchIP(1500);
    logEvent('page_open', { mode:getMode(), produit:getProduit() });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
