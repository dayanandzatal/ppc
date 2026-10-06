// SO Planning — search sales orders/forecasts/shipment plans across an organization,
// bulk-select rows, "Get Details" to pull products, then bulk "Schedule" them.
// See scratchpad spec: so_planning.md
import { callApi, ENDPOINTS, TXN } from '../api.js';
import { icon } from '../icons.js';
import {
  el, escapeHtml, mountBanner, toast, openModal, loadingState, emptyState, createCombobox,
  renderTableToolbar, filterRows, sortableTh, wireSortableHeaders, applySort,
  exportToCsv, exportToExcel,
} from '../ui.js';
import { todayIso } from '../dateUtils.js';

const PAGE_SIZE = 20;

const COLUMNS = [
  { key: 'transactionType', label: 'Transaction Type' },
  { key: 'orderId', label: 'Transaction No' },
  { key: 'facilityName', label: 'Facility' },
  { key: 'orderDateUi', label: 'Trans. Date' },
  { key: 'customerName', label: 'Customer' },
  { key: 'customerPoNo', label: 'Customer PO No' },
  { key: 'customerPoDateUi', label: 'Customer PO Date' },
  { key: 'priority', label: 'Priority' },
];

function initialState() {
  return {
    orgList: [], facilityList: [],
    searchOrganizationId: '', searchFacilityId: '',
    orderId: '', customerName: '', priority: '',
    fromDate: '', toDate: '',
    considerSalesOrder: true, considerSalesForecast: true, considerShipmentPlan: true,
    orderList: [], selected: new Set(),
    viewIndex: 0, hasMore: true, hasSearched: false,
    loading: false, loadingMore: false,
    search: '', sort: { key: '', dir: 'asc' },
  };
}

let state = initialState();

/* ---------------- helpers ---------------- */

function firstListKey(data, keys) {
  for (const k of keys) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

function firstNonEmpty(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return '';
}

function toDisplayDate(raw) {
  if (!raw) return '';
  const s = String(raw);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  return s;
}

function toIntTolerant(v, def = 0) {
  if (v === null || v === undefined || v === '') return def;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

/* ---------------- data fetch ---------------- */

async function fetchOrganizations() {
  const data = await callApi(ENDPOINTS.init, TXN.getOrganization, {}, {});
  const list = firstListKey(data, ['organizationList', 'organisationList', 'orgList', 'organizationPartyList']);
  state.orgList = list.map((o) => ({
    id: firstNonEmpty(o, ['organizationId', 'orgId', 'partyId', 'organizationPartyId']),
    name: firstNonEmpty(o, ['organizationName', 'organizationDesc', 'orgName', 'partyName', 'groupName', 'groupNameLocal']),
  }));
  if (state.orgList.length === 1) state.searchOrganizationId = state.orgList[0].id;
}

async function fetchFacilities() {
  const data = await callApi(ENDPOINTS.init, TXN.getFacility, {}, {});
  state.facilityList = data.facilityList || [];
  if (state.facilityList.length === 1) state.searchFacilityId = state.facilityList[0].facilityId;
}

function mapOrderRow(item) {
  return {
    orderId: item.orderId != null ? String(item.orderId) : '',
    customerName: item.customerName != null ? String(item.customerName) : '',
    facilityName: item.facilityName != null ? String(item.facilityName) : '',
    customerPoNo: item.customerPoNo != null ? String(item.customerPoNo) : '',
    priority: item.priority != null && item.priority !== '' ? String(item.priority) : '0',
    transactionType: item.transactionType != null ? String(item.transactionType) : '',
    orderDateUi: toDisplayDate(item.orderDate),
    customerPoDateUi: toDisplayDate(item.customerPoDate),
    shipBeforeDateUi: toDisplayDate(item.shipBeforeDate),
  };
}

function mapProductRow(item) {
  return {
    quantity: toIntTolerant(item.quantity, 0),
    partDescription: item.partDescription != null ? String(item.partDescription) : '',
    partCode: item.partCode != null ? String(item.partCode) : '',
  };
}

async function search(container, { loadMore = false } = {}) {
  if (loadMore) {
    state.loadingMore = true;
  } else {
    state.loading = true; state.viewIndex = 0; state.orderList = []; state.selected.clear(); state.hasMore = true; state.hasSearched = true;
  }
  render(container);
  try {
    const cosideredTransactions = [];
    if (state.considerSalesOrder) cosideredTransactions.push('SALES_ORDER');
    if (state.considerSalesForecast) cosideredTransactions.push('SALES_FORECAST');
    if (state.considerShipmentPlan) cosideredTransactions.push('SHIPMENT_PLAN');

    const data = await callApi(ENDPOINTS.init, TXN.getOrderListPartSchedule, {
      organizationPartyId: state.searchOrganizationId || '',
      orderId: state.orderId.trim(),
      customerName: state.customerName.trim(),
      fromDate: state.fromDate || '',
      thruDate: state.toDate || '',
      priority: state.priority.trim(),
      facilityId: state.searchFacilityId || '',
      cosideredTransactions,
      viewIndex: String(state.viewIndex),
    }, {});

    const rows = firstListKey(data, ['orderList', 'soOrderList', 'salesOrderList', 'partScheduleOrderList']).map(mapOrderRow);
    state.orderList = loadMore ? state.orderList.concat(rows) : rows;
    state.hasMore = rows.length === PAGE_SIZE;
    state.viewIndex += 1;
  } catch (e) {
    mountBanner(document.getElementById('soBanner'), { type: 'error', message: e.details || e.message || 'Failed to load orders.', autoHideMs: 5000 });
  } finally {
    state.loading = false; state.loadingMore = false;
    render(container);
  }
}

async function getDetails(container) {
  if (!state.selected.size) return;
  const orderIdList = Array.from(state.selected);
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getOrderProductListPartSchedule, { orderIdList }, {});
    const list = firstListKey(data, ['orderProductList', 'productList', 'soOrderProductList', 'salesOrderProductList']).map(mapProductRow);
    if (!list.length) {
      toast('No Data Found!', 'error');
      return;
    }
    openScheduleDialog(container, list);
  } catch (e) {
    toast(e.details || e.message || 'Failed to load order products.', 'error');
  }
}

/* ---------------- Schedule Products dialog ---------------- */

function computePlanQtyValue(schQty, rejectionPercentStr) {
  const rej = parseFloat(rejectionPercentStr);
  const rejVal = Number.isFinite(rej) ? rej : 0;
  let planQty = schQty + (schQty * rejVal) / 100;
  if (planQty < 0) planQty = 0;
  return planQty;
}

function formatPlanQty(v) {
  const rounded = Math.round(v * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function openScheduleDialog(listContainer, products) {
  const planDateDisplay = toDisplayDate(todayIso());
  const rows = products.map((p) => ({
    partCode: p.partCode,
    partDescription: p.partDescription,
    planDateDisplay,
    schQty: p.quantity,
    rejectionPercent: '0',
    priority: 0,
    checked: false,
  }));

  const modal = openModal({ title: 'Schedule Products', width: 1100, bodyHtml: '' });

  const footer = el(`
    <div class="cx-modal-footer">
      <button type="button" class="cx-btn cx-btn-secondary" data-a="cancel">Cancel</button>
      <button type="button" class="cx-btn cx-btn-primary is-disabled" data-a="schedule">Schedule</button>
    </div>
  `);
  modal.overlay.querySelector('.cx-modal').appendChild(footer);
  const scheduleBtn = footer.querySelector('[data-a="schedule"]');
  let submitting = false;

  function updateScheduleBtn() {
    const anyChecked = rows.some((r) => r.checked);
    scheduleBtn.classList.toggle('is-disabled', !anyChecked || submitting);
  }

  function dialogRow(r, idx) {
    const zebra = idx % 2 === 1 ? 'style="background:var(--cx-gray-50)"' : '';
    const planQty = formatPlanQty(computePlanQtyValue(r.schQty, r.rejectionPercent));
    return `
      <tr ${zebra} data-idx="${idx}">
        <td class="cx-cell-center"><input type="checkbox" data-a="dlgRowCheck" data-idx="${idx}" ${r.checked ? 'checked' : ''} /></td>
        <td>${escapeHtml(r.partCode)}</td>
        <td>${escapeHtml(r.partDescription)}</td>
        <td class="cx-cell-nowrap">${escapeHtml(r.planDateDisplay)}</td>
        <td class="cx-cell-center">${r.schQty}</td>
        <td class="cx-cell-center"><input type="text" class="cx-input" style="width:84px;text-align:center;margin:0 auto" data-a="dlgRejection" data-idx="${idx}" value="${escapeHtml(r.rejectionPercent)}" inputmode="decimal" /></td>
        <td class="cx-cell-center" data-el="planQty-${idx}">${planQty}</td>
        <td class="cx-cell-center">${r.priority}</td>
      </tr>`;
  }

  function renderDialogBody() {
    const allChecked = rows.length > 0 && rows.every((r) => r.checked);
    modal.body.innerHTML = `
      <div class="cx-table-wrap">
        <div class="cx-table-scroll" style="max-height:400px;overflow-y:auto">
          <table class="cx-table"><thead><tr>
            <th class="cx-cell-center"><input type="checkbox" id="dlgSelectAll" ${allChecked ? 'checked' : ''} /></th>
            <th>Part Code</th><th>Part Description</th><th>Plan Date</th>
            <th class="cx-cell-center">Sch Qty</th><th class="cx-cell-center">Rejection %</th>
            <th class="cx-cell-center">Plan Qty</th><th class="cx-cell-center">Priority</th>
          </tr></thead><tbody>${rows.map(dialogRow).join('')}</tbody></table>
        </div>
      </div>
      <div data-el="dlgErrorSlot"></div>
    `;

    modal.body.querySelectorAll('[data-a="dlgRowCheck"]').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        rows[idx].checked = e.target.checked;
        renderDialogBody();
        updateScheduleBtn();
      });
    });

    const selAll = modal.body.querySelector('#dlgSelectAll');
    if (selAll) {
      selAll.addEventListener('change', (e) => {
        rows.forEach((r) => { r.checked = e.target.checked; });
        renderDialogBody();
        updateScheduleBtn();
      });
    }

    modal.body.querySelectorAll('[data-a="dlgRejection"]').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.idx);
        const val = e.target.value;
        if (/^\d*\.?\d{0,2}$/.test(val)) {
          rows[idx].rejectionPercent = val;
          const planQtyCell = modal.body.querySelector(`[data-el="planQty-${idx}"]`);
          if (planQtyCell) planQtyCell.textContent = formatPlanQty(computePlanQtyValue(rows[idx].schQty, val));
        } else {
          e.target.value = rows[idx].rejectionPercent;
        }
      });
    });
  }

  function showDialogError(message) {
    const slot = modal.body.querySelector('[data-el="dlgErrorSlot"]');
    if (slot) mountBanner(slot, { type: 'error', message, autoHideMs: 5000 });
  }

  renderDialogBody();
  updateScheduleBtn();

  footer.querySelector('[data-a="cancel"]').addEventListener('click', () => modal.close());
  scheduleBtn.addEventListener('click', async () => {
    if (submitting) return;
    const checkedRows = rows.filter((r) => r.checked);
    if (!checkedRows.length) {
      showDialogError('Please select at least one product');
      return;
    }
    const scheduleList = checkedRows.map((r) => ({
      quantity: Math.round(computePlanQtyValue(r.schQty, r.rejectionPercent)),
      partCode: r.partCode,
    }));
    submitting = true;
    updateScheduleBtn();
    try {
      const data = await callApi(ENDPOINTS.init, TXN.createPartSchedule, { scheduleList }, {});
      const message = data.successMessage || data.responseMessage || 'Schedule created successfully';
      if (String(message).toLowerCase().includes('success')) {
        modal.close();
        mountBanner(document.getElementById('soBanner'), { type: 'success', message, autoHideMs: 5000 });
        search(listContainer);
        return;
      }
      showDialogError(message);
    } catch (e) {
      showDialogError(e.details || e.message || 'Failed to create schedule.');
    } finally {
      submitting = false;
      updateScheduleBtn();
    }
  });
}

/* ---------------- results table ---------------- */

function orderRow(r, idx) {
  const zebra = idx % 2 === 1 ? 'style="background:var(--cx-gray-50)"' : '';
  return `
    <tr ${zebra} data-idx="${idx}">
      <td class="cx-cell-center"><input type="checkbox" data-a="rowcheck" data-id="${escapeHtml(r.orderId)}" ${state.selected.has(r.orderId) ? 'checked' : ''} /></td>
      <td class="cx-cell-center">${idx + 1}</td>
      <td>${escapeHtml(r.transactionType)}</td>
      <td>${escapeHtml(r.orderId)}</td>
      <td>${escapeHtml(r.facilityName)}</td>
      <td class="cx-cell-nowrap">${escapeHtml(r.orderDateUi)}</td>
      <td>${escapeHtml(r.customerName)}</td>
      <td>${escapeHtml(r.customerPoNo)}</td>
      <td class="cx-cell-nowrap">${escapeHtml(r.customerPoDateUi)}</td>
      <td class="cx-cell-center">${escapeHtml(r.priority)}</td>
    </tr>`;
}

/* ---------------- render ---------------- */

// Row selection lives in state.selected (a Set of orderId), not by array index,
// so filtering/sorting the displayed rows is safe here — checkbox state always
// tracks the real orderId regardless of which position/order a row is drawn in.
function visibleRows() {
  const filtered = filterRows(state.orderList, state.search, ['orderId', 'customerName', 'facilityName', 'transactionType']);
  return applySort(filtered, state.sort);
}

function render(container) {
  const rows = visibleRows();
  const allSelected = rows.length > 0 && rows.every((r) => state.selected.has(r.orderId));
  const considerAll = state.considerSalesOrder && state.considerSalesForecast && state.considerShipmentPlan;
  const today = todayIso();

  container.innerHTML = `
    <div class="cx-page-header"><h1><span class="cx-page-icon">${icon('assignment', { size: 18 })}</span>SO Planning</h1></div>
    <div id="soBanner"></div>
    <div class="cx-card">
      <div class="cx-grid cx-grid-4">
        <div class="cx-field"><label>Organization<span class="req">*</span></label><div data-slot="organization"></div></div>
        <div class="cx-field"><label>Facility</label><div data-slot="facility"></div></div>
        <div class="cx-field"><label>Transaction No</label><input class="cx-input" id="fldOrderId" value="${escapeHtml(state.orderId)}" /></div>
        <div class="cx-field"><label>Customer Name</label><input class="cx-input" id="fldCustomerName" value="${escapeHtml(state.customerName)}" /></div>
        <div class="cx-field"><label>Priority</label><input class="cx-input" id="fldPriority" value="${escapeHtml(state.priority)}" /></div>
        <div class="cx-field"><label>From Date</label><input class="cx-input" type="date" id="fldFromDate" min="2000-01-01" max="${today}" value="${escapeHtml(state.fromDate)}" /></div>
        <div class="cx-field"><label>To Date</label><input class="cx-input" type="date" id="fldToDate" min="2000-01-01" max="${today}" value="${escapeHtml(state.toDate)}" /></div>
      </div>
      <div class="cx-field cx-mt-16">
        <label>Consider Transactions</label>
        <div class="cx-flex cx-gap-14" style="flex-wrap:wrap;margin-top:4px">
          <label class="cx-checkbox"><input type="checkbox" id="considerAll" ${considerAll ? 'checked' : ''} /> All</label>
          <label class="cx-checkbox"><input type="checkbox" id="considerSO" ${state.considerSalesOrder ? 'checked' : ''} /> Sales Order</label>
          <label class="cx-checkbox"><input type="checkbox" id="considerSF" ${state.considerSalesForecast ? 'checked' : ''} /> Sales Forecast</label>
          <label class="cx-checkbox"><input type="checkbox" id="considerSP" ${state.considerShipmentPlan ? 'checked' : ''} /> Shipment Plan</label>
        </div>
      </div>
      <div class="cx-flex-center cx-mt-16"><button type="button" class="cx-btn cx-btn-primary" id="btnSearch">${icon('search', { size: 15 })}Search</button></div>
    </div>

    ${state.hasSearched ? `
      ${!state.loading ? `<div id="soToolbar"></div>` : ''}
      <div class="cx-table-wrap">
        <div class="cx-table-scroll" id="soTableScroll" style="max-height:520px;overflow-y:auto">
          ${state.loading ? loadingState() : (!rows.length ? emptyState(state.search ? 'No results match your search.' : 'No Data Found!') : `
            <table class="cx-table"><thead><tr>
              <th class="cx-cell-center"><input type="checkbox" id="soSelectAll" ${allSelected ? 'checked' : ''} /></th>
              <th>SL.No.</th>
              ${sortableTh('Transaction Type', 'transactionType', state.sort, () => render(container))}
              ${sortableTh('Transaction No', 'orderId', state.sort, () => render(container))}
              ${sortableTh('Facility', 'facilityName', state.sort, () => render(container))}
              ${sortableTh('Trans. Date', 'orderDateUi', state.sort, () => render(container), 'cx-cell-nowrap')}
              ${sortableTh('Customer', 'customerName', state.sort, () => render(container))}
              ${sortableTh('Customer PO No', 'customerPoNo', state.sort, () => render(container))}
              ${sortableTh('Customer PO Date', 'customerPoDateUi', state.sort, () => render(container), 'cx-cell-nowrap')}
              ${sortableTh('Priority', 'priority', state.sort, () => render(container), 'cx-cell-center')}
            </tr></thead><tbody>${rows.map(orderRow).join('')}</tbody></table>`)}
        </div>
      </div>
      <div class="cx-flex-center cx-mt-16">
        <button type="button" class="cx-btn cx-btn-primary ${state.selected.size ? '' : 'is-disabled'}" id="btnGetDetails">Get Details</button>
      </div>
      ${state.loadingMore ? `<div class="cx-flex-center cx-mt-12"><div class="cx-spinner cx-spinner-sm"></div></div>` : ''}
    ` : ''}
  `;

  const orgCombo = createCombobox({
    options: state.orgList.map((o) => ({ id: o.id, label: o.name })),
    value: state.searchOrganizationId, placeholder: '--Select--',
    onChange: (id) => { state.searchOrganizationId = id || ''; },
  });
  container.querySelector('[data-slot="organization"]').appendChild(orgCombo.el);

  const facilityCombo = createCombobox({
    options: state.facilityList.map((f) => ({ id: f.facilityId, label: f.facilityName })),
    value: state.searchFacilityId, placeholder: '--Select--',
    onChange: (id) => { state.searchFacilityId = id || ''; },
  });
  container.querySelector('[data-slot="facility"]').appendChild(facilityCombo.el);

  document.getElementById('fldOrderId').addEventListener('input', (e) => { state.orderId = e.target.value; });
  document.getElementById('fldCustomerName').addEventListener('input', (e) => { state.customerName = e.target.value; });
  document.getElementById('fldPriority').addEventListener('input', (e) => { state.priority = e.target.value; });
  document.getElementById('fldFromDate').addEventListener('change', (e) => { state.fromDate = e.target.value; });
  document.getElementById('fldToDate').addEventListener('change', (e) => { state.toDate = e.target.value; });

  // "All" is a derived (AND of the other three) indicator, not an independent gate:
  // clicking it never cascades down to the individual boxes — it just snaps back
  // to whatever the three individual boxes currently compute to.
  document.getElementById('considerAll').addEventListener('change', () => { render(container); });
  document.getElementById('considerSO').addEventListener('change', (e) => { state.considerSalesOrder = e.target.checked; render(container); });
  document.getElementById('considerSF').addEventListener('change', (e) => { state.considerSalesForecast = e.target.checked; render(container); });
  document.getElementById('considerSP').addEventListener('change', (e) => { state.considerShipmentPlan = e.target.checked; render(container); });

  document.getElementById('btnSearch').addEventListener('click', () => {
    if (!state.searchOrganizationId) {
      mountBanner(document.getElementById('soBanner'), { type: 'error', message: 'Please select an organization.', autoHideMs: 5000 });
      return;
    }
    if (state.fromDate && state.toDate && state.fromDate > state.toDate) {
      mountBanner(document.getElementById('soBanner'), { type: 'error', message: 'The From Date cannot be greater than To Date.', autoHideMs: 5000 });
      return;
    }
    search(container);
  });

  if (state.hasSearched && !state.loading) {
    const toolbar = renderTableToolbar({
      placeholder: 'Search order/transaction no, customer, facility, type...',
      countLabel: `${rows.length} of ${state.orderList.length} loaded`,
      onSearch: (q) => { state.search = q; render(container); },
      onExportCsv: () => exportToCsv('so-planning', COLUMNS, rows),
      onExportExcel: () => exportToExcel('so-planning', COLUMNS, rows),
    });
    document.getElementById('soToolbar').appendChild(toolbar);
    wireSortableHeaders(container, state.sort, () => render(container));
  }

  if (state.hasSearched) {
    container.querySelectorAll('[data-a="rowcheck"]').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) state.selected.add(id); else state.selected.delete(id);
        render(container);
      });
    });
    const selAll = document.getElementById('soSelectAll');
    if (selAll) {
      selAll.addEventListener('change', (e) => {
        // Scoped to the currently visible (filtered) rows, not the whole loaded list.
        if (e.target.checked) rows.forEach((r) => state.selected.add(r.orderId));
        else rows.forEach((r) => state.selected.delete(r.orderId));
        render(container);
      });
    }
    const btnGetDetails = document.getElementById('btnGetDetails');
    if (btnGetDetails) btnGetDetails.addEventListener('click', () => getDetails(container));

    const scrollEl = document.getElementById('soTableScroll');
    if (scrollEl) {
      scrollEl.addEventListener('scroll', () => {
        if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 140) {
          if (!state.loading && !state.loadingMore && state.hasMore) search(container, { loadMore: true });
        }
      });
    }
  }
}

export default {
  title: 'SO Planning',
  async mount(container) {
    state = initialState();
    render(container);
    await Promise.allSettled([fetchOrganizations(), fetchFacilities()]);
    render(container);
  },
};
