/* Axfinancement.js — 3 triggers propres pour le Code.gs (anti-spam)
 * 1) page_open         → envoie l’IP (géoloc côté .gs)
 * 2) form_complete     → dès que 6 éléments sont connus :
 *      - Vous êtes (Particulier | Entreprise)
 *      - Je cherche (Prêt 2,5 % | Subvention | Je ne sais pas encore)
 *      - Nom, Prénom, Téléphone, Email  (tous remplis et valides)
 * 3) cta               → premier clic (Email OU WhatsApp)
 *
 * Hypothèses HTML:
 *  - <form id="miniForm"> … </form>
 *  - Radios type:  #modeParticulier / #modeEntreprise
 *  - Radios produit: name="produit" (ex: #prod-pret / #prod-subv / #prod-indecis)
 *  - Champs indispensables (toujours visibles): #prenom #nom #telephone #email
 *  - CTAs: #ctaEmail #ctaWhats, notice optionnelle: #ctaNotice
 *
 * Tout est idempotent: un seul envoi par trigger grâce à sessionStorage + dédup côté .gs
 */

(function(){
  'use strict';

  /* ===== CONFIG ===== */
  const PIXEL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyAks9NK0jJH03CjpYbw_DyKEDf8bU6g8lZ_zGbC-hgTc37WFVZv1bth171R41C8pbj_A/exec';
  const EMAIL_TO   = 'Contact@axionpartners.eu';
  const WHATS_APP  = '447403650201'; // sans '+'

  const SS = {
    SID:       'ax_sid',
    SENT_OPEN: 'ax_sent_open',
    SENT_FORM: 'ax_sent_form',
    SENT_CTA:  'ax_sent_cta',
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
    let sid = ssGet(SS.SID);
    if(!sid){
      sid = (Date.now().toString(36)+Math.random().toString(36).slice(2,10));
      ssSet(SS.SID, sid);
    }
    return sid;
  }
  const SID = getSID();

  // IP (best-effort, non bloquant > 1200ms)
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

  // Envoi (sendBeacon > fetch > GET image)
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
  if(!form){ console.warn('[Axfinancement] #miniForm introuvable'); return; }

  // Segment
  const rParticulier = $('#modeParticulier');
  const rEntreprise  = $('#modeEntreprise');

  // Produit (radios, name="produit")
  function getProduit(){
    const r = $('input[name="produit"]:checked');
    return r ? r.value : '';
  }

  // Champs (simples, toujours présents dans la version “simple” demandée)
  const fPrenom = $('#prenom');
  const fNom    = $('#nom');
  const fTel    = $('#telephone');
  const fEmail  = $('#email');

  function getMode(){
    // Si rien n’est coché, on renvoie vide (pas de spam "particulier" par défaut)
    if(rEntreprise && rEntreprise.checked) return 'entreprise';
    if(rParticulier && rParticulier.checked) return 'particulier';
    return '';
  }

  function phoneLooksValid(s){ return digits(s).length >= 8; }

  // Validation “6 éléments connus”
  function isFormComplete(){
    const mode    = getMode();            // Particulier/Entreprise (via radios)
    const produit = getProduit();         // Prêt/Subvention/Je ne sais pas encore
    const prenom  = trim(fPrenom?.value);
    const nom     = trim(fNom?.value);
    const tel     = trim(fTel?.value);
    const email   = trim(fEmail?.value);

    const hasMode    = !!mode;
    const hasProduit = !!produit;
    const okTel      = phoneLooksValid(tel);
    const okEmail    = !!email;           // on évite de survalider (le .gs n’en a pas besoin)
    const okNom      = !!nom;
    const okPrenom   = !!prenom;

    return hasMode && hasProduit && okPrenom && okNom && okTel && okEmail;
  }

  function collectData(){
    return {
      mode: getMode(),
      produit: getProduit(),
      prenom: trim(fPrenom?.value),
      nom:    trim(fNom?.value),
      tel:    trim(fTel?.value),
      email:  trim(fEmail?.value),
    };
  }

  // Snapshot pour .gs
  function snapshotForm(){
    const d = collectData();
    return {
      mode: d.mode || '',
      produit: d.produit || '',
      prenom: d.prenom || '',
      nom: d.nom || '',
      tel: d.tel || '',
      email: d.email || ''
    };
  }

  // ====== TRIGGER #2 : form_complete (une fois) ======
  function maybeSendFormComplete(){
    if(ssGet(SS.SENT_FORM)) return;
    if(!isFormComplete()) return;
    logEvent('form_complete', { form: snapshotForm() });
    ssSet(SS.SENT_FORM, '1');
  }

  // Watchers pour déclencher le #2
  function bindFormWatchers(){
    $$('#miniForm input, #miniForm select').forEach(el=>{
      el.addEventListener('input',  maybeSendFormComplete);
      el.addEventListener('change', maybeSendFormComplete);
    });
  }

  // ====== Messages CTA (préremplis, propres) ======
  function buildMessages(d){
    const produit = d.produit || 'je ne sais pas encore';
    const full    = `${d.prenom||''} ${d.nom||''}`.replace(/\s+/g,' ').trim() || '—';
    const body =
`Bonjour Axion Partners,
Je suis ${full} et je souhaite obtenir ${produit}.
Voici mon numéro WhatsApp : ${d.tel}. Vous pouvez me contacter dessus.

Merci,
${full}`;
    return { subject:`Ouverture de dossier — ${full}`, body };
  }
  function toMailto(subject, body){
    return `mailto:${EMAIL_TO}?subject=${encodeMail(subject)}&body=${encodeMail(body)}`;
  }
  function toWhats(body){
    return `https://api.whatsapp.com/send?phone=${WHATS_APP}&text=${encodeWA(body)}`;
  }

  const ctaEmail  = $('#ctaEmail');
  const ctaWhats  = $('#ctaWhats');
  const ctaNotice = $('#ctaNotice');

  function showNotice(msg){
    if(!ctaNotice) return;
    ctaNotice.textContent = msg || 'Merci de compléter le formulaire (coordonnées).';
    ctaNotice.classList.remove('hidden');
    setTimeout(()=>ctaNotice.classList.add('hidden'), 4000);
  }

  // ====== TRIGGER #3 : cta (premier clic) ======
  function handleCTA(kind){
    // Toujours exiger le formulaire complet avant d’ouvrir le canal
    if(!isFormComplete()){
      showNotice("Formulaire incomplet. Merci d'ajouter vos coordonnées.");
      return;
    }
    const data = collectData();
    const { subject, body } = buildMessages(data);

    // Envoi CTA au .gs (une seule fois côté client)
    if(!ssGet(SS.SENT_CTA)){
      logEvent('cta', { kind, mode:data.mode, produit:data.produit, form: snapshotForm() });
      ssSet(SS.SENT_CTA, '1');
    }

    // Ouvrir le canal choisi
    if(kind==='email'){ location.href = toMailto(subject, body); }
    else { window.open(toWhats(body), '_blank', 'noopener'); }
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

  // ====== TRIGGER #1 : page_open (une fois, avec IP si dispo) ======
  async function sendPageOpenOnce(){
    if(ssGet(SS.SENT_OPEN)) return;
    await fetchIP(1200); // best-effort (ne bloque pas plus de ~1,2 s)
    logEvent('page_open', { mode:getMode(), produit:getProduit() });
    ssSet(SS.SENT_OPEN, '1');
  }

  // INIT
  function init(){
    bindFormWatchers();
    bindCTAs();
    // Pas de valeur par défaut forcée → pas de spam “particulier/prêt”
    sendPageOpenOnce();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
