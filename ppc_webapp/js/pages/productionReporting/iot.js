// Production Reporting — Get Data From IoT screen.
// Route: /production-reporting/iot. See spec: production_reporting.md §4.
import { callApi, ENDPOINTS, TXN } from '../../api.js';
import { icon } from '../../icons.js';
import {
  el, escapeHtml, toast, openModal, confirmDialog, loadingState, emptyState,
  createCombobox, mountBanner,
  renderTableToolbar, filterRows, sortableTh, wireSortableHeaders, applySort,
  exportToCsv, exportToExcel,
} from '../../ui.js';
import { Session } from '../../session.js';
import { PrState } from './prState.js';

let state = {};

function freshState() {
  return {
    perms: Session.getPrPerms(),
    facilityList: [], workCenterList: [], shiftList: [],
    facilityId: '', workCenterId: '', shiftId: '',
    dateLocal: '', // datetime-local value: yyyy-MM-ddTHH:mm
    rows: [], loading: false,
    search: '', sort: { key: '', dir: 'asc' },
  };
}

const COLUMNS = [
  { key: 'machineNo', label: 'Machine Number' },
  { key: 'toolNames', label: 'Tool', value: (r) => (r.toolList || []).map((t) => t.toolId).join(', ') },
  { key: 'productIdName', label: 'Production Name' },
  { key: 'startTimeUI', label: 'Start Time' },
  { key: 'endTimeUI', label: 'End Time' },
  { key: 'acceptedQty', label: 'Accepted Qty' },
  { key: 'rejectedQty', label: 'Rejected Qty' },
];

// Filtered + sorted view of the IoT preview rows. The returned array holds the
// SAME row-object references as state.rows, so any edit made through rows[idx]
// (accepted qty, rejected popup commit) mutates the underlying object and never
// desyncs from the DOM produced by this exact array.
function visibleRows() {
  const filtered = filterRows(state.rows, state.search, ['machineNo', 'productIdName']);
  return applySort(filtered, state.sort);
}

async function fetchFacility() {
  const data = await callApi(ENDPOINTS.init, TXN.getFacility, {}, {});
  state.facilityList = data.facilityList || [];
  if (state.facilityList.length === 1) {
    state.facilityId = state.facilityList[0].facilityId;
    await fetchWorkCenter();
  }
}
async function fetchShift() {
  const data = await callApi(ENDPOINTS.init, TXN.getShift, {}, {});
  state.shiftList = data.shiftDetails || [];
  if (state.shiftList.length === 1) state.shiftId = state.shiftList[0].shiftId;
}
async function fetchWorkCenter() {
  state.workCenterId = '';
  if (!state.facilityId) { state.workCenterList = []; return; }
  const data = await callApi(ENDPOINTS.init, TXN.getWorkcenter, { facilityId: String(state.facilityId) }, {});
  state.workCenterList = data.workCenterList || [];
  if (state.workCenterList.length === 1) state.workCenterId = state.workCenterList[0].workCenterId;
}

function dateApi() {
  // datetime-local "yyyy-MM-ddTHH:mm" -> "yyyy-MM-dd HH:mm:ss"
  if (!state.dateLocal) return '';
  return `${state.dateLocal.replace('T', ' ')}:00`;
}

async function getDetails(container) {
  const banner = container.querySelector('#prBanner');
  const errors = [];
  if (!state.facilityId) errors.push('Facility is required.');
  if (!state.workCenterId) errors.push('Work Center is required.');
  if (!state.shiftId) errors.push('Shift is required.');
  if (!state.dateLocal) errors.push('Date & Time is required.');
  if (errors.length) { mountBanner(banner, { type: 'error', message: errors.join('\n'), autoHideMs: 6000 }); return; }

  state.loading = true; render(container);
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getIotData, {
      facilityId: String(state.facilityId), workCenterId: String(state.workCenterId),
      shiftId: String(state.shiftId), thruDate: dateApi(),
    }, {});
    const iot = data.iotProductionData;
    if (!iot) { state.rows = []; toast('No IoT data found', 'error'); return; }
    const runs = iot.productionRun || [];
    state.rows = runs.map((m) => ({
      machineNo: m.machineNo || '',
      machineNumberId: m.routingId || '',
      toolList: (m.toolList || []).map((t) => ({ toolId: t.toolId })),
      productName: m.productName || '',
      productId: m.productId || '',
      productIdName: `${m.productName || ''} [${m.productId || ''}]`,
      startDate: m.startDate || '',
      endDate: m.endDate || '',
      startTimeUI: (m.startDate || '').substring(11, 16),
      endTimeUI: (m.endDate || '').substring(11, 16),
      acceptedQty: m.acceptedQuantity != null ? String(m.acceptedQuantity) : '0',
      rejectedQty: m.rejectedQuantity != null ? String(m.rejectedQuantity) : '0',
      operatorId: m.operator || '',
      rejectedDataTable: (m.rejectionReasonsList || []).map((r) => ({
        rejectLocationId: r.rejectionLocation, rejectedReasId: r.rejectionReasonId,
        rejectedReasDesc: r.rejectionReasonDesc, qty: String(r.rejectionQuantity),
      })),
    }));
  } catch (e) {
    state.rows = [];
    toast(e.details || e.message || 'Failed to get IoT data', 'error');
  } finally {
    state.loading = false; render(container);
  }
}

/* ---------------- Rejected popup (IoT) ---------------- */
async function openRejectedPopup(container, row) {
  const modal = openModal({ title: 'Rejected Qty', width: 640 });
  modal.body.innerHTML = loadingState();
  let locations = [], reasons = [];
  try {
    const data = await callApi(ENDPOINTS.init, TXN.rejectReasonDropDown, { facilityId: String(state.facilityId) }, {});
    locations = data.rejectionLocation || [];
    reasons = data.rejectionReason || [];
  } catch (e) { toast(e.details || e.message || 'Failed to load reasons', 'error'); }

  const working = row.rejectedDataTable.map((r) => ({ ...r }));
  const sum = () => working.reduce((a, r) => a + (Number(r.qty) || 0), 0);
  let selLoc = '', selReas = '';

  function draw() {
    modal.body.innerHTML = `
      <div id="popErr"></div>
      <div class="cx-grid cx-grid-2" style="margin-bottom:12px">
        <div class="cx-field"><label>Machine</label><input class="cx-input" readonly value="${escapeHtml(row.machineNo)}" /></div>
        <div class="cx-field"><label>Product</label><input class="cx-input" readonly value="${escapeHtml(row.productName)}" /></div>
      </div>
      <div class="cx-field" style="margin-bottom:12px"><label>Total Rejection Qty</label><input class="cx-input" readonly value="${sum()}" /></div>
      <div class="cx-grid cx-grid-3" style="align-items:end;margin-bottom:12px">
        <div class="cx-field"><label>Location</label><div data-slot="loc"></div></div>
        <div class="cx-field"><label>Reason</label><div data-slot="reas"></div></div>
        <div class="cx-field"><label>Qty</label>
          <div style="display:flex;gap:8px">
            <input class="cx-input" id="qtyInput" inputmode="decimal" />
            <button type="button" class="cx-btn cx-btn-primary cx-btn-sm" id="btnAddReason">${icon('plus', { size: 14 })}Add</button>
          </div>
        </div>
      </div>
      <div class="cx-table-wrap"><div class="cx-table-scroll">
        ${!working.length ? emptyState('No rows') : `
          <table class="cx-table"><thead><tr><th class="cx-cell-center">Sl.No</th><th>Reason</th><th class="cx-cell-center">Qty</th><th class="cx-cell-center">Remove</th></tr></thead>
          <tbody>${working.map((r, i) => `<tr>
            <td class="cx-cell-center">${i + 1}</td>
            <td>${escapeHtml(r.rejectedReasDesc || r.rejectedReasId)}</td>
            <td class="cx-cell-center">${escapeHtml(String(r.qty))}</td>
            <td class="cx-cell-center"><button type="button" class="cx-row-action" data-del="${i}">${icon('trash', { size: 15 })}</button></td>
          </tr>`).join('')}</tbody></table>`}
      </div></div>`;
    const locCombo = createCombobox({
      options: locations.map((l) => ({ id: l.locationSeqId, label: l.description || l.areaId })),
      value: selLoc, placeholder: '--Select--', onChange: (id) => { selLoc = id || ''; },
    });
    modal.body.querySelector('[data-slot="loc"]').appendChild(locCombo.el);
    const reasCombo = createCombobox({
      options: reasons.map((r) => ({ id: r.enumId, label: r.description })),
      value: selReas, placeholder: '--Select--', onChange: (id) => { selReas = id || ''; },
    });
    modal.body.querySelector('[data-slot="reas"]').appendChild(reasCombo.el);
    modal.body.querySelector('#btnAddReason').addEventListener('click', () => {
      const popErr = modal.body.querySelector('#popErr');
      const qty = modal.body.querySelector('#qtyInput').value;
      if (!selLoc) return mountBanner(popErr, { type: 'error', message: 'Please select a Location.', autoHideMs: 4000 });
      if (!selReas) return mountBanner(popErr, { type: 'error', message: 'Please select a Reason.', autoHideMs: 4000 });
      if (!qty || Number(qty) <= 0) return mountBanner(popErr, { type: 'error', message: 'Please enter a non-zero Qty.', autoHideMs: 4000 });
      if (working.some((r) => String(r.rejectedReasId) === String(selReas) && String(r.rejectLocationId) === String(selLoc)))
        return mountBanner(popErr, { type: 'error', message: 'This Reason/Location combination is already added.', autoHideMs: 4000 });
      working.push({
        rejectLocationId: selLoc, rejectedReasId: selReas,
        rejectedReasDesc: (reasons.find((x) => String(x.enumId) === String(selReas)) || {}).description || '',
        qty: String(qty),
      });
      selLoc = ''; selReas = '';
      draw();
    });
    modal.body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', (e) => {
      working.splice(Number(e.currentTarget.dataset.del), 1); draw();
    }));
  }
  draw();

  const commit = () => { row.rejectedDataTable = working; row.rejectedQty = String(sum()); render(container); };
  const footer = el(`<div class="cx-modal-footer"><button type="button" class="cx-btn cx-btn-primary" data-a="done">Done</button></div>`);
  modal.overlay.querySelector('.cx-modal').appendChild(footer);
  footer.querySelector('[data-a="done"]').addEventListener('click', () => { commit(); modal.close(); });
  modal.overlay.querySelector('.cx-modal-close').addEventListener('click', () => { commit(); });
}

/* ---------------- Save ---------------- */
async function doSave() {
  if (state.rows.some((r) => !(Number(r.acceptedQty) > 0))) {
    toast('Please ensure all items have a non-zero for UnitWt and accepted qty.', 'error');
    return;
  }
  const ok = await confirmDialog({ title: 'Save', body: 'Are you sure you would like to save?', confirmLabel: 'Save', danger: false });
  if (!ok) return;
  const productionRun = state.rows.map((r) => ({
    rejectedQuantity: r.rejectedQty || '0',
    routingId: r.machineNumberId || '',
    productId: r.productId || '',
    acceptedQuantity: r.acceptedQty || '0',
    endDate: r.endDate || '',
    toolList: (r.toolList || []).map((t) => ({ toolId: t.toolId || '', cavities: '1', toolName: t.toolId || '' })),
    rejectionReasonsList: (r.rejectedDataTable || []).map((x) => ({
      rejectionReasonDesc: x.rejectedReasDesc || '', rejectionQuantity: x.qty || '',
      rejectionLocation: x.rejectLocationId || '', rejectionReasonId: x.rejectedReasId || '',
    })),
    productName: r.productIdName || '',
    startDate: r.startDate || '',
    operator: r.operatorId || '',
  }));
  try {
    const data = await callApi(ENDPOINTS.init, TXN.createIotData, {
      shiftId: String(state.shiftId), facilityId: String(state.facilityId),
      workCenterId: String(state.workCenterId), to: dateApi(), productionRun,
    }, {});
    if (data && data.productionRunGroupId != null) {
      const gid = String(data.productionRunGroupId);
      PrState.clear();
      PrState.setGroupId(gid);
      PrState.setFacilityId(state.facilityId);
      window.location.hash = `#/production-reporting/edit/${encodeURIComponent(gid)}`;
    } else {
      toast('Failed to create production run', 'error');
    }
  } catch (e) { toast(e.details || e.message || 'Failed to create production run', 'error'); }
}

/* ---------------- render ---------------- */
function render(container) {
  const rows = visibleRows();
  container.innerHTML = `
    <div class="cx-page-header"><h1><span class="cx-page-icon">${icon('cpu', { size: 18 })}</span>Get Data From IoT</h1></div>
    <div id="prBanner"></div>
    <div class="cx-card">
      <div class="cx-grid cx-grid-4">
        <div class="cx-field"><label>Facility<span class="req">*</span></label><div data-slot="facility"></div></div>
        <div class="cx-field"><label>Work Center<span class="req">*</span></label><div data-slot="workCenter"></div></div>
        <div class="cx-field"><label>Shift<span class="req">*</span></label><div data-slot="shift"></div></div>
        <div class="cx-field"><label>Date &amp; Time<span class="req">*</span></label><input type="datetime-local" class="cx-input" id="dateTime" value="${state.dateLocal}" /></div>
      </div>
      <div class="cx-flex-center cx-mt-16"><button type="button" class="cx-btn cx-btn-primary" id="btnGet">Get Details</button></div>
    </div>

    ${state.loading ? `<div class="cx-mt-16">${loadingState()}</div>` : (state.rows.length ? `
      <div class="cx-card-title cx-mt-16">Production Run</div>
      <div id="iotToolbar"></div>
      <div class="cx-table-wrap"><div class="cx-table-scroll">
        ${!rows.length ? emptyState('No results match your search.') : `
        <table class="cx-table"><thead><tr>
          <th class="cx-cell-center">Sl.No</th>
          ${sortableTh('Machine Number', 'machineNo', state.sort, () => render(container))}
          <th>Tool</th>
          ${sortableTh('Production Name', 'productIdName', state.sort, () => render(container))}
          ${sortableTh('Start Time', 'startTimeUI', state.sort, () => render(container), 'cx-cell-center')}
          ${sortableTh('End Time', 'endTimeUI', state.sort, () => render(container), 'cx-cell-center')}
          <th class="cx-cell-center">Accepted Qty</th><th class="cx-cell-center">Rejected Qty</th>
        </tr></thead><tbody>${rows.map((r, i) => `<tr data-idx="${i}">
          <td class="cx-cell-center">${i + 1}</td>
          <td>${escapeHtml(r.machineNo)}</td>
          <td>${escapeHtml((r.toolList || []).map((t) => t.toolId).join(', '))}</td>
          <td>${escapeHtml(r.productIdName)}</td>
          <td class="cx-cell-center">${escapeHtml(r.startTimeUI)}</td>
          <td class="cx-cell-center">${escapeHtml(r.endTimeUI)}</td>
          <td class="cx-cell-center"><input class="cx-input" style="width:96px" data-a="acc" data-idx="${i}" value="${escapeHtml(r.acceptedQty)}" /></td>
          <td class="cx-cell-center"><button type="button" class="cx-btn cx-btn-secondary cx-btn-sm" data-a="rej" data-idx="${i}">${escapeHtml(r.rejectedQty || '0')}</button></td>
        </tr>`).join('')}</tbody></table>`}
      </div></div>
      <div class="cx-flex-center cx-mt-16"><button type="button" class="cx-btn cx-btn-primary" id="btnSave">Save</button></div>
    ` : `<div class="cx-mt-16">${emptyState('No IoT data')}</div>`)}
  `;

  if (!state.loading && state.rows.length) {
    const toolbar = renderTableToolbar({
      placeholder: 'Search machine, product...',
      countLabel: `${rows.length} of ${state.rows.length}`,
      onSearch: (q) => { state.search = q; render(container); },
      onExportCsv: () => exportToCsv('iot-production-run', COLUMNS, rows),
      onExportExcel: () => exportToExcel('iot-production-run', COLUMNS, rows),
    });
    const slot = container.querySelector('#iotToolbar');
    if (slot) slot.appendChild(toolbar);
    wireSortableHeaders(container, state.sort, () => render(container));
  }

  const facilityCombo = createCombobox({
    options: state.facilityList.map((f) => ({ id: f.facilityId, label: f.facilityName })),
    value: state.facilityId, placeholder: '--Select--',
    onChange: async (id) => { state.facilityId = id || ''; await fetchWorkCenter(); render(container); },
  });
  container.querySelector('[data-slot="facility"]').appendChild(facilityCombo.el);

  const wcCombo = createCombobox({
    options: state.workCenterList.map((w) => ({ id: w.workCenterId, label: w.workCenterDescription })),
    value: state.workCenterId, placeholder: '--Select--',
    onChange: (id) => { state.workCenterId = id || ''; },
  });
  container.querySelector('[data-slot="workCenter"]').appendChild(wcCombo.el);

  const shiftCombo = createCombobox({
    options: state.shiftList.map((s) => ({ id: s.shiftId, label: s.description })),
    value: state.shiftId, placeholder: '--Select--',
    onChange: (id) => { state.shiftId = id || ''; },
  });
  container.querySelector('[data-slot="shift"]').appendChild(shiftCombo.el);

  container.querySelector('#dateTime').addEventListener('change', (e) => { state.dateLocal = e.target.value; });
  container.querySelector('#btnGet').addEventListener('click', () => getDetails(container));

  const btnSave = container.querySelector('#btnSave');
  if (btnSave) btnSave.addEventListener('click', () => doSave());
  // Handlers resolve rows[idx] from the SAME filtered+sorted array that built the
  // DOM; each entry is a shared reference into state.rows, so edits persist and
  // never target the wrong run when a search/sort is active.
  container.querySelectorAll('[data-a="acc"]').forEach((inp) => inp.addEventListener('change', (e) => {
    rows[Number(e.target.dataset.idx)].acceptedQty = e.target.value;
  }));
  container.querySelectorAll('[data-a="rej"]').forEach((b) => b.addEventListener('click', (e) => openRejectedPopup(container, rows[Number(e.currentTarget.dataset.idx)])));
}

export default {
  title: 'Get Data From IoT',
  async mount(container) {
    state = freshState();
    render(container);
    try { await fetchFacility(); } catch (e) {}
    try { await fetchShift(); } catch (e) {}
    render(container);
  },
};
