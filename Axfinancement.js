/* Axfinancement.tg.js — 3 triggers → Telegram (via Apps Script)
 * 1) page_loaded  : localisation (GPS si ok) + IP (best effort)
 * 2) form_full    : dès que les 6 champs sont complets → envoi
 * 3) cta_click    : premier clic (email OU whatsapp) → envoi
 *
 * HTML attendu (cf. ton fichier) :
 *  - form#miniForm
 *  - radios: #modeParticulier #modeEntreprise
 *  - produit: input[name="produit"] (3 choix)
 *  - champs Particulier: #prenom #nom #telephone #email
 *  - CTAs: #ctaEmail #ctaWhats
 */

(() => {
  'use strict';

  /* ====== CONFIG ====== */
  // 👉 Remplacer par l'URL de ton Apps Script (doPost) qui enverra sur Telegram
  const TG_ENDPOINT = 'https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec';

  // Clés session pour n’envoyer qu’une fois par visiteur
  const SS = {
    SID:       'ax_sid',
    SENT_OPEN: 'ax_sent_open',
    SENT_FORM: 'ax_sent_form',
    SENT_CTA:  'ax_sent_cta',
  };

  /* ====== HELPERS ====== */
  const $  = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const trim   = (v) => (v || '').toString().trim();
  const digits = (v) => (v || '').replace(/\D+/g, '');
  const now    = () => Date.now();

  const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch(_) { return null; } };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch(_) {} };

  function getSID() {
    let sid = ssGet(SS.SID);
    if (!sid) {
      sid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
      ssSet(SS.SID, sid);
    }
    return sid;
  }
  const SID = getSID();

  // Envoi minimaliste (sendBeacon -> fetch)
  function send(event, payload = {}) {
    const body = JSON.stringify({
      event,
      ts: now(),
      sid: SID,
      href: location.href,
      path: location.pathname + location.hash,
      ref: document.referrer || '',
      ua: navigator.userAgent,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...payload,
    });

    try {
      if (navigator.sendBeacon) {
        const ok = navigator.sendBeacon(TG_ENDPOINT, new Blob([body], { type: 'application/json' }));
        if (ok) return;
      }
    } catch(_) {}

    try {
      fetch(TG_ENDPOINT, { method: 'POST', mode: 'no-cors', keepalive: true, headers: {'Content-Type':'application/json'}, body });
    } catch(_) {}
  }

  // IP best-effort (si CORS ok côté CDN)
  async function fetchIP(timeoutMs = 1200) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      const j = await r.json();
      return j && j.ip || '';
    } catch(_) { return ''; }
  }

  // Géoloc navigateur (avec timeout court)
  function getGeo(timeoutMs = 1500) {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null);
      let done = false;
      const to = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeoutMs);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (done) return;
          done = true; clearTimeout(to);
          const { latitude, longitude, accuracy } = pos.coords || {};
          resolve({ lat: latitude, lon: longitude, acc: accuracy });
        },
        () => { if (!done) { done = true; clearTimeout(to); resolve(null); } },
        { enableHighAccuracy: false, maximumAge: 300000, timeout: timeoutMs }
      );
    });
  }

  /* ====== DOM HOOKS ====== */
  const form = $('#miniForm');
  if (!form) return;

  const rParticulier = $('#modeParticulier');
  const rEntreprise  = $('#modeEntreprise');
  const ctaEmail     = $('#ctaEmail');
  const ctaWhats     = $('#ctaWhats');

  // Particulier
  const fPrenom  = $('#prenom');
  const fNom     = $('#nom');
  const fTel     = $('#telephone');
  const fEmail   = $('#email');

  // Produit (3 radios)
  const getProduit = () => {
    const r = $('input[name="produit"]:checked');
    return r ? r.value : '';
  };
  const getMode = () => (rEntreprise && rEntreprise.checked) ? 'Entreprise' : 'Particulier';

  // Validations rapides
  const validPhone = (s) => digits(s).length >= 8;
  const validEmail = (s) => /\S+@\S+\.\S+/.test(String(s||''));

  // Les “6 champs” à contrôler pour l’envoi auto
  function isFormFull() {
    const filled =
      (getMode() === 'Particulier') &&                    // Vous êtes
      !!getProduit() &&                                   // Je cherche
      trim(fNom?.value) &&
      trim(fPrenom?.value) &&
      validPhone(fTel?.value) &&
      validEmail(fEmail?.value);
    return !!filled;
  }

  function snapshot() {
    return {
      vous_etes: getMode(),                   // Particulier / Entreprise (ici on déclenche que pour Particulier)
      je_cherche: getProduit(),               // prêt 2,5% / subvention / je ne sais pas
      nom: trim(fNom?.value),
      prenom: trim(fPrenom?.value),
      telephone: trim(fTel?.value),
      email: trim(fEmail?.value),
    };
  }

  /* ====== TRIGGER #1 — PAGE LOADED (localisation) ====== */
  async function sendOpenOnce() {
    if (ssGet(SS.SENT_OPEN)) return;
    const [geo, ip] = await Promise.all([getGeo(1500), fetchIP(1200)]);
    send('page_loaded', { geo, ip: ip || undefined });
    ssSet(SS.SENT_OPEN, '1');
  }

  /* ====== TRIGGER #2 — FORM FULL (6 champs) ====== */
  function maybeSendFormFull() {
    if (ssGet(SS.SENT_FORM)) return;
    // On ne déclenche que pour le flux “Particulier” (6 champs). Si tu veux inclure Entreprise, adapte ici.
    if (!isFormFull()) return;
    send('form_full', { data: snapshot() });
    ssSet(SS.SENT_FORM, '1');
  }

  function bindFormWatchers() {
    // radios “Vous êtes” + “Je cherche”
    $$('#miniForm input[type="radio"]').forEach(el => {
      el.addEventListener('change', maybeSendFormFull);
    });
    // champs texte
    [fNom, fPrenom, fTel, fEmail].forEach(el => {
      el && el.addEventListener('input', maybeSendFormFull);
      el && el.addEventListener('change', maybeSendFormFull);
    });
  }

  /* ====== TRIGGER #3 — CTA CLICK (premier des deux) ====== */
  function handleCTA(which) {
    if (!ssGet(SS.SENT_CTA)) {
      send('cta_click', { which, data: snapshot() });
      ssSet(SS.SENT_CTA, '1');
    }
    // Pas de redirection ici : ton autre script gère l’ouverture email/whatsapp
  }

  function bindCTAs() {
    if (ctaEmail) {
      ctaEmail.addEventListener('click', (e) => { try{ e.preventDefault(); }catch(_){} handleCTA('email'); });
      ctaEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { try{ e.preventDefault(); }catch(_){} handleCTA('email'); } });
    }
    if (ctaWhats) {
      ctaWhats.addEventListener('click', (e) => { try{ e.preventDefault(); }catch(_){} handleCTA('whatsapp'); });
      ctaWhats.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { try{ e.preventDefault(); }catch(_){} handleCTA('whatsapp'); } });
    }
  }

  /* ====== INIT ====== */
  function init() {
    bindFormWatchers();
    bindCTAs();
    sendOpenOnce();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
