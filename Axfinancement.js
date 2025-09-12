/* Axfinancement.js — 3 événements max par visiteur
 * 1) page_open (avec IP si dispo)
 * 2) form_complete (une fois)
 * 3) cta (premier clic Email OU WhatsApp)
 *
 * Nécessite dans le HTML :
 *  - form#miniForm, radios #modeParticulier / #modeEntreprise
 *  - champs Particulier: #prenom #nom #telephone #email
 *  - champs Entreprise : #societe #contact #telEntreprise #emailEntreprise
 *  - CTAs: #ctaEmail #ctaWhats
 *  - avis/notice (optionnel): #ctaNotice
 */

(function(){
  'use strict';

  /* ===== CONFIG ===== */
  const PIXEL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyAks9NK0jJH03CjpYbw_DyKEDf8bU6g8lZ_zGbC-hgTc37WFVZv1bth171R41C8pbj_A/exec';
  const EMAIL_TO   = 'Contact@axionpartners.eu';
  const WHATS_APP  = '447403650201'; // sans '+'

  const SS_KEYS = {
    SID:      'ax_sid',
    SENT_OPEN:'ax_sent_open',
    SENT_FORM:'ax_sent_form',
    SENT_CTA: 'ax_sent_cta',
  };

  /* ===== UTILS ===== */
  const $  = (s,root=document)=>root.querySelector(s);
  const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));
  const now = ()=>Date.now();
  const trim = (s)=> (s||'').toString().trim();
  const digits = (s)=> (s||'').replace(/\D+/g,'');

  const encodeWA   = (txt)=> encodeURIComponent(txt);
  const encodeMail = (txt)=> encodeURIComponent(String(txt).replace(/\r?\n/g, '\r\n'));

  function ssGet(k){ try{return sessionStorage.getItem(k);}catch(_){return null;} }
  function ssSet(k,v){ try{ sessionStorage.setItem(k,v);}catch(_){ } }

  function getSID(){
    let sid = ssGet(SS_KEYS.SID);
    if(!sid){
      sid = (Date.now().toString(36)+Math.random().toString(36).slice(2,10));
      ssSet(SS_KEYS.SID, sid);
    }
    return sid;
  }
  const SID = getSID();

  // IP rapide (best effort)
  let CLIENT_IP = '';
  async function fetchIP(timeoutMs=1200){
    try{
      const ctrl = new AbortController();
      const t = setTimeout(()=>ctrl.abort(), timeoutMs);
      const r = await fetch('https://api.ipify.org?format=json', {signal:ctrl.signal, cache:'no-store'});
      clearTimeout(t);
      const j = await r.json();
      CLIENT_IP = j && j.ip || '';
    }catch(_){}
  }

  // Envoi unique (sendBeacon > fetch > img)
  function logEvent(event, payload={}){
    const body = JSON.stringify({
      event, ts: now(), sid: SID,
      ip: CLIENT_IP || undefined,
      href: location.href,
      path: location.pathname+location.hash,
      ref: document.referrer || '',
      ua: navigator.userAgent,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio||1 },
      ...payload,
    });

    try{
      if(navigator.sendBeacon){
        const ok = navigator.sendBeacon(PIXEL_ENDPOINT, new Blob([body], {type:'text/plain'}));
        if(ok) return;
      }
    }catch(_){}

    try{
      fetch(PIXEL_ENDPOINT, {
        method:'POST', mode:'no-cors', keepalive:true,
        headers:{'Content-Type':'text/plain'},
        body
      });
    }catch(_){
      try{
        const img = new Image();
        img.src = `${PIXEL_ENDPOINT}?v=1&data=${encodeURIComponent(btoa(unescape(encodeURIComponent(body))))}`;
      }catch(__){}
    }
  }

  /* ===== FORM / CTAs ===== */
  const form = $('#miniForm');
  if(!form){ console.warn('[Axfinancement] Formulaire #miniForm introuvable'); return; }

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

  // Produit (radios optionnels)
  function getProduit(){
    const r = $('input[name="produit"]:checked');
    return r ? r.value : 'je ne sais pas encore';
  }
  function getMode(){ return (rEntreprise && rEntreprise.checked) ? 'entreprise' : 'particulier'; }
  function phoneLooksValid(s){ return digits(s).length >= 8; }

  function applyRequired(){
    const m = getMode();
    [fPrenom,fNom,fTel,fEmail,fSociete,fTelEnt,fEmailEnt].forEach(el=>{ if(el) el.required=false; });
    if(m==='entreprise'){
      if(fSociete)  fSociete.required  = true;
      if(fTelEnt)   fTelEnt.required   = true;
      if(fEmailEnt) fEmailEnt.required = true;
    }else{
      if(fPrenom) fPrenom.required = true;
      if(fNom)    fNom.required    = true;
      if(fTel)    fTel.required    = true;
      if(fEmail)  fEmail.required  = true;
    }
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

  function validateComplete(){
    const m = getMode();
    if(m==='entreprise'){
      return !!(trim(fSociete?.value) && phoneLooksValid(fTelEnt?.value) && trim(fEmailEnt?.value));
    }
    return !!(trim(fPrenom?.value) && trim(fNom?.value) && phoneLooksValid(fTel?.value) && trim(fEmail?.value));
  }

  // Messages e-mail / WhatsApp bien formatés
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
    const fullName = `${d.prenom} ${d.nom}`.replace(/\s+/g,' ').trim();
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
    return `https://api.whatsapp.com/send?phone=${WHATS_APP}&text=${encodeWA(body)}`;
  }

  // Notice
  const ctaNotice = $('#ctaNotice');
  function showNotice(msg){
    if(!ctaNotice) return;
    ctaNotice.textContent = msg || 'Merci de compléter le formulaire (coordonnées).';
    ctaNotice.classList.remove('hidden');
    setTimeout(()=>ctaNotice.classList.add('hidden'), 4000);
  }

  // CTA handlers — un seul envoi “cta” (premier clic)
  const ctaEmail = $('#ctaEmail');
  const ctaWhats = $('#ctaWhats');

  function handleCTA(kind){
    // Valide et bloque si incomplet
    if(!validateComplete()){
      showNotice("Formulaire incomplet. Merci d'ajouter vos coordonnées.");
      return;
    }

    const data = collectData();
    const { subject, body } = buildMessages(data);

    // Pixel CTA (une seule fois côté client)
    if(!ssGet(SS_KEYS.SENT_CTA)){
      logEvent('cta', { kind, mode:data.mode, produit:data.produit, form: snapshotForm(data) });
      ssSet(SS_KEYS.SENT_CTA, '1');
    }

    // Ouvre le canal
    if(kind==='email'){
      location.href = toMailto(subject, body);
    }else{
      window.open(toWhats(body), '_blank', 'noopener');
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

  // Form snapshot pour l’event form_complete / cta
  function snapshotForm(d){
    const x = d || collectData();
    if(x.mode==='entreprise'){
      return {
        mode:x.mode, produit:x.produit,
        societe:(x.societe||''), contact:(x.contact||''),
        tel:(x.tel||''), email:(x.email||'')
      };
    }
    return {
      mode:x.mode, produit:x.produit,
      prenom:(x.prenom||''), nom:(x.nom||''),
      tel:(x.tel||''), email:(x.email||'')
    };
  }

  // Envoi “form_complete” — une seule fois
  function maybeSendFormComplete(){
    if(ssGet(SS_KEYS.SENT_FORM)) return;
    if(!validateComplete()) return;
    const snap = snapshotForm();
    logEvent('form_complete', { form: snap });
    ssSet(SS_KEYS.SENT_FORM, '1');
  }

  function bindFormWatchers(){
    $$('#miniForm input').forEach(el=>{
      el.addEventListener('input', maybeSendFormComplete);
      el.addEventListener('change', maybeSendFormComplete);
    });
  }

  function bindSegmentation(){
    [rParticulier, rEntreprise].forEach(r=>{
      if(!r) return;
      r.addEventListener('change', ()=> applyRequired());
    });
    applyRequired();
  }

  // 1) PAGE OPEN — une fois, après tentative IP
  async function sendPageOpenOnce(){
    if(ssGet(SS_KEYS.SENT_OPEN)) return;
    await fetchIP(1200); // best-effort IP
    logEvent('page_open', { mode:getMode(), produit:getProduit() });
    ssSet(SS_KEYS.SENT_OPEN, '1');
  }

  // INIT
  function init(){
    bindSegmentation();
    bindFormWatchers();
    bindCTAs();
    sendPageOpenOnce();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
