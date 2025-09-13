/* Axfinancement.js — 3 triggers vers Apps Script (anti-CORS, IP only)
 * 1) page_loaded  : IP (+ ville/pays best-effort)
 * 2) form_full    : 6 champs valides (Vous êtes, Je cherche, Nom, Prénom, Téléphone, Email)
 * 3) cta_click    : 1er clic (email OU whatsapp) + ouverture du lien personnalisé
 *
 * HTML requis :
 *  - <form id="miniForm"> … </form>
 *  - Radios #modeParticulier / #modeEntreprise
 *  - input[name="produit"] : 3 choix
 *  - Particulier : #prenom #nom #telephone #email
 *  - Entreprise  : #societe #contact #telEntreprise #emailEntreprise
 *  - CTAs : #ctaEmail #ctaWhats
 *  - Notice (optionnel) : #ctaNotice
 */
(function(){
  'use strict';

  /* ========= CONFIG ========= */
  var TG_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyEIdqQJtALe_I7tPuHd0TglrYR176gay9_m0qv00aVViASa9-Y-IrapdqpYGwB4-DH8w/exec';
  var EMAIL_TO    = 'Contact@axionpartners.eu';
  var WHATS_APP   = '447403650201'; // sans '+'

  var SS = { SID:'ax_sid', OPEN:'ax_sent_open', FORM:'ax_sent_form', CTA:'ax_sent_cta' };

  /* ========= UTILS ========= */
  var $  = function(s,root){ return (root||document).querySelector(s); };
  var $$ = function(s,root){ return Array.prototype.slice.call((root||document).querySelectorAll(s)); };
  var trim   = function(v){ return (v||'').toString().trim(); };
  var digits = function(v){ return (v||'').replace(/\D+/g,''); };
  var now    = function(){ return Date.now(); };

  function ssGet(k){ try{return sessionStorage.getItem(k);}catch(_){return null;} }
  function ssSet(k,v){ try{sessionStorage.setItem(k,v);}catch(_){ } }

  function getSID(){
    var sid = ssGet(SS.SID);
    if(!sid){
      sid = (Date.now().toString(36)+Math.random().toString(36).slice(2,10));
      ssSet(SS.SID, sid);
    }
    return sid;
  }
  var SID = getSID();

  function b64url(utf8){
    var b64 = btoa(unescape(encodeURIComponent(utf8)));
    return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  // Transport anti-CORS : text/plain (simple request) + pixel GET
  function sendEvent(event, payload){
    var bodyStr = JSON.stringify(Object.assign({
      event: event, ts: now(), sid: SID
    }, payload||{}));

    // 1) sendBeacon (text/plain) — pas de préflight
    try{
      if(navigator.sendBeacon){
        var ok = navigator.sendBeacon(TG_ENDPOINT, new Blob([bodyStr], {type:'text/plain'}));
        console.debug('[ax] beacon', event, ok);
        if(ok) { /* on envoie quand même le pixel pour résilience */ }
      }
    }catch(e){ console.debug('[ax] beacon err', e); }

    // 2) fetch simple (aucun header custom) — pas de préflight
    try{
      fetch(TG_ENDPOINT, { method:'POST', mode:'no-cors', keepalive:true, body: bodyStr })
        .then(function(){ console.debug('[ax] fetch sent', event); })
        .catch(function(e){ console.debug('[ax] fetch err', e); });
    }catch(e){ console.debug('[ax] fetch thrown', e); }

    // 3) GET pixel (toujours) — arrive même si CORS/proxy bloquent le POST
    try{
      var img = new Image();
      img.src = TG_ENDPOINT + '?data=' + b64url(bodyStr);
      console.debug('[ax] pixel GET', event);
    }catch(e){ console.debug('[ax] pixel err', e); }
  }

  // IP only (aucune permission), enrichi ville/pays best-effort
  function fetchIpInfo(timeoutMs){
    timeoutMs = timeoutMs || 1500;
    var ctrl = new AbortController();
    var to = setTimeout(function(){ try{ctrl.abort();}catch(_){ } }, timeoutMs);

    return fetch('https://api.ipify.org?format=json', {signal:ctrl.signal, cache:'no-store'})
      .then(function(r){ return r.json(); })
      .then(function(j){
        clearTimeout(to);
        var ip = (j && j.ip) || '';
        return fetch('https://ipapi.co/'+ip+'/json/', {cache:'no-store'})
          .then(function(r2){ return r2.json(); })
          .then(function(j2){
            return {
              ip: ip,
              loc: {
                country: (j2 && (j2.country_name || j2.country)) || undefined,
                city:    (j2 && j2.city)    || undefined,
                region:  (j2 && j2.region)  || undefined
              }
            };
          })
          .catch(function(){ return { ip: ip, loc: null }; });
      })
      .catch(function(){ clearTimeout(to); return { ip:'', loc:null }; });
  }

  // Encodage CTA (comme avant)
  function encodeWA(txt){ return encodeURIComponent(txt); }
  function encodeMail(txt){ return encodeURIComponent(String(txt).replace(/\r?\n/g, '\r\n')); }
  function toMailto(subject, body){ return 'mailto:'+EMAIL_TO+'?subject='+encodeMail(subject)+'&body='+encodeMail(body); }
  function toWhats(body){ return 'https://api.whatsapp.com/send?phone='+WHATS_APP+'&text='+encodeWA(body); }

  /* ========= DOM ========= */
  var form = $('#miniForm');
  if(!form){ console.warn('[Axfinancement] #miniForm introuvable'); return; }

  var rEntreprise = $('#modeEntreprise');
  var getMode = function(){ return (rEntreprise && rEntreprise.checked) ? 'entreprise' : 'particulier'; };
  var getProduit = function(){ var r=$('input[name="produit"]:checked'); return r ? r.value : 'je ne sais pas encore'; };

  // Particulier
  var fPrenom = $('#prenom');
  var fNom    = $('#nom');
  var fTel    = $('#telephone');
  var fEmail  = $('#email');

  // Entreprise
  var fSociete  = $('#societe');
  var fContact  = $('#contact'); // "Nom & prénom"
  var fTelEnt   = $('#telEntreprise');
  var fEmailEnt = $('#emailEntreprise');

  // CTAs
  var ctaEmail  = $('#ctaEmail');
  var ctaWhats  = $('#ctaWhats');
  var ctaNotice = $('#ctaNotice');

  function showNotice(msg){
    if(!ctaNotice) return;
    ctaNotice.textContent = msg || 'Merci de compléter le formulaire (coordonnées).';
    ctaNotice.classList.remove('hidden');
    setTimeout(function(){ ctaNotice.classList.add('hidden'); }, 3500);
  }

  var phoneOK = function(s){ return digits(s).length >= 8; };
  var emailOK = function(s){ return /\S+@\S+\.\S+/.test(String(s||'')); };

  // “6 champs standard”
  function snapshotSix(){
    var produit = getProduit();
    if(getMode()==='entreprise'){
      var contact = trim(fContact && fContact.value);
      var prenom='', nom='';
      if(contact){
        var parts = contact.split(/\s+/);
        prenom = parts.shift() || '';
        nom    = parts.join(' ');
        if(!nom){ nom = trim(fSociete && fSociete.value) || ''; } // fallback léger si 1 seul mot
      }
      return {
        vous_etes: 'Entreprise',
        je_cherche: produit,
        nom: nom,
        prenom: prenom,
        telephone: trim(fTelEnt && fTelEnt.value),
        email: trim(fEmailEnt && fEmailEnt.value)
      };
    }
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
    return !!( d.vous_etes &&
               d.je_cherche &&
               d.nom &&
               d.prenom &&
               phoneOK(d.telephone) &&
               emailOK(d.email) );
  }

  // Messages CTA (identiques à l’ancien)
  function buildMessages(d){
    var produit = d.je_cherche || 'je ne sais pas encore';
    if(d.vous_etes==='Entreprise'){
      var soc = trim(fSociete && fSociete.value) || d.nom || '';
      var who = (fContact && trim(fContact.value))
        ? ('Nous sommes '+soc+'. Je suis '+trim(fContact.value)+'.')
        : ('Nous sommes '+soc+'.');
      var body = 'Bonjour Axion Partners,\n'+
                 who+'\n'+
                 'Nous souhaitons obtenir '+produit+'.\n'+
                 'Voici notre numéro WhatsApp : '+d.telephone+'.\n\n'+
                 'Merci,\n'+
                 soc;
      return { subject:'Ouverture de dossier — '+soc, body: body };
    }
    var fullName = (d.prenom+' '+d.nom).replace(/\s+/g,' ').trim();
    var body2 = 'Bonjour Axion Partners,\n'+
                'Je suis '+fullName+' et je souhaite obtenir '+produit+'.\n'+
                'Voici mon numéro WhatsApp : '+d.telephone+'. Vous pouvez me contacter dessus.\n\n'+
                'Merci,\n'+
                fullName;
    return { subject:'Ouverture de dossier — '+fullName, body: body2 };
  }

  /* ===== Trigger #1 — page_loaded ===== */
  function sendPageLoadedOnce(){
    if(ssGet(SS.OPEN)) return;
    fetchIpInfo(1500).then(function(info){
      var meta = {
        href: location.href,
        ref: document.referrer || '',
        ua: navigator.userAgent,
        lang: navigator.language,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio||1 }
      };
      sendEvent('page_loaded', Object.assign({}, meta, {
        ip: (info && info.ip) || undefined,
        geo: (info && info.loc) || undefined
      }));
      ssSet(SS.OPEN,'1');
    });
  }

  /* ===== Trigger #2 — form_full (6 champs) ===== */
  function maybeSendFormFull(){
    if(ssGet(SS.FORM)) return;
    var snap = snapshotSix();
    if(!sixFilled(snap)) return;
    sendEvent('form_full', {
      data: snap,
      href: location.href,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    ssSet(SS.FORM,'1');
    console.debug('[ax] form_full', snap);
  }

  function bindFormWatchers(){
    $$('#miniForm input[type="radio"]').forEach(function(el){
      el.addEventListener('change', maybeSendFormFull);
    });
    [fNom,fPrenom,fTel,fEmail,fSociete,fContact,fTelEnt,fEmailEnt].forEach(function(el){
      if(!el) return;
      el.addEventListener('input',  maybeSendFormFull);
      el.addEventListener('change', maybeSendFormFull);
    });
  }

  /* ===== Trigger #3 — cta_click ===== */
  function handleCTA(kind){
    var snap = snapshotSix();
    if(!sixFilled(snap)){
      showNotice("Formulaire incomplet. Merci d'ajouter vos coordonnées.");
      return;
    }
    if(!ssGet(SS.CTA)){
      sendEvent('cta_click', { which: kind, data: snap, href: location.href });
      ssSet(SS.CTA,'1');
      console.debug('[ax] cta_click', kind, snap);
    }
    var msg = buildMessages(snap);
    if(kind==='email'){ location.href = toMailto(msg.subject, msg.body); }
    else{ window.open(toWhats(msg.body), '_blank', 'noopener'); }
  }

  function bindCTAs(){
    var email = $('#ctaEmail');
    var whats = $('#ctaWhats');
    function onKey(fn){ return function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fn(); } }; }

    if(email){
      email.addEventListener('click', function(e){ e.preventDefault(); handleCTA('email'); });
      email.addEventListener('keydown', onKey(function(){ handleCTA('email'); }));
    }
    if(whats){
      whats.addEventListener('click', function(e){ e.preventDefault(); handleCTA('whatsapp'); });
      whats.addEventListener('keydown', onKey(function(){ handleCTA('whatsapp'); }));
    }
  }

  /* ===== INIT ===== */
  function init(){ bindFormWatchers(); bindCTAs(); sendPageLoadedOnce(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
