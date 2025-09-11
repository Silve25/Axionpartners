'use strict';
/**
 * Axfinancement.js — v2 (pré‑messages dynamiques + Apps Script + pixel complet)
 *
 * 🔧 À configurer :
 *  - CONFIG.GAS_LEAD_URL : Web App Apps Script pour les leads (doPost JSON)
 *  - CONFIG.GAS_PIXEL_URL : Web App Apps Script pour les événements/pixel
 *  - CONFIG.EMAIL_TO : adresse de réception
 *  - CONFIG.WHATSAPP_PHONE : "447403650201" (UK, sans +)
 *
 * Fonctionnalités :
 *  - Préremplissage intelligent des CTAs E‑mail & WhatsApp en fonction du formulaire
 *  - Notice si formulaire incomplet (sans griser les boutons)
 *  - Envoi du lead vers Apps Script au submit ET au clic CTA
 *  - Pixel très complet : page, scroll, sections, FAQ, carrousel, heartbeat, visibilité
 *  - Carrousel horizontal fluide (molette, boutons, clavier)
 */

const CONFIG = {
  GAS_LEAD_URL: 'https://script.google.com/macros/s/REPLACE_WITH_LEAD_DEPLOYMENT_ID/exec',
  GAS_PIXEL_URL: 'https://script.google.com/macros/s/REPLACE_WITH_PIXEL_DEPLOYMENT_ID/exec',
  EMAIL_TO: 'Contact@axionpartners.eu',
  WHATSAPP_PHONE: '447403650201',
  TELEGRAM_FORWARD: true,
  HEARTBEAT_SECONDS: 15,
  HEARTBEAT_MAX: 10*60,
};

// ————— Utils —————
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const now = ()=>Date.now();
const uuid = ()=>'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16)});
const enc = encodeURIComponent;

const parseUtm = ()=>{
  const p = new URLSearchParams(location.search);
  const keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','msclkid'];
  const out = {}; keys.forEach(k=>{ if(p.get(k)) out[k]=p.get(k); });
  return out;
};
const deviceInfo = ()=>({
  ua: navigator.userAgent,
  lang: navigator.language,
  viewport: {w: innerWidth, h: innerHeight},
  screen: {w: screen.width, h: screen.height, dpr: devicePixelRatio||1},
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  platform: navigator.platform,
});

// ————— Session —————
const SESSION = (()=>{ const k='axion.sid'; let sid=localStorage.getItem(k); if(!sid){ sid=uuid(); localStorage.setItem(k,sid); } return {sid, start: now(), utm: parseUtm()}; })();

// ————— Transport vers Apps Script —————
function sendToGAS(url, payload, {urgent=false}={}){
  try{
    const body = JSON.stringify(payload);
    if(urgent && navigator.sendBeacon){ return navigator.sendBeacon(url, new Blob([body],{type:'application/json'})); }
    return fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body});
  }catch(e){ /* noop */ }
}
function px(evt, data={}, opts={}){
  const payload = { evt, data, ts: now(), sid: SESSION.sid, url: location.href, ref: document.referrer||null, utm: SESSION.utm, meta: deviceInfo(), forward_telegram: CONFIG.TELEGRAM_FORWARD };
  return sendToGAS(CONFIG.GAS_PIXEL_URL, payload, opts);
}

// ————— Form logic —————
const form = $('#miniForm');
const modeRadios = $$('input[name="mode"]');
const ctaEmail = $('#ctaEmail');
const ctaWhats = $('#ctaWhats');
const ctaNotice = $('#ctaNotice');
let leadId = localStorage.getItem('axion.leadId') || null;
let leadSent = false;

function mode(){ const r = $('input[name="mode"]:checked'); return r? r.value : 'particulier'; }
function formValues(){
  if(!form) return {};
  const m = mode();
  const get = id=>{ const el = $('#'+id); return el? (el.value||'').trim() : ''; };
  if(m==='entreprise'){
    return {
      mode: 'entreprise',
      SOCIETE: get('societe'),
      CONTACT: get('contact'),
      TELEPHONE: get('telEntreprise'),
      EMAIL: get('emailEntreprise'),
      PRENOM: '', NOM: '',
    };
  }
  return {
    mode: 'particulier',
    PRENOM: get('prenom'),
    NOM: get('nom'),
    TELEPHONE: get('telephone'),
    EMAIL: get('email'),
    SOCIETE: '', CONTACT: '',
  };
}
function telOk(s){ return (s||'').replace(/\D/g,'').length >= 8; }
function emailOk(s){ return /.+@.+\..+/.test(s||''); }
function minimalValid(v){
  // Toujours nécessaires : téléphone + email
  if(!telOk(v.TELEPHONE) || !emailOk(v.EMAIL)) return false;
  // Au moins une identité : individu (prenom+nom) ou entreprise (societe)
  if(v.mode==='particulier') return !!(v.PRENOM && v.NOM);
  return !!(v.SOCIETE);
}

function replaceTokens(tpl, v){
  return (tpl||'').replace(/\{PRENOM\}|\{NOM\}|\{TELEPHONE\}|\{EMAIL\}|\{SOCIETE\}|\{CONTACT\}/g, m=>{
    switch(m){
      case '{PRENOM}': return v.PRENOM||'';
      case '{NOM}': return v.NOM||'';
      case '{TELEPHONE}': return v.TELEPHONE||'';
      case '{EMAIL}': return v.EMAIL||'';
      case '{SOCIETE}': return v.SOCIETE||'';
      case '{CONTACT}': return v.CONTACT||'';
      default: return '';
    }
  });
}

function buildMailto(v){
  const subjAttr = v.mode==='entreprise' ? 'data-mail-subject-entreprise' : 'data-mail-subject-indiv';
  const bodyAttr = v.mode==='entreprise' ? 'data-mail-body-entreprise' : 'data-mail-body-indiv';
  const subject = replaceTokens(ctaEmail.getAttribute(subjAttr)||'Ouverture de dossier', v);
  const body = replaceTokens(ctaEmail.getAttribute(bodyAttr)||'Bonjour, je souhaite ouvrir mon dossier.', v);
  return `mailto:${CONFIG.EMAIL_TO}?subject=${enc(subject)}&body=${enc(body)}`;
}
function buildWhats(v){
  const tAttr = v.mode==='entreprise' ? 'data-wa-template-entreprise' : 'data-wa-template-indiv';
  const text = replaceTokens(ctaWhats.getAttribute(tAttr)||'Bonjour Axion Partners', v);
  return `https://api.whatsapp.com/send?phone=${CONFIG.WHATSAPP_PHONE}&text=${text}`;
}

async function sendLead(trigger){
  if(!leadId) leadId = uuid();
  const v = formValues();
  const payload = { ts: now(), sid: SESSION.sid, lead_id: leadId, trigger, page: location.pathname, fields: v, utm: SESSION.utm, ref: document.referrer||null };
  try{ await sendToGAS(CONFIG.GAS_LEAD_URL, payload); localStorage.setItem('axion.leadId', leadId); leadSent = true; px('lead_sent',{trigger}); return true; }
  catch(e){ px('lead_send_error',{trigger,error:String(e)}); return false; }
}

function showNotice(msg){ if(!ctaNotice) return; ctaNotice.textContent = msg||'Veuillez compléter le mini‑formulaire.'; ctaNotice.classList.remove('hidden'); ctaNotice.animate([{transform:'translateY(-2px)'},{transform:'translateY(0)'}],{duration:120}); }
function hideNotice(){ ctaNotice && ctaNotice.classList.add('hidden'); }

function updateCtasHref(){
  const v = formValues();
  if(minimalValid(v)){
    hideNotice();
    if(ctaEmail) ctaEmail.setAttribute('href', buildMailto(v));
    if(ctaWhats) ctaWhats.setAttribute('href', buildWhats(v));
  }
}

// ————— Carousel horizontal —————
function initCarousel(){
  const track = $('#track'); if(!track) return;
  const slides = $$('.slide', track); if(!slides.length) return;
  const leftBtn = $('.controls .ctrl:first-child');
  const rightBtn = $('.controls .ctrl:last-child');

  const gap = 14; // CSS gap
  const slideWidth = ()=> slides[0].getBoundingClientRect().width + gap;

  function scrollBySlides(n){ track.scrollBy({left: n*slideWidth(), behavior:'smooth'}); }
  leftBtn && leftBtn.addEventListener('click', (e)=>{ e.preventDefault(); scrollBySlides(-1); px('carousel_nav',{dir:'left'}); });
  rightBtn && rightBtn.addEventListener('click', (e)=>{ e.preventDefault(); scrollBySlides(1); px('carousel_nav',{dir:'right'}); });

  // Molette => horizontal
  track.addEventListener('wheel', (e)=>{ if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){ e.preventDefault(); track.scrollBy({left: e.deltaY>0? slideWidth(): -slideWidth(), behavior:'smooth'}); } }, {passive:false});
  // Clavier
  track.addEventListener('keydown', (e)=>{ if(e.key==='ArrowRight') scrollBySlides(1); if(e.key==='ArrowLeft') scrollBySlides(-1); });
  // Pixels
  const io = new IntersectionObserver((entries)=>{ entries.forEach(en=>{ if(en.isIntersecting){ const id=en.target.id||'s'; px('testi_view',{id}); io.unobserve(en.target);} }); }, {root: track, threshold: 0.6});
  slides.forEach(s=>io.observe(s));
}

// ————— Pixel engagement —————
function initPixel(){
  px('page_open', {hash: location.hash||null});
  // heartbeat
  let engaged=false, elapsed=0, hb;
  function startHB(){ if(hb) return; hb=setInterval(()=>{ elapsed += CONFIG.HEARTBEAT_SECONDS; if(document.visibilityState==='visible'){ px('heartbeat',{elapsed, engaged}); } if(elapsed>=CONFIG.HEARTBEAT_MAX){ clearInterval(hb); hb=null; } }, CONFIG.HEARTBEAT_SECONDS*1000); }
  startHB();
  ['mousedown','scroll','keydown','touchstart'].forEach(ev=>document.addEventListener(ev, ()=> engaged=true, {once:true, passive:true}));
  // scroll depth
  let d25=false,d50=false,d75=false,d100=false;
  window.addEventListener('scroll', ()=>{ const h=document.documentElement; const max=h.scrollHeight-h.clientHeight; const pct=Math.round((h.scrollTop/max)*100); if(!d25 && pct>=25){d25=true; px('scroll_25');} if(!d50 && pct>=50){d50=true; px('scroll_50');} if(!d75 && pct>=75){d75=true; px('scroll_75');} if(!d100 && pct>=98){d100=true; px('scroll_100');} }, {passive:true});
  // sections
  ['benefices','etapes','temoignages','faq'].forEach(id=>{ const el=$('#'+id); if(!el) return; const io=new IntersectionObserver((es)=>{ es.forEach(e=>{ if(e.isIntersecting){ px('section_view',{id}); io.disconnect(); } }); }, {threshold:0.5}); io.observe(el); });
  // faq toggle
  $$('.faq details.qa').forEach(d=> d.addEventListener('toggle', ()=> px('faq_toggle',{q: d.querySelector('summary')?.textContent||'q', open: d.open})) );
  // visibility
  document.addEventListener('visibilitychange', ()=> px('visibility_change',{state: document.visibilityState}), {passive:true});
  window.addEventListener('pagehide', ()=> px('page_hide',{}, {urgent:true}));
}

// ————— Event handlers —————
function initForm(){
  if(!form) return;
  let started=false; // pixel form_started
  form.addEventListener('input', (e)=>{ if(!started){ started=true; px('form_started'); } px('form_input',{name:e.target.name||'unk'}); updateCtasHref(); if(ctaNotice && !ctaNotice.classList.contains('hidden')){ if(minimalValid(formValues())) hideNotice(); } }, {passive:true});
  form.addEventListener('focusin', (e)=> px('form_focus',{name:e.target.name||'unk'}), {passive:true});
  modeRadios.forEach(r=> r.addEventListener('change', ()=>{ px('mode_change',{mode: mode()}); updateCtasHref(); }) );

  // submit (facultatif si l'utilisateur clique direct sur un CTA)
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const v = formValues();
    if(!minimalValid(v)){ showNotice('Veuillez compléter vos coordonnées pour personnaliser votre message.'); px('form_invalid_submit'); return; }
    px('form_submit_attempt');
    await sendLead('submit');
    alert('Merci ! Nous revenons vers vous rapidement.');
  });
}

function initCtas(){
  if(ctaEmail){
    ctaEmail.addEventListener('click', async (e)=>{
      const v = formValues();
      if(!minimalValid(v)){ e.preventDefault(); showNotice('Veuillez compléter le mini‑formulaire avant d\'envoyer votre message.'); px('cta_email_blocked'); return; }
      // Mettre à jour le lien avec les valeurs
      ctaEmail.setAttribute('href', buildMailto(v));
      px('cta_email_click');
      if(!leadSent) await sendLead('cta_email');
      // laisser le navigateur ouvrir le mailto
    });
  }
  if(ctaWhats){
    ctaWhats.addEventListener('click', async (e)=>{
      const v = formValues();
      if(!minimalValid(v)){ e.preventDefault(); showNotice('Veuillez compléter le mini‑formulaire avant d\'envoyer votre message.'); px('cta_whatsapp_blocked'); return; }
      const link = buildWhats(v);
      ctaWhats.setAttribute('href', link);
      px('cta_whatsapp_click');
      if(!leadSent) await sendLead('cta_whatsapp');
      // laisser le navigateur ouvrir l'URL WhatsApp
    });
  }
}

// ————— Boot —————
(function(){
  initPixel();
  initForm();
  initCtas();
  initCarousel();
  // Préparer les liens une première fois (au cas où le user a rempli via auto‑fill)
  setTimeout(updateCtasHref, 100);
})();
