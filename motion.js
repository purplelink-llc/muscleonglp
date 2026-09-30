/* Motion for getmuscleonglp.com. Deferred, no dependencies, one shared
   IntersectionObserver, no scroll handlers. Everything here enhances
   content that is already fully visible: with JS off, with reduced motion,
   or if this file fails, the page shows its final state.

   What it does
   - Reveals: elements below the fold ease in as they are scrolled to;
     grid children enter in a short stagger (see the tables below).
   - Buy bar: on product pages, a slim bar appears once the buy box has
     scrolled away and leaves before the closing call to action. It only
     links back to the existing buy box; checkout stays where it was.

   The reveal half stops when the visitor prefers reduced motion. The buy
   bar is navigation, not motion, so it stays. */
(() => {
  'use strict';
  const doc = document;
  const $$ = (s, r = doc) => [...r.querySelectorAll(s)];

  /* Reveal ------------------------------------------------------------ */
  // Each match eases in on its own.
  const SINGLE = [
    '.problem-card', '.evidence-quote', '.price-card', '.capture .subscribe-form',
    '.app-teaser-form', '.article-cta', '.related-reading', '.article-capture',
    '.inline-capture', '.finalcta .wrap', '.lr-grid', '.evidence-note',
    '.guide-buybox + .guide-buybox', '.section h2', '.section > .wrap > .lead',
  ];
  // Each child of a match eases in, staggered.
  const GROUPS = [
    '.feature-grid', '.guide-grid', '.learn-grid', '.statband .grid', '.why-list',
    '.cite-list', '.problem-list', '.inside-list', '.faq-list', '.social-cards',
    '.app-teaser-feats', '.stats-cards', '.gear-list',
  ];
  // Screenshots settle in through a CSS scroll timeline where the browser
  // has one; elsewhere they take the same reveal as everything else.
  const SHOTS = '.preview-strip img';

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  const initReveal = () => {
    if (reduce.matches || !('IntersectionObserver' in window)) return;
    const armed = new Set();

    const show = (el) => {
      io.unobserve(el);
      armed.delete(el);
      el.removeAttribute('data-m-armed');
      el.setAttribute('data-m-in', '');
    };
    const io = new IntersectionObserver((entries) => {
      let n = 0;
      entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => (a.target.compareDocumentPosition(b.target) & 4 ? -1 : 1))
        .forEach((e) => {
          if (n) e.target.dataset.mI = Math.min(n, 5);
          n += 1;
          show(e.target);
        });
    }, { rootMargin: '0px 0px -8% 0px' });

    const arm = (el) => {
      // Ad units and anything already near the fold are left alone.
      // One system per element: an armed ancestor already carries it.
      if (el.closest('ins') || (el.parentElement && el.parentElement.closest('[data-m-armed]'))) return;
      if (el.getBoundingClientRect().top < innerHeight * 0.92) return;
      el.setAttribute('data-m-armed', '');
      armed.add(el);
      io.observe(el);
    };

    SINGLE.forEach((s) => $$(s).forEach((el) => {
      if (!el.closest('.article, .references')) arm(el);
    }));
    GROUPS.forEach((s) => $$(s).forEach((g) => [...g.children].forEach(arm)));
    if (!(CSS.supports && CSS.supports('animation-timeline: view()'))) $$(SHOTS).forEach(arm);

    // A hidden tab or a print pass never scrolls: show everything.
    const all = () => [...armed].forEach(show);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) all(); });
    addEventListener('beforeprint', all);
    reduce.addEventListener('change', () => { if (reduce.matches) { all(); io.disconnect(); } });
    if (doc.hidden) all();
  };

  /* Buy bar ----------------------------------------------------------- */
  const initBar = () => {
    const boxes = $$('.guide-buybox');
    const first = boxes[0];
    const label = first && first.querySelector('[data-checkout], [type="submit"]');
    if (!first || !first.id || !label || !('IntersectionObserver' in window)) return;
    try { if (sessionStorage.getItem('mog-bar-off')) return; } catch (e) { /* storage off */ }

    const price = first.querySelector('.now');
    const unit = first.querySelector('.unit');
    const bar = doc.createElement('div');
    bar.className = 'm-bar';
    bar.hidden = true;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Purchase');
    const text = doc.createElement('span');
    text.className = 'm-bar-t';
    if (price) {
      const strong = doc.createElement('strong');
      strong.textContent = price.textContent;
      text.append(strong);
    }
    if (unit) {
      const u = doc.createElement('span');
      u.className = 'm-bar-u';
      u.textContent = unit.textContent;
      text.append(u);
    }
    const go = doc.createElement('a');
    go.className = 'btn btn-primary';
    go.href = '#' + first.id;
    go.textContent = label.textContent;
    const x = doc.createElement('button');
    x.type = 'button';
    x.className = 'm-bar-x';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '×';
    bar.append(text, go, x);
    doc.body.append(bar);

    // The bar shows once a buy box has scrolled off the top, provided no buy
    // box is on screen and the closing call to action (or footer) is still
    // ahead. That way it never sits on top of what it points to.
    const state = new Map();
    const ends = $$('.finalcta, footer');
    let off = false;
    const sync = () => {
      const v = [...state.values()];
      const want = v.some((s) => s.past) && !v.some((s) => s.on)
        && ends.every((e) => state.get(e).ahead);
      bar.hidden = off || !want;
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const top = e.boundingClientRect.top;
        state.set(e.target, { on: e.isIntersecting, past: !e.isIntersecting && top < 0, ahead: !e.isIntersecting && top > 0 });
      });
      sync();
    });
    [...boxes, ...ends].forEach((el) => { state.set(el, { on: false, past: false, ahead: true }); io.observe(el); });

    x.addEventListener('click', () => {
      off = true;
      sync();
      io.disconnect();
      try { sessionStorage.setItem('mog-bar-off', '1'); } catch (e) { /* storage off */ }
    });
  };

  const run = () => { initReveal(); initBar(); };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run);
  else run();
})();
