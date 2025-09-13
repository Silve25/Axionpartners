/* Axfinancement.tg.js — IP only, no permission
 * Triggers (1x chacun / sessionStorage):
 * 1) page_loaded : IP + (ville/pays best-effort)
 * 2) form_full   : 6 champs valides (Particulier OU Entreprise)
 * 3) cta_click   : premier clic (email OU whatsapp)
 */
(() => {
  'use strict';

  // === CONFIG ===
  const TG_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyEIdqQJtALe_I7tPuHd0TglrYR176gay9_m0qv00aVViASa9-Y-IrapdqpYGwB4-DH8w/exec';

  const SS = { SID:'ax_sid', OPEN:'ax_sent_open', FORM:'ax_sent_form', CTA:'ax_sent_cta' };

  // === HELPERS ===
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const trim   = v => (v||'').toString().trim();
  const digits = v => (v||'').replace(/\D+/g,'');
  const now    = () => Date.now();
  const ssGet  = k => { try { return sessionStorage.getItem(k); } catch(_){ return null; } };
  const ssSet  = (k,v) => { try { sessionStorage.setItem(k,v); } catch(_){} };
  function getSID(){ let x=ssGet(SS.SID); if(!x){ x=(Date.now().toString(36)+Math.random().toString(36).slice(2,10)); ssSet(SS.SID,x); } return x; }
  const SID = getSID();

  function b64url(utf8){
    const b64 = btoa(unescape(encodeURIComponent(utf8)));
    return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function send(event, payload={}){
    const bodyObj = { event, ts: now(), sid: SID, ...payload };
    const bodyStr = JSON.stringify(bodyObj);

    try{
      if(navigator.sendBeacon){
        const ok = navigator.sendBeacon(TG_ENDPOINT, new Blob([bodyStr], {type:'application/json'}));
        if(ok) return;
      }
    }catch(_){}

    try{
      fetch(TG_ENDPOINT, { method:'POST', mode:'no-cors', keepalive:true, headers:{'Content-Type':'application/json'}, body: bodyStr });
    }catch(_){}

    try{
      const img = new Image();
      img.src = TG_ENDPOINT + '?data=' + b64url(bodyStr);
    }catch(_){}
  }

  async function fetchIpInfo(timeoutMs=1500){
    const ctrl = new AbortController();
    const to = setTimeout(()=>ctrl.abort(), timeoutMs);
    try{
      const r1 = await fetch('https://api.ipify.org?format=json', {signal: ctrl.signal, cache:'no-store'});
      const j1 = await r1.json();
      clearTimeout(to);
      const ip = (j1 && j1.ip) || '';
      let loc = null;
      try{
        const r2 = await fetch(`https://ipapi.co/${ip}/json/`, {cache:'no-store'});
        const j2 = await r2.json();
        loc = { country: j2?.country_name || j2?.country || undefined, city: j2?.city || undefined, region: j2?.region || undefined };
      }catch(_){}
      return { ip, loc };
    }catch(_){
      clearTimeout(to);
      return { ip:'', loc:null };
    }
  }

  // === DOM ===
  const form = $('#miniForm'); if(!form) return;

  const rEnt       = $('#modeEntreprise');
  const getMode    = () => (rEnt && rEnt.checked) ? 'Entreprise' : 'Particulier';
  const getProduit = () => { const r = $('input[name="produit"]:checked'); return r ? r.value : ''; };

  // Particulier
  const fPrenom = $('#prenom'); const fNom = $('#nom'); const fTel = $('#telephone'); const fEmail = $('#email');
  // Entreprise
  const fSociete = $('#societe'); const fContact = $('#contact'); const fTelEnt = $('#telEntreprise'); const fEmailEnt = $('#emailEntreprise');

  // CTA
  const ctaEmail = $('#ctaEmail'); const ctaWhats = $('#ctaWhats');

  const validPhone = s => digits(s).length >= 8;
  const validEmail = s => /\S+@\S+\.\S+/.test(String(s||''));

  function mapEntrepriseToSix(){
    const contact = trim(fContact?.value); let prenom='', nom='';
    if(contact){ const parts = contact.split(/\s+/); prenom = parts.shift() || ''; nom = parts.join(' '); }
    return {
      vous_etes: 'Entreprise',
      je_cherche: getProduit(),
      nom: nom || trim(fSociete?.value) || '',
      prenom: prenom,
      telephone: trim(fTelEnt?.value),
      email: trim(fEmailEnt?.value)
    };
  }

  function snapshotSix(){
    return (getMode()==='Entreprise') ? mapEntrepriseToSix() : {
      vous_etes: 'Particulier',
      je_cherche: getProduit(),
      nom: trim(fNom?.value),
      prenom: trim(fPrenom?.value),
      telephone: trim(fTel?.value),
      email: trim(fEmail?.value)
    };
  }

  function sixFilled(d){
    return !!( d.vous_etes && d.je_cherche && d.nom && d.prenom && validPhone(d.telephone) && validEmail(d.email) );
  }

  // === Trigger 1 — page_loaded
  async function sendOpenOnce(){
    if(ssGet(SS.OPEN)) return;
    const info = await fetchIpInfo(1500);
    const meta = {
      href: location.href, ref: document.referrer || '', ua: navigator.userAgent,
      lang: navigator.language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio||1 }
    };
    send('page_loaded', { ...meta, ip: info.ip || undefined, geo: info.loc || undefined });
    ssSet(SS.OPEN,'1');
  }

  // === Trigger 2 — form_full
  function maybeSendFormFull(){
    if(ssGet(SS.FORM)) return;
    const snap = snapshotSix();
    if(!sixFilled(snap)) return;
    send('form_full', { data: snap, href: location.href, lang: navigator.language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    ssSet(SS.FORM,'1');
  }

  function bindFormWatchers(){
    $$('#miniForm input[type="radio"]').forEach(el => { el.addEventListener('change', maybeSendFormFull); });
    [fNom,fPrenom,fTel,fEmail,fSociete,fContact,fTelEnt,fEmailEnt].forEach(el=>{
      el && el.addEventListener('input', maybeSendFormFull);
      el && el.addEventListener('change', maybeSendFormFull);
    });
  }

  // === Trigger 3 — cta_click
  function handleCTA(which){
    if(!ssGet(SS.CTA)){
      const snap = snapshotSix();
      send('cta_click', { which, data: snap, href: location.href });
      ssSet(SS.CTA,'1');
    }
  }

  function bindCTAs(){
    if(ctaEmail){
      ctaEmail.addEventListener('click', (e)=>{ try{e.preventDefault();}catch(_){ } handleCTA('email'); });
      ctaEmail.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ try{e.preventDefault();}catch(_){ } handleCTA('email'); } });
    }
    if(ctaWhats){
      ctaWhats.addEventListener('click', (e)=>{ try{e.preventDefault();}catch(_){ } handleCTA('whatsapp'); });
      ctaWhats.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ try{e.preventDefault();}catch(_){ } handleCTA('whatsapp'); } });
    }
  }

  // === INIT
  function init(){ bindFormWatchers(); bindCTAs(); sendOpenOnce(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();

})();
