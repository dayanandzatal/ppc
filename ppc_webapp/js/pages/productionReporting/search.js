// Production Reporting — Search screen (route: /production-reporting).
// Facility/WorkCenter(cascading)/Shift filters, From/To date, status checkboxes,
// infinite-scroll results table. See spec: production_reporting.md §1.
import { callApi, ENDPOINTS, TXN } from '../../api.js';
import { icon } from '../../icons.js';
import {
  el, escapeHtml, toast, loadingState, emptyState, createCombobox, mountBanner,
  statRow, renderTableToolbar, filterRows, sortableTh, wireSortableHeaders, applySort,
  exportToCsv, exportToExcel,
} from '../../ui.js';
import { Session } from '../../session.js';
import { isoWithMidnight } from '../../dateUtils.js';
import { PrState } from './prState.js';

let state = {};

function freshState() {
  const perms = Session.getPrPerms();
  return {
    perms,
    facilityList: [], workCenterList: [], shiftList: [],
    facilityId: '', workCenterId: '', shiftId: '',
    fromDate: '', toDate: '',
    // Status filters. Defaults: Pending always true; Submitted true if PR_COMPLETE.
    all: false, pending: true, cancelled: false,
    submitted: perms.PR_COMPLETE === true, completed: false,
    rows: [], viewIndex: 0, hasMore: true,
    loading: false, loadingMore: false, hasSearched: false,
    search: '', sort: { key: '', dir: 'asc' },
  };
}

const COLUMNS = [
  { key: 'productionRunGroupId', label: 'Group Production Run Id' },
  { key: 'date', label: 'Date' },
  { key: 'facilityName', label: 'Facility' },
  { key: 'workCenterName', label: 'Work Center' },
  { key: 'shiftDesc', label: 'Shift' },
  { key: 'statusDesc', label: 'Status' },
];

async function fetchFacility() {
  const data = await callApi(ENDPOINTS.init, TXN.getFacility, {}, {});
  state.facilityList = data.facilityList || [];
  if (state.facilityList.length === 1) {
    state.facilityId = state.facilityList[0].facilityId;
    await fetchWorkCenter(state.facilityId);
  }
}

async function fetchShift() {
  const data = await callApi(ENDPOINTS.init, TXN.getShift, {}, {});
  state.shiftList = data.shiftDetails || [];
  if (state.shiftList.length === 1) state.shiftId = state.shiftList[0].shiftId;
}

async function fetchWorkCenter(facilityId) {
  state.workCenterId = '';
  if (!facilityId) { state.workCenterList = []; return; }
  const data = await callApi(ENDPOINTS.init, TXN.getWorkcenter, { facilityId: String(facilityId) }, {});
  state.workCenterList = data.workCenterList || [];
  if (state.workCenterList.length === 1) state.workCenterId = state.workCenterList[0].workCenterId;
}

function statusBadge(statusDesc) {
  const s = statusDesc || '';
  let cls = 'cx-badge-danger'; // Cancelled / anything else
  if (s === 'Completed') cls = 'cx-badge-success';
  else if (s === 'Pending') cls = 'cx-badge-warning';
  else if (s === 'Submitted') cls = 'cx-badge-info';
  return `<span class="cx-badge ${cls}">${escapeHtml(s)}</span>`;
}

function fmtDate(iso) {
  // API date arrives as yyyy-MM-dd... -> dd-MM-yyyy
  if (!iso || iso.length < 10) return escapeHtml(iso || '');
  return `${iso.substring(8, 10)}-${iso.substring(5, 7)}-${iso.substring(0, 4)}`;
}

async function search(container, { loadMore = false } = {}) {
  if (loadMore) {
    if (state.loading || state.loadingMore || !state.hasMore) return;
    state.loadingMore = true;
  } else {
    state.loading = true; state.viewIndex = 0; state.rows = []; state.hasMore = true; state.hasSearched = true;
  }
  render(container);
  try {
    const data = await callApi(ENDPOINTS.init, TXN.searchProdReporting, {
      workCenterId: state.workCenterId || '',
      facilityId: state.facilityId || '',
      shiftId: state.shiftId || '',
      thruDate: isoWithMidnight(state.toDate),
      fromDate: isoWithMidnight(state.fromDate),
      statusId: '',
      all: String(state.all),
      pending: String(state.pending),
      cancelled: String(state.cancelled),
      submitted: String(state.submitted),
      completed: String(state.completed),
      viewIndex: String(state.viewIndex),
    }, {});
    const list = data.productionReportingList || [];
    state.rows = loadMore ? state.rows.concat(list) : list;
    state.hasMore = list.length === 20; // page size 20
    if (list.length) state.viewIndex += 1;
  } catch (e) {
    toast(e.details || e.message || 'Failed to search production reporting', 'error');
  } finally {
    state.loading = false; state.loadingMore = false;
    render(container);
  }
}

function rowHtml(r, idx) {
  return `
    <tr data-idx="${idx}">
      <td class="cx-cell-center">${idx + 1}</td>
      <td><a href="#" class="cx-link" data-a="open" data-idx="${idx}">${escapeHtml(r.productionRunGroupId || '')}</a></td>
      <td class="cx-cell-center">${fmtDate(r.date)}</td>
      <td>${escapeHtml(r.facilityName || '')}</td>
      <td>${escapeHtml(r.workCenterName || '')}</td>
      <td>${escapeHtml(r.shiftDesc || '')}</td>
      <td class="cx-cell-center">${statusBadge(r.statusDesc)}</td>
    </tr>`;
}

function statusCheckbox(key, label) {
  return `<label class="cx-checkbox"><input type="checkbox" data-status="${key}" ${state[key] ? 'checked' : ''} />${label}</label>`;
}

function visibleRows() {
  const filtered = filterRows(state.rows, state.search, ['productionRunGroupId', 'facilityName', 'workCenterName', 'shiftDesc', 'statusDesc']);
  return applySort(filtered, state.sort);
}

function statusCounts() {
  const c = { Completed: 0, Pending: 0, Submitted: 0, Cancelled: 0 };
  state.rows.forEach((r) => { if (c[r.statusDesc] !== undefined) c[r.statusDesc] += 1; });
  return c;
}

function render(container) {
  const rows = visibleRows();
  const counts = statusCounts();
  container.innerHTML = `
    <div class="cx-page-header">
      <h1><span class="cx-page-icon">${icon('receipt-long', { size: 18 })}</span>Search Production Reporting</h1>
      <div class="cx-page-header-actions">
        ${state.perms.PR_CREATE ? `<button type="button" class="cx-btn cx-btn-secondary" id="btnIot">${icon('cpu', { size: 16 })}Get Data From IoT</button>` : ''}
        <button type="button" class="cx-btn cx-btn-primary" id="btnCreate">${icon('plus', { size: 16 })}Create</button>
      </div>
    </div>
    <div id="prBanner"></div>
    <div class="cx-card">
      <div class="cx-grid cx-grid-4">
        <div class="cx-field"><label>Facility</label><div data-slot="facility"></div></div>
        <div class="cx-field"><label>Work Center</label><div data-slot="workCenter"></div></div>
        <div class="cx-field"><label>Shift</label><div data-slot="shift"></div></div>
        <div class="cx-field"><label>From Date</label><input type="date" class="cx-input" id="fromDate" value="${state.fromDate}" /></div>
        <div class="cx-field"><label>To Date</label><input type="date" class="cx-input" id="toDate" value="${state.toDate}" /></div>
      </div>
      <div class="cx-flex-center cx-mt-16" style="flex-wrap:wrap;gap:14px">
        <span style="font-weight:600;font-size:12.5px;color:var(--cx-gray-600)">Status</span>
        ${statusCheckbox('all', 'All')}
        ${statusCheckbox('pending', 'Pending')}
        ${statusCheckbox('cancelled', 'Cancelled')}
        ${statusCheckbox('submitted', 'Submitted')}
        ${statusCheckbox('completed', 'Completed')}
      </div>
      <div class="cx-flex-center cx-mt-16"><button type="button" class="cx-btn cx-btn-primary" id="btnSearch">${icon('search', { size: 15 })}Search</button></div>
    </div>

    ${state.hasSearched ? `
      ${!state.loading && state.rows.length ? statRow([
        { label: 'Total Runs', value: String(state.rows.length) },
        { label: 'Completed', value: String(counts.Completed), variant: 'positive' },
        { label: 'Pending', value: String(counts.Pending) },
        { label: 'Submitted', value: String(counts.Submitted), variant: 'accent' },
        { label: 'Cancelled', value: String(counts.Cancelled), variant: 'negative' },
      ]) : ''}
      <div id="prToolbar"></div>
      <div class="cx-table-wrap">
        <div class="cx-table-scroll" id="tableScroll" style="max-height:480px;overflow-y:auto">
          ${state.loading ? loadingState() : (!rows.length ? emptyState(state.search ? 'No results match your search.' : 'No Data Found!') : `
            <table class="cx-table"><thead><tr>
              <th class="cx-cell-center">Sl.No</th>
              ${sortableTh('Group Production Run Id', 'productionRunGroupId', state.sort, () => render(container))}
              ${sortableTh('Date', 'date', state.sort, () => render(container), 'cx-cell-center')}
              ${sortableTh('Facility', 'facilityName', state.sort, () => render(container))}
              ${sortableTh('Work Center', 'workCenterName', state.sort, () => render(container))}
              ${sortableTh('Shift', 'shiftDesc', state.sort, () => render(container))}
              ${sortableTh('Status', 'statusDesc', state.sort, () => render(container), 'cx-cell-center')}
            </tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table>`)}
        </div>
      </div>
      ${state.loadingMore ? `<div class="cx-flex-center cx-mt-12"><div class="cx-spinner cx-spinner-sm"></div></div>` : ''}
    ` : ''}
  `;

  if (state.hasSearched && !state.loading) {
    const toolbar = renderTableToolbar({
      placeholder: 'Search run id, facility, status...',
      countLabel: `${rows.length} of ${state.rows.length} loaded`,
      onSearch: (q) => { state.search = q; render(container); },
      onExportCsv: () => exportToCsv('production-reporting', COLUMNS, rows),
      onExportExcel: () => exportToExcel('production-reporting', COLUMNS, rows),
    });
    document.getElementById('prToolbar').appendChild(toolbar);
    wireSortableHeaders(container, state.sort, () => render(container));
  }

  const facilityCombo = createCombobox({
    options: state.facilityList.map((f) => ({ id: f.facilityId, label: f.facilityName })),
    value: state.facilityId, placeholder: '--Select--', allowClear: true,
    onChange: async (id) => {
      state.facilityId = id || '';
      await fetchWorkCenter(state.facilityId);
      render(container);
    },
  });
  container.querySelector('[data-slot="facility"]').appendChild(facilityCombo.el);

  const wcCombo = createCombobox({
    options: state.workCenterList.map((w) => ({ id: w.workCenterId, label: w.workCenterDescription })),
    value: state.workCenterId, placeholder: '--Select--', allowClear: true,
    onChange: (id) => { state.workCenterId = id || ''; },
  });
  container.querySelector('[data-slot="workCenter"]').appendChild(wcCombo.el);

  const shiftCombo = createCombobox({
    options: state.shiftList.map((s) => ({ id: s.shiftId, label: s.description })),
    value: state.shiftId, placeholder: '--Select--', allowClear: true,
    onChange: (id) => { state.shiftId = id || ''; },
  });
  container.querySelector('[data-slot="shift"]').appendChild(shiftCombo.el);

  container.querySelector('#fromDate').addEventListener('change', (e) => { state.fromDate = e.target.value; });
  container.querySelector('#toDate').addEventListener('change', (e) => { state.toDate = e.target.value; });

  container.querySelectorAll('[data-status]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const key = e.target.dataset.status;
      const val = e.target.checked;
      if (key === 'all') {
        // "All" sets all 4 true/false together.
        state.all = val; state.pending = val; state.cancelled = val; state.submitted = val; state.completed = val;
      } else {
        state[key] = val;
        // unchecking any one of the 4 individually forces "All" off.
        if (!val) state.all = false;
      }
      render(container);
    });
  });

  const btnCreate = container.querySelector('#btnCreate');
  if (btnCreate) btnCreate.addEventListener('click', () => {
    PrState.clear();
    window.location.hash = '#/production-reporting/create';
  });
  const btnIot = container.querySelector('#btnIot');
  if (btnIot) btnIot.addEventListener('click', () => { window.location.hash = '#/production-reporting/iot'; });

  container.querySelector('#btnSearch').addEventListener('click', () => {
    if (state.fromDate && state.toDate && state.fromDate > state.toDate) {
      mountBanner(container.querySelector('#prBanner'), { type: 'error', message: 'The From Date cannot be greater than To Date.', autoHideMs: 5000 });
      return;
    }
    search(container);
  });

  if (state.hasSearched && rows.length) {
    container.querySelectorAll('[data-a="open"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const r = rows[Number(e.target.dataset.idx)];
        PrState.clear();
        PrState.setGroupId(r.productionRunGroupId || '');
        PrState.setFacilityId(r.facilityId || '');
        window.location.hash = `#/production-reporting/edit/${encodeURIComponent(r.productionRunGroupId)}`;
      });
    });
    const scrollEl = container.querySelector('#tableScroll');
    if (scrollEl) {
      scrollEl.addEventListener('scroll', () => {
        if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 120) {
          search(container, { loadMore: true });
        }
      });
    }
  }
}

export default {
  title: 'Production Reporting',
  async mount(container) {
    state = freshState();
    render(container);
    try { await fetchFacility(); } catch (e) {}
    try { await fetchShift(); } catch (e) {}
    render(container);
  },
};
