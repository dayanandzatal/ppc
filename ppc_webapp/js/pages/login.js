import { login, getUserPermission, getMenuPermissionList } from '../auth.js';
import { Session } from '../session.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui.js';

document.getElementById('loginLogoMark').innerHTML = icon('crestx-logo', { size: 30 });

const form = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorSlot = document.getElementById('loginError');
const submitBtn = document.getElementById('submitBtn');
const togglePw = document.getElementById('togglePw');
const continueBannerSlot = document.getElementById('continueBanner');

// If there's already a live session, offer a one-click continue instead of
// forcing the user to log in again — but still let them switch accounts
// via the form below.
if (Session.isLoggedIn() && Session.getToken()) {
  const who = Session.getDisplayName() || Session.getUsername();
  continueBannerSlot.innerHTML = `
    <div class="cx-continue-banner">
      <span>Signed in as <strong>${escapeHtml(who)}</strong></span>
      <button type="button" class="cx-btn cx-btn-primary cx-btn-sm" id="continueBtn">Continue ${icon('arrow-right', { size: 14 })}</button>
    </div>
  `;
  document.getElementById('continueBtn').addEventListener('click', () => {
    window.location.replace('app.html');
  });
  usernameInput.value = Session.getUsername();
}

let obscure = true;
function renderToggle() {
  togglePw.innerHTML = icon(obscure ? 'eye' : 'eye-off', { size: 16 });
}
renderToggle();
togglePw.addEventListener('click', () => {
  obscure = !obscure;
  passwordInput.type = obscure ? 'password' : 'text';
  renderToggle();
});

function showError(message) {
  errorSlot.innerHTML = `<div class="cx-login-error">${icon('alert-circle', { size: 16 })}<span>${escapeHtml(message)}</span></div>`;
}
function clearError() { errorSlot.innerHTML = ''; }

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? 'Signing in…' : 'Sign In';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username) { showError('Username is required'); return; }
  if (!password) { showError('Password is required'); return; }

  setLoading(true);
  try {
    const resp = await login(username, password);
    if (!resp.userId) {
      showError('Invalid Credentials');
      setLoading(false);
      return;
    }
    const navItems = await getUserPermission(username, password);
    await getMenuPermissionList();
    if (!navItems.length) {
      showError('No modules are enabled for this account. Contact your administrator.');
      setLoading(false);
      return;
    }
    window.location.replace('app.html');
  } catch (err) {
    showError((err && err.details) || (err && err.message) || 'Unknown error occured, please try again.');
    setLoading(false);
  }
});
