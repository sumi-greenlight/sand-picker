/**
 * Google Identity Services auth gate.
 * Only allows @vendasta.com emails through.
 *
 * Setup:
 *   1. Go to https://console.cloud.google.com/apis/credentials
 *   2. Create an OAuth 2.0 Client ID (Web application)
 *   3. Add your domain(s) to "Authorized JavaScript origins":
 *        - http://localhost:8080  (for local dev)
 *        - https://<your-username>.github.io  (for production)
 *   4. Paste the Client ID below.
 */

const AUTH_CONFIG = {
  // ⬇️ REPLACE THIS with your Google Cloud OAuth Client ID
  clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',

  // Allowed email domain (lowercase)
  allowedDomain: 'vendasta.com',
};

(() => {
  'use strict';

  const SESSION_KEY = 'sandpicker_auth';
  const authGate = document.getElementById('authGate');
  const appContainer = document.getElementById('appContainer');
  const authError = document.getElementById('authError');
  const signOutBtn = document.getElementById('signOutBtn');
  const userGreeting = document.getElementById('userGreeting');

  // ===== Check existing session =====
  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      // Expire after 8 hours
      if (Date.now() - session.ts > 8 * 60 * 60 * 1000) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch { return null; }
  }

  function saveSession(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      email: user.email,
      name: user.name,
      picture: user.picture,
      ts: Date.now(),
    }));
  }

  // ===== Decode JWT (Google ID token) =====
  function decodeJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join('')
    );
    return JSON.parse(json);
  }

  // ===== Domain check =====
  function isAllowedEmail(email) {
    if (!email) return false;
    const domain = email.split('@')[1]?.toLowerCase();
    return domain === AUTH_CONFIG.allowedDomain;
  }

  // ===== Show the app =====
  function showApp(user) {
    authGate.classList.add('hidden');
    appContainer.classList.remove('hidden');
    const firstName = user.name?.split(' ')[0] || 'there';
    userGreeting.textContent = `Hi ${firstName}! Add names, then watch the sand decide`;

    // Dispatch event so app.js knows auth is ready
    window.dispatchEvent(new CustomEvent('auth-ready', { detail: user }));
  }

  // ===== Show error =====
  function showError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
    setTimeout(() => authError.classList.add('hidden'), 5000);
  }

  // ===== Sign out =====
  function signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    google.accounts.id.disableAutoSelect();
    authGate.classList.remove('hidden');
    appContainer.classList.add('hidden');
    authError.classList.add('hidden');
  }

  signOutBtn.addEventListener('click', signOut);

  // ===== Google callback =====
  function handleCredentialResponse(response) {
    try {
      const payload = decodeJwt(response.credential);
      const user = {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };

      if (!isAllowedEmail(user.email)) {
        showError(`Access denied. Only @${AUTH_CONFIG.allowedDomain} accounts are allowed.`);
        return;
      }

      saveSession(user);
      showApp(user);
    } catch (err) {
      showError('Sign-in failed. Please try again.');
      console.error('Auth error:', err);
    }
  }

  // Make callback available globally for Google Identity Services
  window.handleCredentialResponse = handleCredentialResponse;

  // ===== Init =====
  const existing = getSession();
  if (existing && isAllowedEmail(existing.email)) {
    showApp(existing);
  } else {
    // Wait for Google Identity Services to load
    function initGoogleAuth() {
      if (typeof google === 'undefined' || !google.accounts) {
        setTimeout(initGoogleAuth, 100);
        return;
      }

      google.accounts.id.initialize({
        client_id: AUTH_CONFIG.clientId,
        callback: handleCredentialResponse,
        auto_select: true,
      });

      google.accounts.id.renderButton(
        document.getElementById('googleSignInBtn'),
        {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          width: 280,
        }
      );
    }

    initGoogleAuth();
  }
})();
