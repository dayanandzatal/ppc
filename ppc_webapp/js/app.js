import { Session } from './session.js';
import { Router } from './router.js';
import { routes } from './routes.js';
import { icon } from './icons.js';
import { emptyState } from './ui.js';
import { mountActivityBar } from './activityBar.js';

if (!Session.isLoggedIn() || !Session.getToken()) {
  window.location.replace('login.html');
}

const appEl = document.getElementById('app');
const sidebarNav = document.getElementById('sidebarNav');
const contentEl = document.getElementById('content');
const sidebarLogoMark = document.getElementById('sidebarLogoMark');
const topbarOrg = document.getElementById('topbarOrg');
const topbarUser = document.getElementById('topbarUser');
const sidebarFoot = document.getElementById('sidebarFoot');

sidebarLogoMark.innerHTML = icon('crestx-logo', { size: 22 });
topbarOrg.textContent = Session.getOrgName() || '';
topbarUser.textContent = Session.getDisplayName() || Session.getUsername() || '';
sidebarFoot.textContent = 'CrestX · PPC v1.0';

const navItems = Session.getNavItems();

function buildRouteMeta() {
  const map = {};
  navItems.forEach((item) => { map[item.route.replace(/^#/, '')] = item; });
  return map;
}
const routeMeta = buildRouteMeta();

function renderNav(activePath) {
  sidebarNav.innerHTML = '';
  navItems.forEach((item) => {
    const path = item.route.replace(/^#/, '');
    const isActive = activePath === path || (path !== '/' && activePath.startsWith(path));
    const a = document.createElement('a');
    a.className = `cx-nav-item${isActive ? ' is-active' : ''}`;
    a.href = item.route;
    a.innerHTML = `${icon(item.icon, { size: 18 })}<span class="cx-nav-label">${item.title}</span>`;
    a.addEventListener('click', () => {
      appEl.classList.remove('is-mobile-nav-open');
    });
    sidebarNav.appendChild(a);
  });
}

const router = new Router(contentEl, routes, {
  notFound: (container) => {
    container.innerHTML = `<div class="cx-card">${emptyState('Page Not Found 404. Go back...')}</div>`;
  },
});

router.onRouteChange = (route) => {
  const path = window.location.hash.replace(/^#/, '').split('?')[0];
  renderNav(path);
  const meta = routeMeta[path] || navItems.find((n) => path.startsWith(n.route.replace(/^#/, '')));
  document.title = meta ? `${meta.title} · CrestX` : 'CrestX';
  window.scrollTo(0, 0);
  contentEl.scrollTop = 0;
};

// Default landing route = first permitted module.
if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#') {
  if (navItems.length) window.location.hash = navItems[0].route;
}

router.start();
mountActivityBar(document.getElementById('activityBar'));

// ---- Chrome interactions ----
document.getElementById('mobileMenuBtn').addEventListener('click', () => {
  appEl.classList.toggle('is-mobile-nav-open');
});
document.getElementById('sidebarScrim').addEventListener('click', () => {
  appEl.classList.remove('is-mobile-nav-open');
});
document.getElementById('collapseBtn').addEventListener('click', () => {
  appEl.classList.toggle('is-collapsed');
});
document.getElementById('logoutBtn').addEventListener('click', () => {
  Session.clear();
  window.location.replace('login.html');
});
