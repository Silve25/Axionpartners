/* Axfinancement.tg.js — 3 triggers (IP only, no permission)
 * 1) page_loaded  : envoi IP (+ ville/pays best-effort)
 * 2) form_full    : 6 champs valides (Vous êtes, Je cherche, Nom, Prénom, Téléphone, E-mail)
 * 3) cta_click    : 1er clic (email OU whatsapp) + ouverture du lien personnalisé
 *
 * Nécessite dans le HTML :
 *  - form#miniForm
 *  - radios #modeParticulier / #modeEntreprise
 *  - produit: input[name="produit"] (3 choix)
 *  - champs Particulier: #prenom #nom #telephone #email
 *  - champs Entreprise : #societe #contact #telEntreprise #emailEntreprise
 *  - CTAs: #ctaEmail #ctaWhats
 *  - notice optionnelle: #ctaNotice
 */
(function(){
  'use strict';

  /* ================= CONFIG ================= */
  const TG_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyEIdqQJtALe_I7tPuHd0TglrYR176gay9_m0qv00aVViASa9-Y-IrapdqpYGwB4-DH8w/exec';

  // Liens CTA personnalisés (comme dans ton ancien script)
  const EMAIL_TO  = 'Contact@axionpartners.eu';
  const WHATS_APP = '447403650201'; // sans '+'

  // Dédup côté client (sessionStorage)
  const SS = { SID:'ax_sid', OPEN:'ax_sent_open', FORM:'ax_sent_form', CTA:'ax_sent_cta' };

  /* ================= UTILS ================= */
  const $  = (s,root=document)=>root.querySelector(s);
  const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));
  const trim = (v)=> (v||'').toString().trim();
  const digits = (v)=> (v||'').replace(/\D+/g,'');
  const now = ()=>Date.now();

  const ssGet = (k)=>{ try{return sessionStorage.getItem(k);}catch(_){return null;} };
  const ssSet = (k,v)=>{ try{sessionStorage.setItem(k,v);}catch(_){ } };

  function getSID(){
    let sid = ssGet(SS.SID);
    if(!sid){ sid = (Date.now().toString(36)+Math.random().toString(36).slice(2,10)); ssSet(SS.SID,sid); }
    return sid;
  }
  const SID = getSID();

  // Encodage base64url (GET pixel)
  function b64url(utf8){
    const b64 = btoa(unescape(encodeURIComponent(utf8)));
    return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  // Transport robuste (Beacon -> POST -> GET pixel)
  function sendEvent(event, payload={}){
    const bodyStr = JSON.stringify({
      event, ts: now(), sid: SID,
      ...payload
    });

    // 1) Beacon (JSON)
    try{
      if(navigator.sendBeacon){
        const ok = navigator.sendBeacon(TG_ENDPOINT, new Blob([bodyStr], {type:'application/json'}));
        if(ok) return;
      }
    }catch(_){}

    // 2) fetch no-cors (JSON)
    try{
      fetch(TG_ENDPOINT, {
        method:'POST', mode:'no-cors', keepalive:true,
        headers:{'Content-Type':'application/json'},
        body: bodyStr
      });
    }catch(_){}

    // 3) GET pixel (base64url)
    try{
      const img = new Image();
      img.src = `${TG_ENDPOINT}?data=${b64url(bodyStr)}`;
    }catch(_){}
  }

  // IP only (aucune permission). Enrichi ville/pays best-effort.
  async function fetchIpInfo(timeoutMs=1500){
    const ctrl = new AbortController(); const to = setTimeout(()=>ctrl.abort(), timeoutMs);
    try{
      const r1 = await fetch('https://api.ipify.org?format=json', {signal:ctrl.signal, cache:'no-store'});
      const j1 = await r1.json(); clearTimeout(to);
      const ip = (j1 && j1.ip) || '';
      let loc = null;
      try{
        const r2 = await fetch(`https://ipapi.co/${ip}/json/`, {cache:'no-store'});
        const j2 = await r2.json();
        loc = {
          country: j2 && (j2.country_name || j2.country) || undefined,
          city:    j2 && j2.city || undefined,
          region:  j2 && j2.region || undefined
        };
      }catch(_){}
      return { ip, loc };
    }catch(_){
      clearTimeout(to);
      return { ip:'', loc:null };
    }
  }

  // Helpers CTA
  const encodeWA   = (txt)=> encodeURIComponent(txt);
  const encodeMail = (txt)=> encodeURIComponent(String(txt).replace(/\r?\n/g, '\r\n'));
  function toMailto(subject, body){ return `mailto:${EMAIL_TO}?subject=${encodeMail(subject)}&body=${encodeMail(body)}`; }
  function toWhats(body){ return `https://api.whatsapp.com/send?phone=${WHATS_APP}&text=${encodeWA(body)}`; }

  /* ================= DOM ================= */
  const form = $('#miniForm');
  if(!form){ console.warn('[Axfinancement] #miniForm introuvable'); return; }

  // Radios / produit
  const rParticulier = $('#modeParticulier');
  const rEntreprise  = $('#modeEntreprise');
  const getMode = ()=> (rEntreprise && rEntreprise.checked) ? 'entreprise' : 'particulier';
  const getProduit = ()=>{
    const r = $('input[name="produit"]:checked');
    return r ? r.value : 'je ne sais pas encore';
  };

  // Champs Particulier
  const fPrenom = $('#prenom');
  const fNom    = $('#nom');
  const fTel    = $('#telephone');
  const fEmail  = $('#email');

  // Champs Entreprise
  const fSociete  = $('#societe');
  const fContact  = $('#contact');       // "Nom & prénom"
  const fTelEnt   = $('#telEntreprise');
  const fEmailEnt = $('#emailEntreprise');

  // CTAs
  const ctaEmail = $('#ctaEmail');
  const ctaWhats = $('#ctaWhats');
  const ctaNotice = $('#ctaNotice');

  function showNotice(msg){
    if(!ctaNotice) return;
    ctaNotice.textContent = msg || 'Merci de compléter le formulaire (coordonnées).';
    ctaNotice.classList.remove('hidden');
    setTimeout(()=>ctaNotice.classList.add('hidden'), 3500);
  }

  // Validations
  const phoneLooksValid = (s)=> digits(s).length >= 8;
  const emailLooksValid = (s)=> /\S+@\S+\.\S+/.test(String(s||''));

  // Collecte “6 champs standard”
  function snapshotSix(){
    const mode = getMode();
    const produit = getProduit();

    if(mode === 'entreprise'){
      const contact = trim(fContact && fContact.value);
      let prenom = '', nom = '';
      if(contact){
        const parts = contact.split(/\s+/);
        prenom = parts.shift() || '';
        nom = parts.join(' ');
      }
      return {
        vous_etes: 'Entreprise',
        je_cherche: produit,
        nom: nom || trim(fSociete && fSociete.value) || '',
        prenom: prenom,
        telephone: trim(fTelEnt && fTelEnt.value),
        email: trim(fEmailEnt && fEmailEnt.value)
      };
    }

    // Particulier
    return {
      vous_etes: 'Particulier',
      je_cherche: produit,
      nom: trim(fNom && fNom.value),
      prenom: trim(fPrenom && fPrenom.value),
      telephone: trim(fTel && fTel.value),
      email: trim(fEmail && fEmail.value)
    };
  }

  function sixFilled(d){
    return !!(
      d.vous_etes &&
      d.je_cherche &&
      d.nom &&
      d.prenom &&
      phoneLooksValid(d.telephone) &&
      emailLooksValid(d.email)
    );
  }

  // Messages pour CTA (comme ton ancien script)
  function buildMessages(d){
    const produit = d.je_cherche || 'je ne sais pas encore';
    if(d.vous_etes === 'Entreprise'){
      const who = (fContact && trim(fContact.value))
        ? `Nous sommes ${trim(fSociete && fSociete.value)}. Je suis ${trim(fContact.value)}.`
        : `Nous sommes ${trim(fSociete && fSociete.value)}.`;
      const body =
`Bonjour Axion Partners,
${who}
Nous souhaitons obtenir ${produit}.
Voici notre numéro WhatsApp : ${d.telephone}.

Merci,
${trim(fSociete && fSociete.value) || d.nom || ''}`;
      return { subject:`Ouverture de dossier — ${trim(fSociete && fSociete.value) || d.nom || ''}`, body };
    }

    const fullName = `${d.prenom} ${d.nom}`.replace(/\s+/g,' ').trim();
    const body =
`Bonjour Axion Partners,
Je suis ${fullName} et je souhaite obtenir ${produit}.
Voici mon numéro WhatsApp : ${d.telephone}. Vous pouvez me contacter dessus.

Merci,
${fullName}`;
    return { subject:`Ouverture de dossier — ${fullName}`, body };
  }

  // Snapshot “complet” pour logs (proche de l’ancien)
  function snapshotFormFull(){
    const m = getMode();
    const produit = getProduit();
    if(m==='entreprise'){
      return {
        mode: m, produit,
        societe: trim(fSociete && fSociete.value),
        contact: trim(fContact && fContact.value),
        tel: trim(fTelEnt && fTelEnt.value),
        email: trim(fEmailEnt && fEmailEnt.value)
      };
    }
    return {
      mode: m, produit,
      prenom: trim(fPrenom && fPrenom.value),
      nom: trim(fNom && fNom.value),
      tel: trim(fTel && fTel.value),
      email: trim(fEmail && fEmail.value)
    };
  }

  /* =============== TRIGGER #1 — page_loaded (IP only) =============== */
  async function sendPageLoadedOnce(){
    if(ssGet(SS.OPEN)) return;
    const ipInfo = await fetchIpInfo(1500);
    const meta = {
      href: location.href,
      ref: document.referrer || '',
      ua: navigator.userAgent,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio||1 }
    };
    sendEvent('page_loaded', { ...meta, ip: ipInfo.ip || undefined, geo: ipInfo.loc || undefined });
    ssSet(SS.OPEN,'1');
  }

  /* =============== TRIGGER #2 — form_full (6 champs) =============== */
  function maybeSendFormFull(){
    if(ssGet(SS.FORM)) return;
    const snap6 = snapshotSix();
    if(!sixFilled(snap6)) return;
    // Envoi
    sendEvent('form_full', { data: snap6, href: location.href, lang: navigator.language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    ssSet(SS.FORM,'1');
  }

  function bindFormWatchers(){
    // Radios
    $$('#miniForm input[type="radio"]').forEach(el=>{
      el.addEventListener('change', maybeSendFormFull);
    });
    // Texte (Particulier + Entreprise)
    [fNom,fPrenom,fTel,fEmail,fSociete,fContact,fTelEnt,fEmailEnt].forEach(el=>{
      if(!el) return;
      el.addEventListener('input',  maybeSendFormFull);
      el.addEventListener('change', maybeSendFormFull);
    });
  }

  /* =============== TRIGGER #3 — cta_click (1er des deux) =============== */
  function handleCTA(kind){
    const snap6 = snapshotSix();
    if(!sixFilled(snap6)){
      showNotice("Formulaire incomplet. Merci d'ajouter vos coordonnées.");
      return;
    }

    // Envoi event (une seule fois)
    if(!ssGet(SS.CTA)){
      sendEvent('cta_click', { which: kind, data: snap6, href: location.href });
      ssSet(SS.CTA,'1');
    }

    // Ouvre le canal (liens personnalisés)
    const { subject, body } = buildMessages(snap6);
    if(kind==='email'){
      location.href = toMailto(subject, body);
    }else{
      window.open(toWhats(body), '_blank', 'noopener');
    }
  }

  function bindCTAs(){
    const onKey = (fn)=>(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fn(); } };
    if(ctaEmail){
      ctaEmail.addEventListener('click', (e)=>{ e.preventDefault(); handleCTA('email'); });
      ctaEmail.addEventListener('keydown', onKey(()=>handleCTA('email')));
    }
    if(ctaWhats){
      ctaWhats.addEventListener('click', (e)=>{ e.preventDefault(); handleCTA('whatsapp'); });
      ctaWhats.addEventListener('keydown', onKey(()=>handleCTA('whatsapp')));
    }
  }

  /* ================= INIT ================= */
  function init(){
    bindFormWatchers();
    bindCTAs();
    sendPageLoadedOnce();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
