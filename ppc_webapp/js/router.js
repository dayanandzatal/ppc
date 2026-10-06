// Minimal hash-based router. Each route maps a path pattern to an async
// page-module loader; the loader's default export must be
// { title, mount(container, params) => (optional) cleanup() }.
export class Router {
  constructor(container, routes, { notFound }) {
    this.container = container;
    this.routes = routes.map((r) => ({ ...r, segments: r.path.split('/').filter(Boolean) }));
    this.notFound = notFound;
    this.cleanup = null;
    this.onRouteChange = null;
    window.addEventListener('hashchange', () => this.resolve());
  }

  start() { this.resolve(); }

  matchRoute(pathSegments) {
    for (const route of this.routes) {
      if (route.segments.length !== pathSegments.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(pathSegments[i]);
        else if (seg !== pathSegments[i]) { ok = false; break; }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  async resolve() {
    const hash = window.location.hash || '#/';
    const path = hash.replace(/^#/, '');
    const [pathPart, queryPart] = path.split('?');
    const pathSegments = pathPart.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(queryPart || ''));

    if (typeof this.cleanup === 'function') {
      try { this.cleanup(); } catch (_) {}
      this.cleanup = null;
    }

    const match = this.matchRoute(pathSegments);
    this.container.innerHTML = '';

    if (!match) {
      this.notFound(this.container);
      if (this.onRouteChange) this.onRouteChange(null);
      return;
    }
    const mod = await match.route.loader();
    const page = mod.default;
    if (this.onRouteChange) this.onRouteChange(match.route, page);
    const result = await page.mount(this.container, { ...match.params, ...query });
    if (typeof result === 'function') this.cleanup = result;
  }

  navigate(path) { window.location.hash = `#${path}`; }
}
