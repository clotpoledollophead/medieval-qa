/* ══════════════════════════════════════════════════════════
   nav.js — shared navigation logic for all pages
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function init() {
    syncTheme();
    syncFontSize();
    highlightActiveLink();
    bindDarkToggle();
  }

  /* ── Sync persisted preferences ────────────────────────── */
  function syncTheme() {
    const dark = localStorage.getItem('darkMode') === 'true';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const btn = document.getElementById('nav-dark-btn');
    if (btn) btn.textContent = dark ? '☀ Light' : '☾ Dark';
  }

  function syncFontSize() {
    const fs = localStorage.getItem('fontSize') || 'md';
    document.body.classList.add('fs-' + fs);
  }

  /* ── Highlight active nav link ──────────────────────────── */
  function highlightActiveLink() {
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link').forEach(a => {
      const href = a.getAttribute('href');
      if (href === page || (page === '' && href === 'index.html')) {
        a.classList.add('active');
      }
    });
  }

  /* ── Dark mode toggle ───────────────────────────────────── */
  function bindDarkToggle() {
    const btn = document.getElementById('nav-dark-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
      localStorage.setItem('darkMode', String(!isDark));
      btn.textContent = isDark ? '☾ Dark' : '☀ Light';
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
