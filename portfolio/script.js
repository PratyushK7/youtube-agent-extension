// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Nav scroll state
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navMobile = document.getElementById('navMobile');
navToggle.addEventListener('click', () => {
  const open = navToggle.classList.toggle('open');
  navMobile.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', String(open));
});
navMobile.querySelectorAll('a').forEach((a) =>
  a.addEventListener('click', () => {
    navToggle.classList.remove('open');
    navMobile.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  })
);

// Reveal on scroll
const revealEls = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
);
revealEls.forEach((el) => revealObserver.observe(el));

// Animated stat counters
const statEls = document.querySelectorAll('.stat-num');
const animateCount = (el) => {
  const target = parseInt(el.dataset.count, 10);
  const duration = 1400;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
const statObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        statObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.5 }
);
statEls.forEach((el) => statObserver.observe(el));

// Dashboard hero's sparklines/stamp-grid key off .dash-panel.in-view, which
// the reveal observer above already sets (the panel also carries .reveal).

// Case studies — scroll-driven architecture build.
// Enhanced (sticky diagram + cumulative step reveal) only on wide viewports
// with motion allowed; otherwise the CSS fallback shows a fully-built
// diagram with normally-revealed step text — no JS behavior needed there.
//
// Driven by a rAF-throttled scroll listener rather than IntersectionObserver:
// each frame it recomputes, from live geometry, which step is nearest the
// viewport center. That makes it correct regardless of how scroll position
// changed (a gradual drag or a large instant jump alike) instead of relying
// on crossing-based IO events, which can miss a big jump entirely.
const caseStudies = document.querySelectorAll('.case-study');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const enhanceQuery = window.matchMedia('(min-width: 901px)');

if (caseStudies.length && !prefersReducedMotion) {
  let enhanced = false;
  let ticking = false;

  const setActiveStep = (study, stepNum) => {
    study.querySelectorAll('.case-step').forEach((step) => {
      step.classList.toggle('active', Number(step.dataset.step) === stepNum);
    });
    study.querySelectorAll('.case-el').forEach((el) => {
      el.classList.toggle('step-active', Number(el.dataset.step) <= stepNum);
    });
  };

  const updateActiveSteps = () => {
    if (!enhanced) return;
    const center = window.innerHeight / 2;
    caseStudies.forEach((study) => {
      let closest = null;
      let closestDist = Infinity;
      study.querySelectorAll('.case-step').forEach((step) => {
        const rect = step.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - center);
        if (dist < closestDist) {
          closestDist = dist;
          closest = step;
        }
      });
      if (closest) setActiveStep(study, Number(closest.dataset.step));
    });
  };

  const onScrollOrResize = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateActiveSteps();
      ticking = false;
    });
  };

  const applyEnhanceState = (isEnhanced) => {
    enhanced = isEnhanced;
    caseStudies.forEach((study) => study.classList.toggle('enhanced', isEnhanced));
    if (isEnhanced) {
      updateActiveSteps();
    } else {
      caseStudies.forEach((study) => {
        study.querySelectorAll('.case-step').forEach((s) => s.classList.remove('active'));
        study.querySelectorAll('.case-el').forEach((el) => el.classList.remove('step-active'));
      });
    }
  };

  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });
  applyEnhanceState(enhanceQuery.matches);
  enhanceQuery.addEventListener('change', (e) => applyEnhanceState(e.matches));
}
