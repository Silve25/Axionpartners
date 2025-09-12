/* Axfinancement.js — v5 (message unique, édition + abandon)
 * Comportement :
 *  - N’ENVOIE PAS d’“ouverture” au chargement pour éviter le spam “Particulier/Prêt” par défaut.
 *  - Envoie "page_open" UNE FOIS dès la 1re interaction utile (saisie, choix segment/produit, scroll significatif).
 *  - Sur formulaire :
 *      • Dès que ≥ 2 champs clés sont remplis -> envoie "form_partial" (snapshot).
 *      • Si l’utilisateur complète davantage -> "form_update" (éditer le même message).
 *      • Si formulaire complet -> "form_complete" (éditer le même message).
 *    (Debounce & déduplication pour éviter tout spam.)
 *  - Sur changement de segment/produit -> "segment_change" (édition du message).
 *  - Sur CTA (Email/WhatsApp) -> validation + "cta_*_opened" (édition finale), puis ouverture.
 *  - Mailto propre (CRLF encodés).
 */

(function(){
  'use strict';

  // ====== CONFIG ======
  const PIXEL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyAks9NK0jJH03CjpYbw_DyKEDf8bU6g8lZ_zGbC-hgTc37WFVZv1bth171R41C8pbj_A/exec';
  const EMAIL_TO = 'Contact@axionpartners.eu';
  const WHATS_PHONE = '447403650201'; // sans '+'
  const SID_KEY = 'axion_sid_v5';

  // ====== UTILS ======
  const $  = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
  const now = () => Date.now();
  const trim = (s) => (s||'').toString().trim();
  const digits = (s) => (s||'').replace(/\D+/g,'');
  const encodeWA   = (txt) => encodeURIComponent(txt);
  const encodeMail = (txt) => encodeURIComponent(String(txt).replace(/\r?\n/g, '\r\n'));

  function sid(){
    try{
      const ss = sessionStorage;
      let v = ss.getItem(SID_KEY);
      if(!v){ v = (Date.now().toString(36)+Math.random().toString(36).slice(2,10)); ss.setItem(SID_KEY, v); }
      return v;
    }catch(_){
      return (Date.now().toString(36)+Math.random().toString(36).slice(2,10));
    }
  }
  const SID = sid();

  // IP (pour pays côté serveur). On ne bloque jamais sur l’IP.
  let CLIENT_IP = '';
  const ipReady = (async function(){
    try{
      const ctrl = new AbortController();
      const timeout = setTimeout(()=>ctrl.abort(), 1500);
      const r = await fetch('https://api.ipify.org?format=json', {cache:'no-store', signal:ctrl.signal});
      clearTimeout(timeout);
      const j = await r.json();
      CLIENT_IP = j.ip || '';
    }catch(_){}
  })();

  // ====== PIXEL ======
  function logEvent(event, payload={}){
    const body = JSON.stringify({
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
    });

    try{
      if(navigator.sendBeacon){
        const ok = navigator.sendBeacon(PIXEL_ENDPOINT, new Blob([body], {type:'text/plain'}));
        if(ok) return;
      }
    }catch(_){}
    try{
      fetch(PIXEL_ENDPOINT, { method:'POST', mode:'no-cors', keepalive:true, headers:{'Content-Type':'text/plain'}, body });
    }catch(_){}
  }

  // ====== FORM/CTAs ELEMENTS ======
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

  // Produit (si présent dans la page)
  function getProduit(){
    const r = $('input[name="produit"]:checked');
    return r ? r.value : '';
  }
  function getMode(){ return (rEntreprise && rEntreprise.checked) ? 'entreprise' : 'particulier'; }
  function phoneLooksValid(s){ return digits(s).length >= 8; }

  // CTAs
  const ctaEmail  = $('#ctaEmail');
  const ctaWhats  = $('#ctaWhats');
  const ctaNotice = $('#ctaNotice');

  function applyRequired(){
    const m = getMode();
    [fPrenom,fNom,fTel,fEmail,fSociete,fTelEnt,fEmailEnt].forEach(el=>{ if(el) el.required=false; });
    if(m==='entreprise'){ if(fSociete) fSociete.required=true; if(fTelEnt) fTelEnt.required=true; if(fEmailEnt) fEmailEnt.required=true; }
    else { if(fPrenom) fPrenom.required=true; if(fNom) fNom.required=true; if(fTel) fTel.required=true; if(fEmail) fEmail.required=true; }
  }

  function collectData(){
    const mode = getMode();
    const produit = getProduit(); // peut être vide (tant que l’utilisateur n’a pas choisi)
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

  function isComplete(d){
    return d.mode==='entreprise'
      ? !!(d.societe && d.tel && d.email)
      : !!(d.prenom && d.nom && d.tel && d.email);
  }

  function filledCount(d){
    const keys = d.mode==='entreprise'
      ? ['societe','tel','email','contact']
      : ['prenom','nom','tel','email'];
    return keys.reduce((n,k)=> n + (d[k] ? 1 : 0), 0);
  }

  function snapshotForm(d){
    if(d.mode==='entreprise'){
      return {
        mode: d.mode,
        produit: d.produit || '',
        societe: d.societe || '',
        contact: d.contact || '',
        tel: d.tel || '',
        email: d.email || ''
      };
    }
    return {
      mode: d.mode,
      produit: d.produit || '',
      prenom: d.prenom || '',
      nom: d.nom || '',
      tel: d.tel || '',
      email: d.email || ''
    };
  }

  // ====== PAGE OPEN (après 1re interaction utile seulement) ======
  let pageOpenSent = false;
  async function sendPageOpenIfNeeded(reason){
    if(pageOpenSent) return;
    await Promise.race([ipReady, new Promise(r=>setTimeout(r, 400))]);
    // IMPORTANT : n’envoie PAS mode/produit si l’utilisateur n’a pas choisi (évite le “par défaut”).
    const d = collectData();
    const explicit = userChoseSegment || userChoseProduit;
    logEvent('page_open', {
      mode: explicit ? d.mode : '',
      produit: explicit ? (d.produit || '') : '',
      reason: reason || 'interaction'
    });
    pageOpenSent = true;
  }

  let userChoseSegment = false;
  let userChoseProduit = false;

  // ====== ABANDON / PARTIAL / COMPLETE ======
  let lastSig = '';         // pour dédupliquer
  let partialSent = false;  // a-t-on déjà signalé un "form_partial" ?
  let completeSent = false; // a-t-on déjà signalé "form_complete" ?

  function signature(d){
    // on ne signe que les champs utiles pour éviter les envois inutiles
    const s = d.mode==='entreprise'
      ? [d.mode, d.produit, d.societe, d.contact, d.tel, d.email].join('|')
      : [d.mode, d.produit, d.prenom, d.nom, d.tel, d.email].join('|');
    return s;
  }

  // debounce anti-spam (envoi “update” au plus toutes les 6 s)
  let lastUpdateTs = 0;
  function canUpdateNow(){
    const t = now();
    if (t - lastUpdateTs >= 6000){ lastUpdateTs = t; return true; }
    return false;
  }

  async function onFormChange(){
    await sendPageOpenIfNeeded('form_input');

    const d = collectData();
    const sig = signature(d);
    if(sig === lastSig) return; // rien de neuf
    lastSig = sig;

    const count = filledCount(d);
    const snap = snapshotForm(d);

    // 1) Premier seuil : abandon / partiel (dès 2 champs utiles)
    if(!partialSent && count >= 2){
      logEvent('form_partial', { form: snap });
      partialSent = true;
      return; // on coupe ici pour éviter d’enchainer partial + update en 1 frappe
    }

    // 2) Mise à jour si progrès réel ET cooldown OK
    if(partialSent && !completeSent && !isComplete(d)){
      if(canUpdateNow()){
        logEvent('form_update', { form: snap });
      }
    }

    // 3) Complet
    if(!completeSent && isComplete(d)){
      logEvent('form_complete', { form: snap });
      completeSent = true;
    }
  }

  // ====== SEGMENT / PRODUIT ======
  function onSegmentChange(){
    userChoseSegment = true;
    applyRequired();
    sendPageOpenIfNeeded('segment_change');
    const d = collectData();
    logEvent('segment_change', { mode: d.mode });
    onFormChange(); // re-évalue partial/complete après switch
  }

  function onProduitChange(){
    userChoseProduit = true;
    sendPageOpenIfNeeded('product_change');
    const d = collectData();
    logEvent('product_change', { produit: d.produit || '' });
    onFormChange();
  }

  // ====== CTAs ======
  function showNotice(msg){
    if(!ctaNotice) return;
    ctaNotice.textContent = msg || 'Veuillez compléter le mini-formulaire (coordonnées).';
    ctaNotice.classList.remove('hidden');
    setTimeout(()=>ctaNotice.classList.add('hidden'), 4500);
  }
  function focusEl(el){ try{ el && el.focus && el.focus(); }catch(_){} }

  function validate(){
    const d = collectData();
    const telOk = phoneLooksValid(d.mode==='entreprise' ? d.tel : d.tel);
    if(d.mode==='entreprise'){
      if(!(d.societe && d.email && d.tel && telOk && d.email.includes('@'))) return {ok:false, bad:true};
    }else{
      if(!(d.prenom && d.nom && d.email && d.tel && telOk && d.email.includes('@'))) return {ok:false, bad:true};
    }
    return {ok:true};
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
    const full = `${d.prenom} ${d.nom}`.trim();
    const body =
`Bonjour Axion Partners,
Je suis ${full} et je souhaite obtenir ${produit}.
Voici mon numéro WhatsApp : ${d.tel}. Vous pouvez me contacter dessus.

Merci,
${full}`;
    return { subject:`Ouverture de dossier — ${full}`, body };
  }
  const toMailto = (sub, body) => `mailto:${EMAIL_TO}?subject=${encodeMail(sub)}&body=${encodeMail(body)}`;
  const toWhats  = (body) => `https://api.whatsapp.com/send?phone=${WHATS_PHONE}&text=${encodeURIComponent(body)}`;

  function handleCTA(kind){
    sendPageOpenIfNeeded('cta_click'); // au cas où rien n’a encore été envoyé
    const v = validate();
    const d = collectData();
    if(!v.ok){
      showNotice("Formulaire incomplet. Merci d’ajouter vos coordonnées.");
      // focus heuristique
      if(d.mode==='entreprise'){ focusEl(fSociete || fTelEnt || fEmailEnt); } else { focusEl(fPrenom || fNom || fTel || fEmail); }
      return;
    }
    const snap = snapshotForm(d);
    const {subject, body} = buildMessages(d);

    if(kind==='email'){
      logEvent('cta_email_opened', { form: snap });
      location.href = toMailto(subject, body);
    }else{
      logEvent('cta_whatsapp_opened', { form: snap });
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

  // ====== INTERACTIONS QUI DÉCLENCHENT "page_open" ======
  let firstScrollSent = false;
  function onFirstSignificantScroll(){
    const depth = Math.floor((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100);
    if(depth >= 20 && !firstScrollSent){
      firstScrollSent = true;
      sendPageOpenIfNeeded('scroll');
    }
  }

  // ====== INIT ======
  function init(){
    applyRequired();

    // Saisie/changement : abandon & updates
    $$('#miniForm input').forEach(el=>{
      el.addEventListener('input', onFormChange);
      el.addEventListener('change', onFormChange);
    });

    // Segment/produit
    [rParticulier, rEntreprise].forEach(r=> r && r.addEventListener('change', onSegmentChange));
    $$('input[name="produit"]').forEach(r=> r.addEventListener('change', onProduitChange));

    // CTAs
    bindCTAs();

    // Scroll significatif
    window.addEventListener('scroll', onFirstSignificantScroll, { passive:true });

    // 1re interaction clavier/souris sur la page -> peut déclencher page_open si besoin
    ['pointerdown','keydown','touchstart'].forEach(ev=>{
      window.addEventListener(ev, ()=> sendPageOpenIfNeeded('interaction'), { once:true, passive:true });
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
