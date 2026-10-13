/* ===== CONFIG — replace before going live ===== */
const NOMADE_CONFIG = {
  // PLACEHOLDER: set to your form endpoint (e.g. your own API route). Left null = no network request.
  FORM_ENDPOINT: '/api/waitlist', // same-origin on nomade-app
};
/* Pluggable analytics hook. Swap the body for your provider (PostHog, Plausible, GA…). */
function trackEvent(name, props = {}) {
  // Vercel Web Analytics custom event. Guarded: a no-op queue if the script is off/blocked.
  try { if (typeof window.va === 'function') window.va('event', { name, data: props }); } catch (_) {}
  window.dataLayer = window.dataLayer || []; window.dataLayer.push({ event: name, ...props });
}

const modal = document.getElementById('modal');
const form = document.getElementById('reserve');
const names = { free: 'T—01 · Path Finder · Free', pathpack_79: 'T—02 · Path Pack · $79', review_199: 'T—03 · Path Pack + Review · $199' };
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
  const tier = b.dataset.tier;
  trackEvent('tier_click', { tier });
  form.tier.value = tier;
  document.getElementById('m-tier').textContent = names[tier] || 'Early access · Launch pricing';
  form.querySelector('.m-body').hidden = false; form.querySelector('.m-done').hidden = true;
  modal.showModal();
}));
modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) modal.close(); });
form.addEventListener('submit', async e => {
  e.preventDefault();
  const err = form.querySelector('.err');
  if (!form.email.checkValidity()) { err.textContent = 'Please enter a valid email.'; form.email.focus(); return; }
  err.textContent = '';
  const data = Object.fromEntries(new FormData(form)); data.ts = new Date().toISOString(); data.source = 'nomadevisa_landing'; try { if (document.referrer) data.referrer_host = new URL(document.referrer).hostname; } catch (_) {}
  const q = new URLSearchParams(location.search); ['utm_source','utm_medium','utm_campaign','utm_content'].forEach(k => { if (q.get(k)) data[k] = q.get(k); });
  trackEvent('reserve_submit', { tier: data.tier, path: data.path, move_date: data.move_date });
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  if (NOMADE_CONFIG.FORM_ENDPOINT) {
    try {
      const r = await fetch(NOMADE_CONFIG.FORM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok !== true) throw new Error('HTTP ' + r.status);
    } catch (x) { trackEvent('reserve_error', { message: String(x) }); err.textContent = "Couldn't save that email. Try again."; btn.disabled = false; return; }
  }
  btn.disabled = false;
  form.querySelector('.m-body').hidden = true; form.querySelector('.m-done').hidden = false;
});

/* Scroll reveals */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
document.querySelectorAll('.reveal').forEach((el, i) => { el.style.setProperty('--d', (i % 4) * 80 + 'ms'); io.observe(el); });

/* Passport sequence */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const seq = document.getElementById('seq'), fill = document.getElementById('seqfill');
const items = [...document.querySelectorAll('#check li')];
function setSeq(p) {
  const n = Math.min(4, 1 + Math.floor(p * 4)); seq.textContent = '0' + n + ' / 04';
  fill.style.transform = `scaleX(${p})`;
}
if (reduce || !window.gsap) {
  document.body.classList.add('static-seq');
  items.forEach(li => li.classList.add('on')); setSeq(1);
} else {
  gsap.registerPlugin(ScrollTrigger);
  gsap.set('#passport', { xPercent: -50, rotateY: -14, rotateX: 18 });
  // intro: passport lands
  gsap.from('#passport', { duration: 1.6, ease: 'expo.out', rotateX: 62, rotateZ: -24, y: 160, z: -300, opacity: 0 });
  gsap.from('.shadow', { duration: 1.6, ease: 'expo.out', opacity: 0, scale: .5 });
  gsap.from('.giant span', { duration: 1.4, ease: 'expo.out', yPercent: 110, stagger: .06, delay: .1 });
  gsap.from('.hero-copy > *, .chips li', { duration: 1, ease: 'expo.out', y: 24, opacity: 0, stagger: .07, delay: .3 });

  const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' },
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom bottom', scrub: .8,
      onUpdate: s => { setSeq(s.progress); const k = gsap.utils.clamp(0, 1, (s.progress - .68) / .3);
        items.forEach((li, i) => li.classList.toggle('on', k > (i + .5) / items.length)); } } });
  tl.set('#passport', { '--open': 0 })
    .fromTo('#passport', { xPercent: -50, rotateY: -14, rotateX: 18 }, { xPercent: 0, rotateY: 0, rotateX: 10, duration: .28 }, 0)
    .to('#cover', { rotateY: -178, duration: .28 }, 0)
    .to('.giant', { yPercent: -6, opacity: .55, duration: .3 }, 0)
    .fromTo('#visa', { x: '125%', y: '-30%', rotate: 9, opacity: 0 }, { x: 0, y: 0, rotate: -1.5, opacity: 1, duration: .22, ease: 'power3.out' }, .3)
    .fromTo('#stamp', { scale: 2.6, opacity: 0, rotate: 8 }, { scale: 1, opacity: .92, rotate: -14, duration: .1, ease: 'power4.in' }, .56)
    .fromTo('#passport', { y: 0 }, { y: 6, duration: .03, yoyo: true, repeat: 1 }, .66)
    .fromTo('#check', { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: .08 }, .66)
    .to({}, { duration: .26 });
}

/* Fake-door analytics: FAQ opens + hero sequence depth (fires once per step) */
document.querySelectorAll('#faq details').forEach((d, i) => d.addEventListener('toggle', () => { if (d.open) trackEvent('faq_open', { q: String(i + 1) }); }));
const seenSteps = new Set();
new MutationObserver(() => { const n = seq.textContent.slice(0, 2); if (!seenSteps.has(n)) { seenSteps.add(n); trackEvent('hero_step', { step: n }); } }).observe(seq, { childList: true });

/* ===== Italy media (task/landing-italy-media) ===== */
/* Intro: once per session, skippable, reduced-motion aware, hard cap ~2.5s. */
(function intro() {
  const root = document.documentElement, el = document.getElementById('intro');
  if (!el) return;
  if (!root.classList.contains('has-intro') || reduce || !window.gsap) { root.classList.remove('has-intro'); el.remove(); return; }
  try { sessionStorage.setItem('nm-intro', '1'); } catch (_) {}
  el.hidden = false;
  const veil = el.querySelector('.intro-veil'), mark = el.querySelector('.intro-mark');
  const pr = document.getElementById('passport').getBoundingClientRect();
  veil.style.setProperty('--cx', (pr.left + pr.width / 2) + 'px'); veil.style.setProperty('--cy', (pr.top + pr.height / 2) + 'px');
  const R = Math.hypot(innerWidth, innerHeight);
  let done = false;
  const tl = gsap.timeline({ onComplete: end });
  tl.from(mark, { duration: .45, opacity: 0, scale: .6, ease: 'expo.out' })
    .to(mark, { duration: .3, opacity: 0, scale: 1.6, ease: 'power2.in' }, .55)
    .fromTo(veil, { '--r': '0px' }, { '--r': R + 'px', duration: 1.25, ease: 'expo.inOut' }, .7)
    .fromTo('.scene', { scale: .32 }, { scale: 1, duration: 1.35, ease: 'expo.inOut', clearProps: 'transform' }, .65);
  function end() {
    if (done) return; done = true; tl.progress(1); tl.kill(); gsap.set('.scene', { clearProps: 'transform' });
    root.classList.remove('has-intro'); el.remove();
    removeEventListener('keydown', end); removeEventListener('wheel', end); removeEventListener('touchstart', end);
  }
  document.getElementById('intro-skip').addEventListener('click', end);
  addEventListener('keydown', end, { once: true }); addEventListener('wheel', end, { once: true, passive: true }); addEventListener('touchstart', end, { once: true, passive: true });
  setTimeout(end, 2500); // never block content longer than ~2.5s
})();

/* Mask word toggle: <figure id="vmask" data-word="VISTO|ITALIA" data-font="slab|geist"> */
(function maskWord() {
  const f = document.getElementById('vmask'); if (!f) return;
  const w = (f.dataset.word || 'VISTO').toUpperCase(), t = f.querySelector('.vm-cut text'), l = f.querySelector('.vm-word');
  if (t) t.textContent = w; if (l) l.setAttribute('aria-label', w.charAt(0) + w.slice(1).toLowerCase());
})();

/* Media: lazy video with poster fallback on save-data / slow links / reduced motion */
(function media() {
  const c = navigator.connection || {};
  const lite = reduce || c.saveData || /(^|-)2g|3g/.test(c.effectiveType || '');
  document.querySelectorAll('video[data-lazy-video]').forEach(v => {
    const vio = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) {
        if (!v.poster) v.poster = v.dataset.poster; // poster lazy too
        if (lite) { vio.disconnect(); return; } // save-data / slow link / reduced motion: poster only
        if (!v.dataset.loaded) { v.dataset.loaded = '1'; v.preload = 'metadata'; v.querySelectorAll('source').forEach(s => { s.src = s.dataset.src; }); v.load(); }
        v.play().catch(() => {});
      } else if (v.dataset.loaded) v.pause();
    }), { rootMargin: '200px 0px' });
    vio.observe(v);
  });
  const bio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); bio.unobserve(e.target); } }), { threshold: .15 });
  document.querySelectorAll('.m-band').forEach(b => bio.observe(b));
})();
