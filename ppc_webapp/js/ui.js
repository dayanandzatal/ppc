// Shared UI primitives used across every CrestX page: banners, toasts, modals,
// confirm dialogs, searchable comboboxes, pagination bars and a scripted
// progress-dialog helper (used identically by Run MRP and Run CRP flows).
import { icon } from './icons.js';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function qs(root, sel) { return root.querySelector(sel); }
export function qsa(root, sel) { return Array.from(root.querySelectorAll(sel)); }

/* ---------------- Banner (inline dismissible success/error) ---------------- */
export function renderBanner({ type = 'success', message, onClose }) {
  const node = el(`
    <div class="cx-banner cx-banner-${type}">
      <span>${icon(type === 'error' ? 'alert-circle' : 'check-circle', { size: 16 })}</span>
      <span>${escapeHtml(message)}</span>
      <button type="button" class="cx-banner-close" aria-label="Dismiss">${icon('x', { size: 14 })}</button>
    </div>
  `);
  node.querySelector('.cx-banner-close').addEventListener('click', () => {
    node.remove();
    if (onClose) onClose();
  });
  return node;
}

export function mountBanner(container, opts) {
  // container can be null if an async fetch resolves after the user has
  // already navigated to a different page (the router swaps innerHTML).
  if (!container) return;
  container.innerHTML = '';
  if (!opts || !opts.message) return;
  const node = renderBanner(opts);
  container.appendChild(node);
  if (opts.autoHideMs) {
    setTimeout(() => node.remove(), opts.autoHideMs);
  }
}

/* ---------------- Toast stack ---------------- */
let toastStack = null;
export function toast(message, type = 'success', ms = 3200) {
  if (!toastStack) {
    toastStack = document.createElement('div');
    toastStack.className = 'cx-toast-stack';
    document.body.appendChild(toastStack);
  }
  const node = el(`<div class="cx-toast cx-toast-${type}">${escapeHtml(message)}</div>`);
  toastStack.appendChild(node);
  setTimeout(() => node.remove(), ms);
}

/* ---------------- Modal ---------------- */
export function openModal({ title, width = 640, bodyHtml = '', dismissible = true, onClose, closeIcon = true }) {
  const overlay = el(`
    <div class="cx-modal-overlay">
      <div class="cx-modal" style="max-width:${width}px">
        <div class="cx-modal-header">
          <h2>${escapeHtml(title)}</h2>
          ${closeIcon ? `<button type="button" class="cx-icon-btn cx-modal-close" aria-label="Close">${icon('x')}</button>` : '<span></span>'}
        </div>
        <div class="cx-modal-body"></div>
      </div>
    </div>
  `);
  const body = overlay.querySelector('.cx-modal-body');
  if (bodyHtml) body.innerHTML = bodyHtml;

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  }
  function onKey(e) { if (e.key === 'Escape' && dismissible) close(); }

  if (dismissible) {
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
  }
  const closeBtn = overlay.querySelector('.cx-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', () => { if (dismissible) close(); });

  document.body.appendChild(overlay);
  return { overlay, body, close, setDismissible(v) { dismissible = v; if (closeBtn) closeBtn.style.visibility = v ? 'visible' : 'hidden'; } };
}

export function modalFooter(buttonsHtml) {
  return `<div class="cx-modal-footer">${buttonsHtml}</div>`;
}

/* ---------------- Confirm dialog ---------------- */
export function confirmDialog({ title = 'Confirm', body = '', confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true }) {
  return new Promise((resolve) => {
    const modal = openModal({
      title, width: 420,
      bodyHtml: `<p style="font-size:13.5px;color:var(--cx-gray-600);line-height:1.5">${escapeHtml(body)}</p>`,
    });
    const footer = el(`
      <div class="cx-modal-footer">
        <button type="button" class="cx-btn cx-btn-secondary" data-a="cancel">${escapeHtml(cancelLabel)}</button>
        <button type="button" class="cx-btn ${danger ? 'cx-btn-danger' : 'cx-btn-primary'}" data-a="confirm">${escapeHtml(confirmLabel)}</button>
      </div>
    `);
    modal.overlay.querySelector('.cx-modal').appendChild(footer);
    footer.querySelector('[data-a="cancel"]').addEventListener('click', () => { modal.close(); resolve(false); });
    footer.querySelector('[data-a="confirm"]').addEventListener('click', () => { modal.close(); resolve(true); });
  });
}

/* ---------------- Loading / empty states ---------------- */
export function loadingState(label = 'Loading...') {
  return `<div class="cx-loading-state"><div class="cx-spinner"></div><span>${escapeHtml(label)}</span></div>`;
}
export function emptyState(label = 'No Data Found!') {
  return `<div class="cx-empty-state">${icon('inbox', { size: 40 })}<span>${escapeHtml(label)}</span></div>`;
}

/* ---------------- Searchable combobox ---------------- */
/**
 * options: [{id, label}]
 * returns { el, getValue(), setValue(id), setOptions(options), setDisabled(bool) }
 */
export function createCombobox({ options = [], value = '', placeholder = '--Select--', required = false, disabled = false, onChange, allowClear = false }) {
  let opts = options;
  let selectedId = value;

  const wrap = el(`
    <div class="cx-combo">
      <div class="cx-input-suffix-wrap">
        <input type="text" class="cx-input cx-combo-input" readonly placeholder="${escapeHtml(placeholder)}" value="" ${disabled ? 'disabled' : ''} />
        <button type="button" class="cx-input-suffix-btn" tabindex="-1">${icon('chevron-down', { size: 16 })}</button>
      </div>
    </div>
  `);
  const input = wrap.querySelector('input');
  const suffixBtn = wrap.querySelector('.cx-input-suffix-btn');
  let panel = null;

  function labelFor(id) {
    const o = opts.find((o) => String(o.id) === String(id));
    return o ? o.label : '';
  }

  function renderInput() {
    input.value = selectedId !== '' && selectedId != null ? labelFor(selectedId) : '';
  }

  function closePanel() {
    if (panel) { panel.remove(); panel = null; }
    document.removeEventListener('mousedown', onDocClick, true);
  }
  function onDocClick(e) {
    if (!wrap.contains(e.target)) closePanel();
  }

  function openPanel() {
    if (disabled || panel) return;
    panel = el(`
      <div class="cx-combo-panel">
        <div class="cx-combo-search"><input type="text" class="cx-input" placeholder="Search..." /></div>
        <div class="cx-combo-list"></div>
      </div>
    `);
    wrap.appendChild(panel);
    const searchInput = panel.querySelector('input');
    const list = panel.querySelector('.cx-combo-list');
    function draw(filter) {
      const f = (filter || '').toLowerCase();
      const filtered = opts.filter((o) => o.label.toLowerCase().includes(f));
      list.innerHTML = '';
      if (allowClear) {
        const clearOpt = el(`<div class="cx-combo-option" style="color:var(--cx-text-muted)">${escapeHtml(placeholder)}</div>`);
        clearOpt.addEventListener('click', () => { select(''); });
        list.appendChild(clearOpt);
      }
      if (!filtered.length) {
        list.appendChild(el(`<div class="cx-combo-empty">No matches</div>`));
        return;
      }
      filtered.forEach((o) => {
        const row = el(`<div class="cx-combo-option${String(o.id) === String(selectedId) ? ' is-active' : ''}">${escapeHtml(o.label)}</div>`);
        row.addEventListener('click', () => select(o.id));
        list.appendChild(row);
      });
    }
    draw('');
    searchInput.addEventListener('input', () => draw(searchInput.value));
    setTimeout(() => searchInput.focus(), 0);
    document.addEventListener('mousedown', onDocClick, true);
  }

  function select(id) {
    selectedId = id;
    renderInput();
    closePanel();
    if (onChange) onChange(id, opts.find((o) => String(o.id) === String(id)) || null);
  }

  input.addEventListener('click', () => { if (panel) closePanel(); else openPanel(); });
  suffixBtn.addEventListener('click', () => { if (panel) closePanel(); else openPanel(); });

  renderInput();

  return {
    el: wrap,
    getValue: () => selectedId,
    getLabel: () => labelFor(selectedId),
    setValue(id) { selectedId = id; renderInput(); },
    setOptions(newOptions) { opts = newOptions; renderInput(); },
    setDisabled(v) { disabled = v; input.disabled = v; },
  };
}

/* ---------------- Pagination bar ---------------- */
export function renderPaginationBar({ page, pageSize, totalCount, pageSizes = ['10', '20', '30', '50', '100', '200'], onPageSize, onFirst, onPrev, onNext, onLast }) {
  const start = totalCount === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalCount);
  const lastPage = Math.max(0, Math.ceil(totalCount / pageSize) - 1);
  const node = el(`
    <div class="cx-pagination">
      <div>Showing ${start} - ${end} of ${totalCount}</div>
      <div class="cx-pagination-controls">
        <span class="cx-text-muted" style="margin-right:8px">Rows per Page:</span>
        <select class="cx-page-size">${pageSizes.map((s) => `<option value="${s}" ${String(pageSize) === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <button type="button" class="cx-icon-btn" data-a="first" ${page === 0 ? 'disabled' : ''}>${icon('chevrons-left', { size: 16 })}</button>
        <button type="button" class="cx-icon-btn" data-a="prev" ${page === 0 ? 'disabled' : ''}>${icon('chevron-left', { size: 16 })}</button>
        <button type="button" class="cx-icon-btn" data-a="next" ${page >= lastPage ? 'disabled' : ''}>${icon('chevron-right', { size: 16 })}</button>
        <button type="button" class="cx-icon-btn" data-a="last" ${page >= lastPage ? 'disabled' : ''}>${icon('chevrons-right', { size: 16 })}</button>
      </div>
    </div>
  `);
  node.querySelector('.cx-page-size').addEventListener('change', (e) => onPageSize(Number(e.target.value)));
  node.querySelector('[data-a="first"]').addEventListener('click', onFirst);
  node.querySelector('[data-a="prev"]').addEventListener('click', onPrev);
  node.querySelector('[data-a="next"]').addEventListener('click', onNext);
  node.querySelector('[data-a="last"]').addEventListener('click', onLast);
  return node;
}

/* ---------------- Scripted progress dialog (Run MRP / Run CRP) ---------------- */
/**
 * steps: array of string labels, each held ~stepMs before advancing.
 * apiPromise: the real API call, fired immediately and raced against the scripted animation.
 * onSuccess(dataFromApi) should return/await any follow-up refresh.
 */
export function openProgressDialog({ title, steps, stepMs = 3000, apiPromise, successMessageDefault, failMessageDefault, onSuccess }) {
  let processing = true;
  const modal = openModal({
    title, width: Math.min(600, window.innerWidth * 0.9), dismissible: false, closeIcon: true,
    bodyHtml: `
      <div class="cx-progress-step" data-el="step">${escapeHtml(steps[0])}</div>
      <div class="cx-progress-track cx-mt-12"><div class="cx-progress-fill" data-el="fill" style="width:0%"></div></div>
      <div class="cx-flex-between cx-mt-12">
        <span></span>
        <span class="cx-progress-percent" data-el="pct">0%</span>
      </div>
      <div data-el="errorSlot"></div>
    `,
  });
  modal.setDismissible(false);
  const stepEl = qs(modal.body, '[data-el="step"]');
  const fillEl = qs(modal.body, '[data-el="fill"]');
  const pctEl = qs(modal.body, '[data-el="pct"]');
  const errorSlot = qs(modal.body, '[data-el="errorSlot"]');

  function setPct(p) {
    fillEl.style.width = `${p}%`;
    pctEl.textContent = `${Math.round(p)}%`;
  }

  async function run() {
    for (let i = 0; i < steps.length; i++) {
      stepEl.textContent = steps[i];
      setPct(((i + 1) / steps.length) * 100);
      await new Promise((r) => setTimeout(r, stepMs));
    }
    let result;
    let ok = true;
    try {
      result = await apiPromise;
    } catch (e) {
      ok = false;
      result = e;
    }
    processing = false;
    setPct(100);
    if (ok) {
      try { if (onSuccess) await onSuccess(result); } catch (_) {}
      stepEl.textContent = (result && result.__message) || successMessageDefault;
      setTimeout(() => modal.close(), 2000);
    } else {
      stepEl.textContent = '';
      modal.setDismissible(true);
      const msg = (result && result.details) || failMessageDefault;
      errorSlot.appendChild(renderBanner({ type: 'error', message: msg, onClose: () => modal.close() }));
    }
  }
  run();
  return modal;
}

/* ---------------- Stat card row ---------------- */
export function statCard({ label, value, variant = '' }) {
  return `
    <div class="cx-stat-card ${variant}">
      <div class="cx-stat-label">${escapeHtml(label)}</div>
      <div class="cx-stat-value">${escapeHtml(value)}</div>
    </div>
  `;
}
export function statRow(cards) {
  return `<div class="cx-stat-row">${cards.map(statCard).join('')}</div>`;
}

/* ---------------- Step header (numbered card section) ---------------- */
export function stepHeader(n, title) {
  return `
    <div class="cx-step-header">
      <span class="cx-step-badge">${n}</span>
      <span class="cx-step-title">${escapeHtml(title)}</span>
    </div>
  `;
}

/* ---------------- Table toolbar: search + filter + count + export ---------------- */
/**
 * opts: { placeholder, filterOptions?: [{value,label}], countLabel, onSearch(query), onFilter(value), onExportCsv?, onExportExcel? }
 * returns the toolbar element; caller inserts it above their table and re-renders on callbacks.
 */
export function renderTableToolbar({ placeholder = 'Search...', filterOptions, countLabel, onSearch, onFilter, onExportCsv, onExportExcel }) {
  const node = el(`
    <div class="cx-table-toolbar">
      <div class="cx-table-search">
        ${icon('search', { size: 15 })}
        <input type="text" class="cx-input" placeholder="${escapeHtml(placeholder)}" />
      </div>
      ${filterOptions ? `<select class="cx-select-native" style="width:auto;min-width:140px" data-el="filter">
        ${filterOptions.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}
      </select>` : ''}
      ${countLabel ? `<span class="cx-table-count">${escapeHtml(countLabel)}</span>` : ''}
      <span class="cx-table-toolbar-spacer"></span>
      ${(onExportCsv || onExportExcel) ? `<div class="cx-table-toolbar-actions">
        ${onExportCsv ? `<button type="button" class="cx-btn cx-btn-secondary cx-btn-sm" data-a="csv">${icon('file-csv', { size: 14 })}CSV</button>` : ''}
        ${onExportExcel ? `<button type="button" class="cx-btn cx-btn-secondary cx-btn-sm" data-a="excel">${icon('file-excel', { size: 14 })}Excel</button>` : ''}
      </div>` : ''}
    </div>
  `);
  const searchInput = node.querySelector('input');
  let t;
  searchInput.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => onSearch(searchInput.value), 180);
  });
  const filterSelect = node.querySelector('[data-el="filter"]');
  if (filterSelect) filterSelect.addEventListener('change', () => onFilter(filterSelect.value));
  if (onExportCsv) node.querySelector('[data-a="csv"]').addEventListener('click', onExportCsv);
  if (onExportExcel) node.querySelector('[data-a="excel"]').addEventListener('click', onExportExcel);
  return node;
}

export function filterRows(rows, query, fields) {
  if (!query) return rows;
  const q = query.toLowerCase();
  return rows.filter((r) => fields.some((f) => String(r[f] ?? '').toLowerCase().includes(q)));
}

/* ---------------- Sortable table headers ---------------- */
/**
 * Renders a <th> with a sort icon and wires a click handler.
 * state: {key, dir} mutable object shared by the caller; rerender is called after mutation.
 */
export function sortableTh(label, key, state, rerender, extraClass = '') {
  const isSorted = state.key === key;
  const iconName = isSorted ? (state.dir === 'asc' ? 'sort-asc' : 'sort-desc') : 'sort';
  return `<th class="sortable${isSorted ? ' is-sorted' : ''}${extraClass ? ` ${extraClass}` : ''}" data-sort-key="${escapeHtml(key)}">
    <span class="cx-th-inner">${escapeHtml(label)} ${icon(iconName, { size: 12 })}</span>
  </th>`;
}
export function wireSortableHeaders(container, state, rerender) {
  container.querySelectorAll('th[data-sort-key]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sortKey;
      if (state.key === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.key = key; state.dir = 'asc'; }
      rerender();
    });
  });
}
export function applySort(rows, state) {
  if (!state.key) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = a[state.key]; const bv = b[state.key];
    if (av == null && bv == null) return 0;
    if (av == null) return -1;
    if (bv == null) return 1;
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
  });
  if (state.dir === 'desc') sorted.reverse();
  return sorted;
}

/* ---------------- CSV / Excel export ---------------- */
function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportToCsv(filename, columns, rows) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvEscape(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(',')).join('\n');
  triggerDownload(new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' }), filename.endsWith('.csv') ? filename : `${filename}.csv`);
}
export function exportToExcel(filename, columns, rows) {
  const th = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const trs = rows.map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(typeof c.value === 'function' ? c.value(r) : r[c.key])}</td>`).join('')}</tr>`).join('');
  const html = `<html><head><meta charset="UTF-8"></head><body><table>${`<tr>${th}</tr>`}${trs}</table></body></html>`;
  triggerDownload(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), filename.endsWith('.xls') ? filename : `${filename}.xls`);
}
