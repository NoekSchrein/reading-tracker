const MOTION = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function _active(id) {
  return document.getElementById(id)?.classList.contains('active');
}

function animateView(name) {
  if (name === 'home')       { animateHero(); animateStats(); animateHomeRows(); }
  if (name === 'books')      { animateBookCards(); }
  if (name === 'challenges') { animateChallengeRows(); }
  if (name === 'manage')     { animateManageItems(); }
}

function animateHero() {
  if (!MOTION || !_active('view-home')) return;
  gsap.from('.view-title', {
    opacity: 0, y: -8, duration: 0.42, ease: 'power3.out', clearProps: 'all'
  });
}

function animateStats() {
  if (!MOTION || !_active('view-home')) return;
  const cards = document.querySelectorAll('.stat-card');
  if (!cards.length) return;
  gsap.from(cards, {
    opacity: 0, y: 16, scale: 0.92,
    duration: 0.36, stagger: 0.07,
    ease: 'back.out(1.6)', clearProps: 'all'
  });
  cards.forEach(card => {
    const numEl = card.querySelector('.num');
    if (!numEl) return;
    const target = parseInt(numEl.textContent) || 0;
    if (!target) return;
    const obj = { val: 0 };
    gsap.to(obj, {
      val: target, duration: 0.6, delay: 0.1, ease: 'power2.out',
      onUpdate() { numEl.textContent = Math.round(obj.val); }
    });
  });
}

function animateHomeRows() {
  if (!MOTION || !_active('view-home')) return;
  const rows = document.querySelectorAll('#home-dashboard .chal-card');
  if (!rows.length) return;
  gsap.from(rows, {
    opacity: 0, y: 14,
    duration: 0.3, stagger: 0.055, delay: 0.06,
    ease: 'power2.out', clearProps: 'all'
  });
}

function animateProgressBars(container) {
  if (!MOTION) return;
  const bars = (container || document).querySelectorAll('.bar-fill');
  bars.forEach(bar => {
    const target = bar.style.width || '0%';
    bar.style.width = '0%';
    gsap.to(bar, { width: target, duration: 0.7, delay: 0.22, ease: 'power2.out' });
  });
}

function animateBookCards() {
  if (!MOTION || !_active('view-books')) return;
  const cards = document.querySelectorAll('#books-grid .book-card');
  if (!cards.length) return;
  gsap.from(cards, {
    opacity: 0, y: 18,
    duration: 0.3, stagger: 0.045,
    ease: 'power2.out', clearProps: 'all'
  });
}

function animateChallengeRows() {
  if (!MOTION || !_active('view-challenges')) return;
  const els = document.querySelectorAll('#challenges-content .group-section');
  if (!els.length) return;
  gsap.from(els, {
    opacity: 0, y: 14,
    duration: 0.32, stagger: 0.06,
    ease: 'power2.out', clearProps: 'all'
  });
}

function animateManageItems() {
  if (!MOTION || !_active('view-manage')) return;
  const items = document.querySelectorAll('.manage-item');
  if (!items.length) return;
  gsap.from(items, {
    opacity: 0, x: -8,
    duration: 0.25, stagger: 0.035,
    ease: 'power2.out', clearProps: 'all'
  });
}

function animateChallengeExpand(booksContainer) {
  if (!MOTION) return;
  const rows = booksContainer.querySelectorAll('.challenge-book-row');
  if (!rows.length) return;
  gsap.from(rows, {
    opacity: 0, y: 8,
    duration: 0.22, stagger: 0.04,
    ease: 'power2.out', clearProps: 'all'
  });
}
