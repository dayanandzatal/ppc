// Session/local-storage helpers — mirrors lib/utils/shared_prefs.dart
const K = {
  token: 'crestx.token',
  tokenExpiry: 'crestx.tokenExpiryTime',
  username: 'crestx.username',
  password: 'crestx.password', // stored only to replicate the app's silent re-login-on-expiry behavior
  isLoggedIn: 'crestx.isLoggedIn',
  nav: 'crestx.nav',
  prPerms: 'crestx.prPerms',
  displayName: 'crestx.displayName',
  orgName: 'crestx.orgName',
};

export const Session = {
  setToken(v) { localStorage.setItem(K.token, v || ''); },
  getToken() { return localStorage.getItem(K.token) || ''; },
  setTokenExpiryTime(ms) { localStorage.setItem(K.tokenExpiry, String(ms)); },
  getTokenExpiryTime() { return Number(localStorage.getItem(K.tokenExpiry) || 0); },
  setUsername(v) { localStorage.setItem(K.username, v || ''); },
  getUsername() { return localStorage.getItem(K.username) || ''; },
  setPassword(v) { localStorage.setItem(K.password, v || ''); },
  getPassword() { return localStorage.getItem(K.password) || ''; },
  setLoggedIn(v) { localStorage.setItem(K.isLoggedIn, v ? '1' : '0'); },
  isLoggedIn() { return localStorage.getItem(K.isLoggedIn) === '1'; },
  setDisplayName(v) { localStorage.setItem(K.displayName, v || ''); },
  getDisplayName() { return localStorage.getItem(K.displayName) || ''; },
  setOrgName(v) { localStorage.setItem(K.orgName, v || ''); },
  getOrgName() { return localStorage.getItem(K.orgName) || ''; },
  setNavItems(items) { localStorage.setItem(K.nav, JSON.stringify(items || [])); },
  getNavItems() { try { return JSON.parse(localStorage.getItem(K.nav) || '[]'); } catch { return []; } },
  setPrPerms(perms) { localStorage.setItem(K.prPerms, JSON.stringify(perms || {})); },
  getPrPerms() { try { return JSON.parse(localStorage.getItem(K.prPerms) || '{}'); } catch { return {}; } },
  clear() { Object.values(K).forEach((k) => localStorage.removeItem(k)); },
};
