// Login + permission bootstrap — mirrors LoginScreenProvider.login /
// getUserPermission / menuPermissionListApi from the Flutter app.
import { callApi, ApiError, ENDPOINTS, TXN } from './api.js';
import { Session } from './session.js';
import { NAV_ITEMS } from './config.js';

export async function login(username, password) {
  const data = await callApi(ENDPOINTS.login, TXN.login, { username, password }, {});
  const userId = data.userId || '';
  if (userId) {
    Session.setLoggedIn(true);
    Session.setUsername(data.username || username);
    // acctgPartyName is the organization/company name (e.g. "Alu Casting Georgia LLC"),
    // not a user display name — keep the two separate for the topbar.
    Session.setDisplayName(data.username || username);
    Session.setOrgName(data.acctgPartyName || '');
    Session.setPassword(password);
    Session.setToken(data.token || '');
    const expiry = data.expiry ? new Date(data.expiry).getTime() : Date.now();
    Session.setTokenExpiryTime(expiry);
  }
  return data;
}

export async function getUserPermission(username, password) {
  const data = await callApi(ENDPOINTS.init, TXN.userPermission, { username, password }, {});
  const perms = data.componentHasPermission || {};
  const navItems = NAV_ITEMS.filter((item) => perms[item.permKey] === 'yes');
  Session.setNavItems(navItems);
  return navItems;
}

export async function getMenuPermissionList() {
  const data = await callApi(ENDPOINTS.init, TXN.menuPermissionList, {}, {});
  const perms = data.menuPermissionList || {};
  const flags = {
    PR_CREATE: String(perms.PR_CREATE || '').toLowerCase() === 'yes',
    PR_SUBMIT: String(perms.PR_SUBMIT || '').toLowerCase() === 'yes',
    PR_COMPLETE: String(perms.PR_COMPLETE || '').toLowerCase() === 'yes',
    PR_CANCEL: String(perms.PR_CANCEL || '').toLowerCase() === 'yes',
  };
  Session.setPrPerms(flags);
  return flags;
}

export { ApiError };
