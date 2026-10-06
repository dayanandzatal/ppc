// Production Reporting — Create / View screen.
// Routes: /production-reporting/create and /production-reporting/edit/:id
// See spec: production_reporting.md §2.
import { callApi, ENDPOINTS, TXN } from '../../api.js';
import { icon } from '../../icons.js';
import {
  el, escapeHtml, toast, openModal, confirmDialog, loadingState, emptyState,
  createCombobox, mountBanner,
} from '../../ui.js';
import { Session } from '../../session.js';
import { todayIso, addDays } from '../../dateUtils.js';
import { PrState } from './prState.js';

let state = {};

function freshState(id) {
  return {
    id: id || null, // group id when editing (view), null for create
    perms: Session.getPrPerms(),
    loading: false,
    // Dropdown source lists
    facilityList: [], workCenterList: [], machineList: [], productList: [],
    shiftList: [], qaList: [], workerList: [], toolList: [],
    // Add-form selections
    facilityId: '', workCenterId: '', shiftId: '', machineNumberId: '',
    productId: '', operatorId: '', inspectedId: '',
    acceptedQty: '', planQty: '', internalBatchNo: '', selectedTools: [],
    // Derived from product
    acceptedUom: '', unitWeight: '', grossWt: '', netWt: '',
    // Shift-derived times
    startTimeApi: '', endTimeApi: '', startTimeUI: '', endTimeUI: '',
    // Header (edit)
    facilityDesc: '', workCenterDesc: '', shiftDesc: '', createDate: todayIso(),
    // Rows + status
    rows: [],
    statusId: 'PROD_GROUP_CREATED', // effective editable status
    statusIdforConsumption: 'PROD_GROUP_CREATED',
    deleteIconShow: true,
    today: todayIso(),
  };
}

/* ---------------- dropdown fetches (cascading) ---------------- */
async function fetchFacility() {
  const data = await callApi(ENDPOINTS.init, TXN.getFacility, {}, {});
  state.facilityList = data.facilityList || [];
  if (state.facilityList.length === 1 && !state.id) {
    state.facilityId = state.facilityList[0].facilityId;
    state.facilityDesc = state.facilityList[0].facilityName;
    await fetchWorkCenter();
  }
}
async function fetchWorkCenter() {
  state.workCenterId = ''; state.machineList = []; state.productList = [];
  state.qaList = []; state.workerList = []; state.toolList = []; state.selectedTools = [];
  if (!state.facilityId) { state.workCenterList = []; return; }
  const data = await callApi(ENDPOINTS.init, TXN.getWorkcenter, { facilityId: String(state.facilityId) }, {});
  state.workCenterList = data.workCenterList || [];
  if (state.workCenterList.length === 1) {
    state.workCenterId = state.workCenterList[0].workCenterId;
    await Promise.all([fetchMachine(), fetchOperator()]);
  }
}
async function fetchMachine() {
  state.machineList = []; state.machineNumberId = '';
  if (!state.facilityId || !state.workCenterId) return;
  const data = await callApi(ENDPOINTS.init, TXN.getMachineNumber,
    { facilityId: String(state.facilityId), workCenterId: String(state.workCenterId) }, {});
  state.machineList = data.machineNumberDetails || [];
  if (state.machineList.length === 1) {
    state.machineNumberId = state.machineList[0].workEffortId;
    await fetchProducts();
  }
}
async function fetchOperator() {
  state.qaList = []; state.workerList = []; state.operatorId = ''; state.inspectedId = '';
  if (!state.workCenterId) return;
  const data = await callApi(ENDPOINTS.init, TXN.operatorInspectedBy, { workCenterId: String(state.workCenterId) }, {});
  state.qaList = data.qaList || [];
  state.workerList = data.workerList || [];
  if (state.workerList.length === 1) state.operatorId = state.workerList[0].partyId;
  if (state.qaList.length === 1) state.inspectedId = state.qaList[0].partyId;
}
async function fetchProducts() {
  state.productList = []; state.productId = ''; state.toolList = []; state.selectedTools = [];
  state.acceptedUom = ''; state.unitWeight = ''; state.grossWt = ''; state.netWt = '';
  if (!state.machineNumberId) return;
  const data = await callApi(ENDPOINTS.init, TXN.getProducts, { workEffortId: String(state.machineNumberId) }, {});
  state.productList = data.productDetails || [];
  if (state.productList.length === 1) {
    applyProduct(state.productList[0]);
    await fetchTools();
  }
}
function applyProduct(p) {
  state.productId = p.productId;
  state.acceptedUom = p.acceptedUom || '';
  state.unitWeight = p.unitWeight != null ? String(p.unitWeight) : '';
  state.grossWt = p.grossWt != null ? String(p.grossWt) : '';
  state.netWt = p.netWt != null ? String(p.netWt) : '';
}
async function fetchTools() {
  state.toolList = []; state.selectedTools = [];
  if (!state.productId || !state.facilityId) return;
  const data = await callApi(ENDPOINTS.init, TXN.createToolList,
    { productId: String(state.productId), facilityId: String(state.facilityId) }, {});
  state.toolList = data.toolList || [];
  if (state.toolList.length === 1) state.selectedTools = [state.toolList[0].toolId];
}
async function fetchShift() {
  const data = await callApi(ENDPOINTS.init, TXN.getShift, {}, {});
  state.shiftList = data.shiftDetails || [];
  if (state.shiftList.length === 1 && !state.id) {
    state.shiftId = state.shiftList[0].shiftId;
    computeShiftTimes();
  }
}

/* ---------------- night-shift date logic ---------------- */
function computeShiftTimes() {
  const shift = state.shiftList.find((s) => String(s.shiftId) === String(state.shiftId));
  if (!shift) { state.startTimeApi = state.endTimeApi = state.startTimeUI = state.endTimeUI = ''; return; }
  const startUI = (shift.startTime || '').substring(0, 5);
  const endUI = (shift.endTime || '').substring(0, 5);
  const today = state.today;
  let startDate, endDate;
  if (String(state.shiftId) !== '10010' && startUI) {
    // normal day shift
    startDate = today; endDate = today;
  } else {
    const hour = new Date().getHours();
    if (hour >= 19 && hour <= 23) { startDate = today; endDate = addDays(today, 1); }
    else { startDate = addDays(today, -1); endDate = today; }
  }
  state.startTimeUI = startUI; state.endTimeUI = endUI;
  state.startTimeApi = startUI ? `${startDate} ${startUI}:00` : '';
  state.endTimeApi = endUI ? `${endDate} ${endUI}:00` : '';
}

/* ---------------- time helpers ---------------- */
function hhmmToMinutes(t) {
  if (!t || t.indexOf(':') < 0) return 0;
  const [h, m] = t.split(':');
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
}
function minutesToHHMM(minStr) {
  const minutes = parseInt(minStr, 10);
  if (!minutes) return 'hh:mm';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ---------------- lock predicate ---------------- */
function isLocked() {
  return state.id != null && state.perms.PR_COMPLETE === true && state.statusId !== 'PROD_GROUP_CREATED';
}

/* ---------------- edit load ---------------- */
async function loadEdit() {
  state.loading = true;
  const data = await callApi(ENDPOINTS.init, TXN.editReporting,
    { productionRunGroupId: String(state.id) }, {});
  const list = data.productionReportingList || [];

  const raw = data.statusId;
  if (raw === 'PROD_GROUP_SUBMITTED' || raw === 'PROD_GROUP_CREATED') {
    state.deleteIconShow = raw === 'PROD_GROUP_CREATED';
    state.statusId = 'PROD_GROUP_CREATED';
  } else {
    state.statusId = '';
    state.deleteIconShow = false;
  }
  state.statusIdforConsumption = raw || '';

  const effEmpty = state.statusId === '';
  state.rows = [];
  list.forEach((p) => {
    const ps = p.parentStatusId;
    const include = (!effEmpty && ps !== 'PRUN_CANCELLED') ||
      (effEmpty && ps === 'PRUN_CANCELLED') || (ps === 'PRUN_COMPLETED');
    if (!include) return;
    const down = (p.downList && p.downList[0]) || {};
    state.rows.push({
      workEffortId: p.workEffortId || '',
      machineNumber: p.machineNo || '',
      machineNumberId: p.machineNo || '',
      internalBatchNo: p.internalBatchNo || '',
      toolList: (p.toolList || []).map((t) => ({ toolId: t.toolId })),
      productId: p.productId || '',
      productName: p.productName || '',
      productIdName: `${p.productName || ''} [${p.productId || ''}]`,
      startTimeUI: (p.startTime || '').substring(11, 16),
      startTimeApi: p.startTime || '',
      endTimeUI: (p.endTime || '').substring(11, 16),
      endTimeApi: p.endTime || '',
      grossWt: p.grossWt != null ? String(p.grossWt) : '',
      netWt: p.netWt != null ? String(p.netWt) : '',
      planQuantity: p.planQuantity != null ? String(p.planQuantity) : '',
      acceptedQty: p.acceptedQty != null ? String(p.acceptedQty) : '',
      unitWt: p.unitWt != null ? String(p.unitWt) : '',
      uom: p.uomDesc || '',
      acceptedUom: p.uomDesc || '',
      rejectedQty: p.rejectedQty != null ? String(p.rejectedQty) : '0',
      reworkQty: p.reWorkQty != null ? String(p.reWorkQty) : '0',
      producedWtKg: p.producedWtKg != null ? String(p.producedWtKg) : '0',
      rejectedWtKg: p.rejectedWtKg != null ? String(p.rejectedWtKg) : '0',
      operatorId: p.operatorId || '',
      inspectedById: p.inspectedById || '',
      rejectedDataTable: (p.rejReasonList || []).map((r) => ({
        rejectLocationId: r.rejectionLocation, rejectedReasId: r.rejectionReasonId,
        rejectedReasDesc: r.rejectionReasonDesc, qty: String(r.rejectionQuantity),
      })),
      reworkDataTable: (p.reworkReasonList || []).map((r) => ({
        reWorkLocationId: r.reworkLocation, reWorkReasId: r.reworkReasonId,
        reWorkReasDesc: r.reworkReasonDesc, qty: String(r.reworkQuantity),
      })),
      downTimeDisplay: minutesToHHMM(down.downTimeMins),
      downTimeSeqId: down.downTimeSeqId || '',
      downTimeReasonId: down.downtimeReasonId || '',
      downTimeReasonDesc: down.downTimeDesc || '',
      downTimeComments: down.downTimeComments || '',
      downTimeMins: down.downTimeMins != null ? String(down.downTimeMins) : '0',
    });
  });

  // Header fields
  state.createDate = (data.createDate || '').substring(0, 10) || state.today;
  state.today = state.createDate;
  state.facilityDesc = data.facilityDesc || '';
  state.facilityId = data.facilityId || '';
  state.workCenterDesc = data.workCenterDesc || '';
  state.workCenterId = data.workCenterId || '';
  state.shiftDesc = data.shiftDesc || '';
  state.shiftId = data.shiftId || '';
  state.startTimeUI = (data.shiftStartTime || '').substring(0, 5);
  state.endTimeUI = (data.shiftEndTime || '').substring(0, 5);
  if (state.startTimeUI) state.startTimeApi = `${state.createDate} ${state.startTimeUI}:00`;
  if (state.endTimeUI) state.endTimeApi = `${state.createDate} ${state.endTimeUI}:00`;

  PrState.setGroupId(state.id);
  PrState.setFacilityId(state.facilityId);
  PrState.setStatusId(state.statusId);
  PrState.setConsumptionStatus(state.statusIdforConsumption);

  // Load facility list so the (locked) header/combo can render its label.
  try { await fetchFacility(); } catch (e) {}
  // Load work-center list for the facility so the combo shows its label, then
  // (if still editable) populate machine/operator lists so the add-form works.
  if (state.facilityId) {
    try {
      const wc = await callApi(ENDPOINTS.init, TXN.getWorkcenter, { facilityId: String(state.facilityId) }, {});
      state.workCenterList = wc.workCenterList || [];
    } catch (e) {}
  }
  if (state.statusId === 'PROD_GROUP_CREATED' && state.workCenterId) {
    try { await fetchMachine(); } catch (e) {}
    try { await fetchOperator(); } catch (e) {}
  }
  state.loading = false;
}

/* ---------------- add row ---------------- */
function validateAndAdd(container) {
  const banner = container.querySelector('#prBanner');
  const err = (m) => mountBanner(banner, { type: 'error', message: m, autoHideMs: 5000 });
  if (state.rows.length >= 25) return err('Maximum of 25 production run rows allowed.');
  if (!state.today) return err('Please select a Date.');
  if (!state.facilityId) return err('Please select a Facility.');
  if (!state.workCenterId) return err('Please select a Work Center.');
  if (!state.shiftId) return err('Please select a Shift.');
  if (!state.machineNumberId) return err('Please select a Machine Number.');
  if (!state.productId) return err('Please select a Product Id.');
  if (!state.operatorId) return err('Please select an Operator.');
  if (!state.acceptedQty || Number(state.acceptedQty) <= 0) return err('Please enter Accepted Qty.');
  if (!state.selectedTools.length) return err('Please select at least one Tool.');

  const producedWtKg = (Number(state.acceptedQty) * Number(state.unitWeight || 0)).toFixed(4);
  const machine = state.machineList.find((m) => String(m.workEffortId) === String(state.machineNumberId));
  const product = state.productList.find((p) => String(p.productId) === String(state.productId));
  state.rows.push({
    workEffortId: '',
    machineNumber: machine ? machine.description : state.machineNumberId,
    machineNumberId: state.machineNumberId,
    internalBatchNo: state.internalBatchNo || '',
    toolList: state.selectedTools.map((t) => ({ toolId: t })),
    productId: state.productId,
    productName: product ? product.productName : '',
    productIdName: product ? `${product.productName} [${product.productId}]` : state.productId,
    startTimeUI: state.startTimeUI, startTimeApi: state.startTimeApi,
    endTimeUI: state.endTimeUI, endTimeApi: state.endTimeApi,
    grossWt: state.grossWt, netWt: state.netWt,
    planQuantity: state.planQty || '',
    acceptedQty: String(state.acceptedQty),
    unitWt: state.unitWeight || '0',
    uom: state.acceptedUom, acceptedUom: state.acceptedUom,
    rejectedQty: '0', reworkQty: '0',
    producedWtKg, rejectedWtKg: '0',
    operatorId: state.operatorId, inspectedById: state.inspectedId || '',
    rejectedDataTable: [], reworkDataTable: [],
    downTimeDisplay: 'hh:mm', downTimeSeqId: '', downTimeReasonId: '',
    downTimeReasonDesc: '', downTimeComments: '', downTimeMins: '0',
  });
  // Reset per-row entry fields (keep facility/wc/shift locked)
  state.machineNumberId = ''; state.productId = ''; state.selectedTools = [];
  state.toolList = []; state.acceptedQty = ''; state.planQty = ''; state.internalBatchNo = '';
  state.acceptedUom = ''; state.unitWeight = ''; state.grossWt = ''; state.netWt = '';
  state.machineList = []; state.productList = [];
  // Re-fetch machine list for continued adding (facility/wc still set)
  fetchMachine().finally(() => render(container));
}

/* ---------------- delete row ---------------- */
async function deleteRow(container, idx) {
  const ok = await confirmDialog({ title: 'Delete', body: 'Are you sure you would like to delete?' });
  if (!ok) return;
  const row = state.rows[idx];
  if (!row.workEffortId) {
    state.rows.splice(idx, 1);
    render(container);
    return;
  }
  try {
    await callApi(ENDPOINTS.init, TXN.removeTableAPI, {
      productionRunGroupId: PrState.getGroupId() || String(state.id),
      workEffortParentId: String(row.workEffortId),
      statusId: 'PRUN_CANCELLED',
    }, {});
    state.rows.splice(idx, 1);
    render(container);
  } catch (e) {
    toast(e.details || e.message || 'Delete failed', 'error');
  }
}

/* ---------------- Rejected / Rework popup (shared shape) ---------------- */
async function openReasonPopup(container, idx, kind) {
  const row = state.rows[idx];
  const locked = isLocked();
  const isRework = kind === 'rework';
  const title = isRework ? 'Rework Qty' : 'Rejected Qty';
  const table = isRework ? row.reworkDataTable : row.rejectedDataTable;
  const working = table.map((r) => ({ ...r }));

  const modal = openModal({ title, width: 640 });
  modal.body.innerHTML = loadingState();
  let locations = [], reasons = [];
  try {
    const txn = isRework ? TXN.reWorkReasonDropDown : TXN.rejectReasonDropDown;
    const data = await callApi(ENDPOINTS.init, txn, { facilityId: String(PrState.getFacilityId() || state.facilityId) }, {});
    locations = isRework ? (data.reworkLocation || []) : (data.rejectionLocation || []);
    reasons = isRework ? (data.reworkReason || []) : (data.rejectionReason || []);
  } catch (e) { toast(e.details || e.message || 'Failed to load reasons', 'error'); }

  const locId = (r) => (isRework ? r.reWorkLocationId : r.rejectLocationId);
  const reasId = (r) => (isRework ? r.reWorkReasId : r.rejectedReasId);
  const reasDesc = (r) => (isRework ? r.reWorkReasDesc : r.rejectedReasDesc);
  const sum = () => working.reduce((a, r) => a + (Number(r.qty) || 0), 0);

  function mkRow(loc, reas, qty) {
    return isRework
      ? { reWorkLocationId: loc, reWorkReasId: reas, reWorkReasDesc: (reasons.find((x) => String(x.enumId) === String(reas)) || {}).description || '', qty }
      : { rejectLocationId: loc, rejectedReasId: reas, rejectedReasDesc: (reasons.find((x) => String(x.enumId) === String(reas)) || {}).description || '', qty };
  }

  let selLoc = '', selReas = '';
  function draw() {
    modal.body.innerHTML = `
      <div id="popErr"></div>
      <div class="cx-grid cx-grid-2" style="margin-bottom:12px">
        <div class="cx-field"><label>Machine</label><input class="cx-input" readonly value="${escapeHtml(row.machineNumber)}" /></div>
        <div class="cx-field"><label>Product</label><input class="cx-input" readonly value="${escapeHtml(row.productName)}" /></div>
      </div>
      <div class="cx-field" style="margin-bottom:12px"><label>Total ${isRework ? 'Rework' : 'Rejection'} Qty</label><input class="cx-input" readonly value="${sum()}" /></div>
      ${locked ? '' : `
      <div class="cx-grid cx-grid-3" style="align-items:end;margin-bottom:12px">
        <div class="cx-field"><label>Location</label><div data-slot="loc"></div></div>
        <div class="cx-field"><label>Reason</label><div data-slot="reas"></div></div>
        <div class="cx-field"><label>Qty</label>
          <div style="display:flex;gap:8px">
            <input class="cx-input" id="qtyInput" inputmode="decimal" />
            <button type="button" class="cx-btn cx-btn-primary cx-btn-sm" id="btnAddReason">${icon('plus', { size: 14 })}Add</button>
          </div>
        </div>
      </div>`}
      <div class="cx-table-wrap"><div class="cx-table-scroll">
        ${!working.length ? emptyState('No rows') : `
          <table class="cx-table"><thead><tr><th class="cx-cell-center">Sl.No</th><th>Reason</th><th class="cx-cell-center">Qty</th>${locked ? '' : '<th class="cx-cell-center">Remove</th>'}</tr></thead>
          <tbody>${working.map((r, i) => `<tr>
            <td class="cx-cell-center">${i + 1}</td>
            <td>${escapeHtml(reasDesc(r) || reasId(r))}</td>
            <td class="cx-cell-center">${escapeHtml(String(r.qty))}</td>
            ${locked ? '' : `<td class="cx-cell-center"><button type="button" class="cx-row-action" data-del="${i}">${icon('trash', { size: 15 })}</button></td>`}
          </tr>`).join('')}</tbody></table>`}
      </div></div>
    `;
    if (!locked) {
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
        if (working.some((r) => String(reasId(r)) === String(selReas) && String(locId(r)) === String(selLoc)))
          return mountBanner(popErr, { type: 'error', message: 'This Reason/Location combination is already added.', autoHideMs: 4000 });
        working.push(mkRow(selLoc, selReas, String(qty)));
        selLoc = ''; selReas = '';
        draw();
      });
      modal.body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', (e) => {
        working.splice(Number(e.currentTarget.dataset.del), 1); draw();
      }));
    }
  }
  draw();

  // Closing (X / esc / overlay) commits — override close to persist.
  const origClose = modal.close;
  const commit = () => {
    if (!locked) {
      if (isRework) { row.reworkDataTable = working; row.reworkQty = String(sum()); }
      else { row.rejectedDataTable = working; row.rejectedQty = String(sum()); }
    }
    render(container);
  };
  // Wrap overlay close paths: our modal calls onClose on close; simplest is to
  // add a footer Done button plus commit on the close icon.
  const footer = el(`<div class="cx-modal-footer"><button type="button" class="cx-btn cx-btn-primary" data-a="done">Done</button></div>`);
  modal.overlay.querySelector('.cx-modal').appendChild(footer);
  footer.querySelector('[data-a="done"]').addEventListener('click', () => { commit(); origClose(); });
  modal.overlay.querySelector('.cx-modal-close').addEventListener('click', () => { commit(); });
}

/* ---------------- Down Time popup ---------------- */
async function openDownTimePopup(container, idx) {
  const row = state.rows[idx];
  const locked = isLocked();
  const modal = openModal({ title: 'Down Time', width: 520 });
  modal.body.innerHTML = loadingState();
  let reasons = [];
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getDownTimeReason, {}, {});
    reasons = data.downTimeList || [];
  } catch (e) { toast(e.details || e.message || 'Failed to load reasons', 'error'); }

  let timeVal = row.downTimeDisplay && row.downTimeDisplay !== 'hh:mm' ? row.downTimeDisplay : '';
  let reasonId = row.downTimeReasonId || '';
  let comments = row.downTimeComments || '';

  modal.body.innerHTML = `
    <div id="popErr"></div>
    <div class="cx-field" style="margin-bottom:12px"><label>Time (hh:mm)</label>
      <input class="cx-input" id="dtTime" maxlength="5" placeholder="hh:mm" value="${escapeHtml(timeVal)}" ${locked ? 'readonly' : ''} /></div>
    <div class="cx-field" style="margin-bottom:12px"><label>Reason</label><div data-slot="reason"></div></div>
    <div class="cx-field" style="margin-bottom:12px"><label>Comments</label>
      <textarea class="cx-input" id="dtComments" ${locked ? 'readonly' : ''}>${escapeHtml(comments)}</textarea></div>
  `;
  const reasonCombo = createCombobox({
    options: reasons.map((r) => ({ id: r.enumId, label: r.description })),
    value: reasonId, placeholder: '--Select--', disabled: locked,
    onChange: (id) => { reasonId = id || ''; },
  });
  modal.body.querySelector('[data-slot="reason"]').appendChild(reasonCombo.el);

  const timeInput = modal.body.querySelector('#dtTime');
  timeInput.addEventListener('input', () => {
    // auto-colon insert after 2 digits
    let v = timeInput.value.replace(/[^0-9:]/g, '');
    if (v.length === 2 && timeVal.length < v.length && v.indexOf(':') < 0) v = v + ':';
    timeInput.value = v.slice(0, 5);
    timeVal = timeInput.value;
  });

  if (!locked) {
    const footer = el(`<div class="cx-modal-footer">
      <button type="button" class="cx-btn cx-btn-secondary" data-a="cancel">Cancel</button>
      <button type="button" class="cx-btn cx-btn-primary" data-a="save">Save</button></div>`);
    modal.overlay.querySelector('.cx-modal').appendChild(footer);
    footer.querySelector('[data-a="cancel"]').addEventListener('click', () => modal.close());
    footer.querySelector('[data-a="save"]').addEventListener('click', () => {
      const popErr = modal.body.querySelector('#popErr');
      const err = (m) => mountBanner(popErr, { type: 'error', message: m, autoHideMs: 4500 });
      const downtime = timeInput.value;
      comments = modal.body.querySelector('#dtComments').value;
      // compute duration from row start/end UI times
      const startMin = hhmmToMinutes(row.startTimeUI);
      let endMin = hhmmToMinutes(row.endTimeUI);
      if (endMin < startMin) endMin += 24 * 60; // spans midnight
      const durationInMinutes = endMin - startMin;
      const durationHours = Math.floor(durationInMinutes / 60);
      const durationMinutes = durationInMinutes % 60;
      const downtimeDuration = hhmmToMinutes(downtime);
      if (downtimeDuration > durationInMinutes) {
        return err(`Downtime must be within the total duration of ${durationHours} hours and ${durationMinutes} minutes between start time and end time`);
      }
      if (downtime.length !== 5) return err('Please enter the correct time.');
      if (!reasonId) return err('Reason is required.');
      if (!comments.trim()) return err('Comments is required.');
      row.downTimeMins = String(downtimeDuration);
      row.downTimeDisplay = downtime;
      row.downTimeReasonId = reasonId;
      row.downTimeReasonDesc = (reasons.find((r) => String(r.enumId) === String(reasonId)) || {}).description || '';
      row.downTimeComments = comments;
      modal.close();
      render(container);
    });
  }
}

/* ---------------- save ---------------- */
async function doSave(container) {
  // pre-submit: every row accepted qty > 0
  if (state.rows.some((r) => !(Number(r.acceptedQty) > 0))) {
    mountBanner(container.querySelector('#prBanner'),
      { type: 'error', message: 'Please ensure all items have a non-zero for UnitWt and accepted qty.', autoHideMs: 5000 });
    return;
  }
  const brandNew = state.id == null && !PrState.getGroupId();
  const ok = await confirmDialog({
    title: brandNew ? 'Save' : 'Confirm',
    body: brandNew ? 'Are you sure you would like to save?' : 'Are you sure you would like to confirm?',
    confirmLabel: brandNew ? 'Save' : 'Confirm', danger: false,
  });
  if (!ok) return;

  const productionRun = state.rows.map((r) => ({
    planQuantity: r.planQuantity || '',
    internalBatchNo: r.internalBatchNo || '',
    reworkWeight: '0',
    rejectionReasonsList: (r.rejectedDataTable || []).map((x) => ({
      rejectionReasonId: x.rejectedReasId, rejectionQuantity: x.qty, rejectionLocation: x.rejectLocationId,
    })),
    reworkReasonsList: (r.reworkDataTable || []).map((x) => ({
      reworkReasonId: x.reWorkReasId, reworkQuantity: x.qty, reworkLocation: x.reWorkLocationId,
    })),
    toolList: (r.toolList || []).map((t) => ({ toolId: t.toolId })),
    reworkQuantity: r.reworkQty || '0',
    operatorId: r.operatorId || '',
    inspectedBy: r.inspectedById || '',
    acceptedQuantity: r.acceptedQty || '0',
    downTimeComments: r.downTimeComments || '',
    downTimeMins: r.downTimeMins || '0',
    downTimeReason: r.downTimeReasonId || '',
    downTimeSeqId: r.downTimeSeqId || '',
    endDate: r.endTimeApi || '',
    productId: r.productId || '',
    acceptedWeight: r.producedWtKg || '0',
    rejectedQuantity: r.rejectedQty || '0',
    rejectedWeight: r.rejectedWtKg || '0',
    routingId: r.machineNumberId || '',
    startDate: r.startTimeApi || '',
    statusId: '',
    unitWeight: r.unitWt || '0',
    workEffortId: r.workEffortId || '',
  }));

  const payload = {
    productionRunGroupId: PrState.getGroupId() || '',
    shiftId: String(state.shiftId),
    facilityId: String(state.facilityId),
    workCenterId: String(state.workCenterId),
    productionRun,
  };
  try {
    const data = await callApi(ENDPOINTS.init, TXN.createReporting, payload, {});
    const groupId = data.productionRunGroupId != null ? String(data.productionRunGroupId) : (PrState.getGroupId() || '');
    PrState.setGroupId(groupId);
    PrState.setFacilityId(state.facilityId);
    PrState.setStatusId('PROD_GROUP_CREATED');
    PrState.setConsumptionStatus(state.statusIdforConsumption || 'PROD_GROUP_CREATED');
    window.location.hash = `#/production-reporting/consumption/${encodeURIComponent(groupId)}`;
  } catch (e) {
    toast(e.details || e.message || 'Failed to save production reporting', 'error');
  }
}

/* ---------------- render ---------------- */
function toolSelectHtml() {
  const count = state.selectedTools.length;
  const label = count ? `${count} selected` : 'Select tool(s)';
  return `
    <div class="cx-combo" data-slot="tools">
      <div class="cx-input-suffix-wrap">
        <input type="text" class="cx-input" id="toolInput" readonly placeholder="Select tool(s)" value="${escapeHtml(count ? label : '')}" />
        <button type="button" class="cx-input-suffix-btn" id="toolBtn">${icon('chevron-down', { size: 16 })}</button>
      </div>
      <div id="toolPanel"></div>
    </div>`;
}

function rowHtml(r, idx) {
  const locked = isLocked();
  const canDelete = state.statusId === 'PROD_GROUP_CREATED' && state.deleteIconShow;
  const toolNames = (r.toolList || []).map((t) => t.toolId).join(', ');
  return `
    <tr data-idx="${idx}">
      <td class="cx-cell-center">${idx + 1}</td>
      <td>${escapeHtml(r.machineNumber)}</td>
      <td>${escapeHtml(r.internalBatchNo || '-')}</td>
      <td>${escapeHtml(toolNames)}</td>
      <td>${escapeHtml(r.productName || r.productIdName)}</td>
      <td class="cx-cell-center">${escapeHtml(r.startTimeUI || '')}</td>
      <td class="cx-cell-center">${escapeHtml(r.endTimeUI || '')}</td>
      <td class="cx-cell-center">${escapeHtml(r.grossWt || '')}</td>
      <td class="cx-cell-center">${escapeHtml(r.netWt || '')}</td>
      <td class="cx-cell-center">${escapeHtml(r.planQuantity || '')}</td>
      <td class="cx-cell-center">
        <input class="cx-input" style="width:88px" data-a="acc" data-idx="${idx}" value="${escapeHtml(r.acceptedQty)}" ${locked ? 'readonly' : ''} />
      </td>
      <td class="cx-cell-center"><button type="button" class="cx-btn cx-btn-secondary cx-btn-sm" data-a="rej" data-idx="${idx}">${escapeHtml(r.rejectedQty || '0')}</button></td>
      <td class="cx-cell-center"><button type="button" class="cx-btn cx-btn-secondary cx-btn-sm" data-a="rew" data-idx="${idx}">${escapeHtml(r.reworkQty || '0')}</button></td>
      <td class="cx-cell-center"><button type="button" class="cx-btn cx-btn-secondary cx-btn-sm" data-a="down" data-idx="${idx}">${escapeHtml(r.downTimeDisplay || 'hh:mm')}</button></td>
      <td class="cx-cell-center">${canDelete ? `<button type="button" class="cx-row-action" data-a="del" data-idx="${idx}" title="Delete">${icon('trash', { size: 15 })}</button>` : ''}</td>
    </tr>`;
}

function bottomButton() {
  // view-locked (id present, PR_COMPLETE, not editable, no PR_SUBMIT) -> Next (nav only)
  if (state.id != null && state.perms.PR_COMPLETE === true && state.perms.PR_SUBMIT !== true) {
    return { label: 'Next', navOnly: true };
  }
  const brandNew = state.id == null && !PrState.getGroupId();
  if (brandNew) return { label: 'Save & Continue', navOnly: false };
  if (state.statusId === 'PROD_GROUP_CREATED') return { label: 'Confirm', navOnly: false };
  return { label: 'Next', navOnly: true };
}

function render(container) {
  const locked = isLocked();
  const showAddForm = state.statusId === 'PROD_GROUP_CREATED' && !locked;
  const headerLocked = state.rows.length > 0; // facility/wc/shift locked once >=1 row
  const title = (state.id != null && state.perms.PR_COMPLETE)
    ? `View Production Reporting ${escapeHtml(String(state.id))}` : 'Create Production Reporting';

  if (state.loading) { container.innerHTML = `<div class="cx-page-header"><h1><span class="cx-page-icon">${icon('plus', { size: 18 })}</span>${title}</h1></div>${loadingState()}`; return; }

  const btn = bottomButton();
  container.innerHTML = `
    <div class="cx-page-header"><h1><span class="cx-page-icon">${icon('plus', { size: 18 })}</span>${title}</h1></div>
    <div id="prBanner"></div>

    ${showAddForm ? `
    <div class="cx-card">
      <div class="cx-card-title">Add Production Run</div>
      <div class="cx-grid cx-grid-4">
        <div class="cx-field"><label>Date</label><input class="cx-input" readonly value="${escapeHtml(state.today)}" /></div>
        <div class="cx-field"><label>Facility<span class="req">*</span></label><div data-slot="facility"></div></div>
        <div class="cx-field"><label>Work Center<span class="req">*</span></label><div data-slot="workCenter"></div></div>
        <div class="cx-field"><label>Shift<span class="req">*</span></label><div data-slot="shift"></div></div>
        <div class="cx-field"><label>Machine Number<span class="req">*</span></label><div data-slot="machine"></div></div>
        <div class="cx-field"><label>Product Id<span class="req">*</span></label><div data-slot="product"></div></div>
        <div class="cx-field"><label>Operator<span class="req">*</span></label><div data-slot="operator"></div></div>
        <div class="cx-field"><label>Inspected By</label><div data-slot="inspected"></div></div>
        <div class="cx-field"><label>Accepted Qty<span class="req">*</span></label><input class="cx-input" id="acceptedQty" inputmode="decimal" value="${escapeHtml(state.acceptedQty)}" /></div>
        <div class="cx-field"><label>Plan Qty</label><input class="cx-input" id="planQty" inputmode="decimal" value="${escapeHtml(state.planQty)}" /></div>
        <div class="cx-field"><label>Internal Batch No</label><input class="cx-input" id="batchNo" value="${escapeHtml(state.internalBatchNo)}" /></div>
        <div class="cx-field"><label>Tool(s)<span class="req">*</span></label>${toolSelectHtml()}</div>
      </div>
      <div class="cx-flex-center cx-mt-16"><button type="button" class="cx-btn cx-btn-primary" id="btnAddRow">${icon('plus', { size: 15 })}Add</button></div>
    </div>` : `
    <div class="cx-card">
      <div class="cx-grid cx-grid-4">
        <div class="cx-field"><label>Date</label><input class="cx-input" readonly value="${escapeHtml(state.today)}" /></div>
        <div class="cx-field"><label>Facility</label><input class="cx-input" readonly value="${escapeHtml(state.facilityDesc)}" /></div>
        <div class="cx-field"><label>Work Center</label><input class="cx-input" readonly value="${escapeHtml(state.workCenterDesc)}" /></div>
        <div class="cx-field"><label>Shift</label><input class="cx-input" readonly value="${escapeHtml(state.shiftDesc)}" /></div>
      </div>
    </div>`}

    <div class="cx-table-wrap cx-mt-16"><div class="cx-table-scroll">
      ${!state.rows.length ? emptyState('No production runs added') : `
        <table class="cx-table"><thead><tr>
          <th class="cx-cell-center">Sl.No</th><th>Machine Number</th><th>Internal Batch No</th><th>Tool</th><th>Product Name</th>
          <th class="cx-cell-center">Start Time</th><th class="cx-cell-center">End Time</th><th class="cx-cell-center">Gross Wt</th><th class="cx-cell-center">Net Wt</th>
          <th class="cx-cell-center">Plan Qty</th><th class="cx-cell-center">Accepted Qty</th><th class="cx-cell-center">Rejected Qty</th>
          <th class="cx-cell-center">Rework Qty</th><th class="cx-cell-center">Down Time</th><th class="cx-cell-center">Action</th>
        </tr></thead><tbody>${state.rows.map(rowHtml).join('')}</tbody></table>`}
    </div></div>

    ${state.rows.length ? `<div class="cx-flex-center cx-mt-16"><button type="button" class="cx-btn cx-btn-primary" id="btnBottom">${escapeHtml(btn.label)}</button></div>` : ''}
  `;

  if (showAddForm) wireAddForm(container, headerLocked);

  // Row interactions
  container.querySelectorAll('[data-a="acc"]').forEach((inp) => inp.addEventListener('change', (e) => {
    const i = Number(e.target.dataset.idx);
    state.rows[i].acceptedQty = e.target.value;
    state.rows[i].producedWtKg = (Number(e.target.value) * Number(state.rows[i].unitWt || 0)).toFixed(4);
  }));
  container.querySelectorAll('[data-a="rej"]').forEach((b) => b.addEventListener('click', (e) => openReasonPopup(container, Number(e.currentTarget.dataset.idx), 'reject')));
  container.querySelectorAll('[data-a="rew"]').forEach((b) => b.addEventListener('click', (e) => openReasonPopup(container, Number(e.currentTarget.dataset.idx), 'rework')));
  container.querySelectorAll('[data-a="down"]').forEach((b) => b.addEventListener('click', (e) => openDownTimePopup(container, Number(e.currentTarget.dataset.idx))));
  container.querySelectorAll('[data-a="del"]').forEach((b) => b.addEventListener('click', (e) => deleteRow(container, Number(e.currentTarget.dataset.idx))));

  const btnBottom = container.querySelector('#btnBottom');
  if (btnBottom) btnBottom.addEventListener('click', () => {
    if (btn.navOnly) {
      const gid = PrState.getGroupId() || String(state.id);
      PrState.setStatusId(state.statusId);
      PrState.setConsumptionStatus(state.statusIdforConsumption || '');
      window.location.hash = `#/production-reporting/consumption/${encodeURIComponent(gid)}`;
    } else {
      doSave(container);
    }
  });
}

function wireAddForm(container, headerLocked) {
  const facilityCombo = createCombobox({
    options: state.facilityList.map((f) => ({ id: f.facilityId, label: f.facilityName })),
    value: state.facilityId, placeholder: '--Select--', disabled: headerLocked,
    onChange: async (id) => {
      state.facilityId = id || '';
      state.facilityDesc = (state.facilityList.find((f) => String(f.facilityId) === String(id)) || {}).facilityName || '';
      await fetchWorkCenter();
      render(container);
    },
  });
  container.querySelector('[data-slot="facility"]').appendChild(facilityCombo.el);

  const wcCombo = createCombobox({
    options: state.workCenterList.map((w) => ({ id: w.workCenterId, label: w.workCenterDescription })),
    value: state.workCenterId, placeholder: '--Select--', disabled: headerLocked,
    onChange: async (id) => {
      state.workCenterId = id || '';
      state.workCenterDesc = (state.workCenterList.find((w) => String(w.workCenterId) === String(id)) || {}).workCenterDescription || '';
      await Promise.all([fetchMachine(), fetchOperator()]);
      render(container);
    },
  });
  container.querySelector('[data-slot="workCenter"]').appendChild(wcCombo.el);

  const shiftCombo = createCombobox({
    options: state.shiftList.map((s) => ({ id: s.shiftId, label: s.description })),
    value: state.shiftId, placeholder: '--Select--', disabled: headerLocked,
    onChange: (id) => {
      state.shiftId = id || '';
      state.shiftDesc = (state.shiftList.find((s) => String(s.shiftId) === String(id)) || {}).description || '';
      computeShiftTimes();
    },
  });
  container.querySelector('[data-slot="shift"]').appendChild(shiftCombo.el);

  const machineCombo = createCombobox({
    options: state.machineList.map((m) => ({ id: m.workEffortId, label: m.description })),
    value: state.machineNumberId, placeholder: '--Select--',
    onChange: async (id) => { state.machineNumberId = id || ''; await fetchProducts(); render(container); },
  });
  container.querySelector('[data-slot="machine"]').appendChild(machineCombo.el);

  const productCombo = createCombobox({
    options: state.productList.map((p) => ({ id: p.productId, label: `${p.productName} [${p.productId}]` })),
    value: state.productId, placeholder: '--Select--',
    onChange: async (id) => {
      const p = state.productList.find((x) => String(x.productId) === String(id));
      if (p) applyProduct(p); else { state.productId = ''; }
      await fetchTools();
      render(container);
    },
  });
  container.querySelector('[data-slot="product"]').appendChild(productCombo.el);

  const operatorCombo = createCombobox({
    options: state.workerList.map((w) => ({ id: w.partyId, label: w.partyName })),
    value: state.operatorId, placeholder: '--Select--',
    onChange: (id) => { state.operatorId = id || ''; },
  });
  container.querySelector('[data-slot="operator"]').appendChild(operatorCombo.el);

  const inspectedCombo = createCombobox({
    options: state.qaList.map((q) => ({ id: q.partyId, label: q.partyName })),
    value: state.inspectedId, placeholder: '--Select--', allowClear: true,
    onChange: (id) => { state.inspectedId = id || ''; },
  });
  container.querySelector('[data-slot="inspected"]').appendChild(inspectedCombo.el);

  container.querySelector('#acceptedQty').addEventListener('input', (e) => { state.acceptedQty = e.target.value; });
  container.querySelector('#planQty').addEventListener('input', (e) => { state.planQty = e.target.value; });
  container.querySelector('#batchNo').addEventListener('input', (e) => { state.internalBatchNo = e.target.value; });

  // Tools multi-select panel
  const toolBtn = container.querySelector('#toolBtn');
  const toolInput = container.querySelector('#toolInput');
  const openToolPanel = () => {
    const panel = container.querySelector('#toolPanel');
    if (panel.firstChild) { panel.innerHTML = ''; return; }
    panel.innerHTML = `<div class="cx-combo-panel"><div class="cx-combo-list" style="padding:6px">
      ${state.toolList.length ? state.toolList.map((t) => `<label class="cx-checkbox" style="display:flex;padding:4px 6px">
        <input type="checkbox" data-tool="${escapeHtml(t.toolId)}" ${state.selectedTools.includes(t.toolId) ? 'checked' : ''} />${escapeHtml(t.toolId)}</label>`).join('')
      : '<div class="cx-combo-empty">No tools</div>'}
    </div></div>`;
    panel.querySelectorAll('[data-tool]').forEach((cb) => cb.addEventListener('change', (e) => {
      const id = e.target.dataset.tool;
      if (e.target.checked) { if (!state.selectedTools.includes(id)) state.selectedTools.push(id); }
      else state.selectedTools = state.selectedTools.filter((x) => x !== id);
      toolInput.value = state.selectedTools.length ? `${state.selectedTools.length} selected` : '';
    }));
  };
  toolBtn.addEventListener('click', openToolPanel);
  toolInput.addEventListener('click', openToolPanel);

  container.querySelector('#btnAddRow').addEventListener('click', () => validateAndAdd(container));
}

export default {
  title: 'Production Reporting',
  async mount(container, params) {
    state = freshState(params && params.id);
    render(container);
    if (state.id != null) {
      try { await loadEdit(); } catch (e) { toast(e.details || e.message || 'Failed to load', 'error'); }
      try { await fetchShift(); } catch (e) {}
      render(container);
    } else {
      render(container);
      try { await fetchFacility(); } catch (e) {}
      try { await fetchShift(); } catch (e) {}
      render(container);
    }
  },
};
