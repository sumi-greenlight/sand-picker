/**
 * Simple password gate.
 * 3 access codes — share them with your team.
 */

const VALID_CODES = [
  'sand-vortex-42',
  'picker-glow-88',
  'dust-wave-17',
];

(() => {
  'use strict';

  // Apply saved mode (or default light) immediately so auth gate looks right
  const savedMode = localStorage.getItem('sandpicker_mode') || 'light';
  const savedPalette = localStorage.getItem('sandpicker_palette') || 'beige';
  document.documentElement.setAttribute('data-mode', savedMode);
  document.documentElement.setAttribute('data-palette', savedPalette);

  const SESSION_KEY = 'sandpicker_auth';
  const authGate = document.getElementById('authGate');
  const appContainer = document.getElementById('appContainer');
  const authError = document.getElementById('authError');
  const passwordInput = document.getElementById('passwordInput');
  const authSubmit = document.getElementById('authSubmit');
  const signOutBtn = document.getElementById('signOutBtn');

  // ===== Session (persists until tab/browser closes) =====
  function isAuthenticated() {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  }

  function setAuthenticated() {
    sessionStorage.setItem(SESSION_KEY, 'true');
  }

  // ===== Show app =====
  function showApp() {
    authGate.classList.add('hidden');
    appContainer.classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('auth-ready'));
  }

  // ===== Show error =====
  function showError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
    passwordInput.classList.add('shake');
    setTimeout(() => {
      passwordInput.classList.remove('shake');
    }, 500);
    setTimeout(() => authError.classList.add('hidden'), 4000);
  }

  // ===== Validate =====
  function tryLogin() {
    const code = passwordInput.value.trim();
    if (!code) return;

    if (VALID_CODES.includes(code)) {
      setAuthenticated();
      showApp();
    } else {
      showError('Invalid access code. Try again.');
      passwordInput.value = '';
      passwordInput.focus();
    }
  }

  // ===== Lock (sign out) =====
  function lock() {
    sessionStorage.removeItem(SESSION_KEY);
    authGate.classList.remove('hidden');
    appContainer.classList.add('hidden');
    authError.classList.add('hidden');
    passwordInput.value = '';
    passwordInput.focus();
  }

  // ===== Events =====
  authSubmit.addEventListener('click', tryLogin);

  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryLogin();
  });

  signOutBtn.addEventListener('click', lock);

  // ===== Init =====
  if (isAuthenticated()) {
    showApp();
  } else {
    passwordInput.focus();
  }
})();
