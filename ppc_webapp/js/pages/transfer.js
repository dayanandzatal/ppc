// Transfer — search From Facility/Location (+ optional Product) for transferable
// lots, select rows + edit Qty, then submit to a To Facility/Location.
// See scratchpad spec: transfer.md
import { callApi, ENDPOINTS, TXN } from '../api.js';
import { icon } from '../icons.js';
import {
  escapeHtml, mountBanner, toast, loadingState, emptyState,
  createCombobox, renderPaginationBar,
  renderTableToolbar, exportToCsv, exportToExcel,
} from '../ui.js';
import { openProductSearchPopup } from '../productPicker.js';
import { PAGE_SIZES } from '../config.js';

// Read-only export columns. Qty is added per-row at export time from qtyByRow
// (see visibleTransferRows/exportRows) since it's live editable state, not on the row object.
const COLUMNS = [
  { key: 'productId', label: 'Product ID' },
  { key: 'productName', label: 'Product Name' },
  { key: 'lotNo', label: 'Lot No' },
  { key: 'qoh', label: 'QOH' },
  { key: 'qty', label: 'Qty' },
];

let state = {
  fromFacilityList: [], toFacilityList: [],
  fromFacilityId: '', toFacilityId: '',
  fromLocationList: [], toLocationList: [],
  fromLocation: '', toLocation: '',
  selectedProductId: '', selectedProductLabel: '',
  transferList: [], totalCount: 0,
  qtyByRow: {}, selectedByRow: {},
  page: 0, pageSize: 10,
  hasSearched: false,
  loading: false,
  search: '',
};

function resetState() {
  state = {
    fromFacilityList: [], toFacilityList: [],
    fromFacilityId: '', toFacilityId: '',
    fromLocationList: [], toLocationList: [],
    fromLocation: '', toLocation: '',
    selectedProductId: '', selectedProductLabel: '',
    transferList: [], totalCount: 0,
    qtyByRow: {}, selectedByRow: {},
    page: 0, pageSize: 10,
    hasSearched: false,
    loading: false,
    search: '',
  };
}

// Search filter that PRESERVES each row's true index into state.transferList.
// qtyByRow/selectedByRow and every event handler below are keyed by that true
// index (not by position within a filtered list), so we must never renumber —
// only filter — or the editable Qty inputs / row checkboxes / QOH validation
// would end up reading and writing the wrong row's state.
function visibleTransferRows() {
  const withIdx = state.transferList.map((r, idx) => ({ r, idx }));
  const q = (state.search || '').trim().toLowerCase();
  if (!q) return withIdx;
  return withIdx.filter(({ r }) => ['productId', 'productName', 'lotNo']
    .some((f) => String(r[f] ?? '').toLowerCase().includes(q)));
}

function banner(opts) {
  mountBanner(document.getElementById('trBanner'), opts);
}

async function fetchInit() {
  const data = await callApi(ENDPOINTS.init, TXN.transferInit, {}, {});
  state.fromFacilityList = data.fromFacilityList || [];
  state.toFacilityList = data.toFacilityList || [];
}

async function fetchFromLocation(container) {
  state.fromLocation = '';
  state.fromLocationList = [];
  if (!state.fromFacilityId) { render(container); return; }
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getFacilityLocation, { facilityId: state.fromFacilityId }, {});
    state.fromLocationList = data.facilityLocationList || [];
  } catch (e) {
    toast(e.details || e.message || 'Failed to load locations', 'error');
  }
  render(container);
}

async function fetchToLocation(container) {
  state.toLocation = '';
  state.toLocationList = [];
  if (!state.toFacilityId) { render(container); return; }
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getFacilityLocation, { facilityId: state.toFacilityId }, {});
    state.toLocationList = data.facilityLocationList || [];
  } catch (e) {
    toast(e.details || e.message || 'Failed to load locations', 'error');
  }
  render(container);
}

function parseProductIdFromField() {
  // Field text format is "{internalName}  -  {productId}" (2 spaces, dash, 2 spaces).
  if (!state.selectedProductLabel) return '';
  const parts = state.selectedProductLabel.split(' -  ');
  return parts.length > 1 ? parts[1] : '';
}

async function getDetails(container) {
  if (state.fromLocationList.length) {
    if (!state.fromFacilityId || !state.fromLocation) {
      banner({ type: 'error', message: 'Please Select the Mandatory Fields.', autoHideMs: 10000 });
      return;
    }
  } else if (!state.fromFacilityId) {
    banner({ type: 'error', message: 'Please Select the Mandatory Fields.', autoHideMs: 10000 });
    return;
  }

  const productId = parseProductIdFromField();
  state.loading = true;
  state.hasSearched = true;
  render(container);
  try {
    const data = await callApi(ENDPOINTS.init, TXN.transferGetDetails, {
      facilityId: state.fromFacilityId,
      fromLocation: state.fromLocation || '',
      productId: productId || '',
      viewIndex: String(state.page),
      viewSize: String(state.pageSize),
    }, {});
    state.transferList = data.transferProductList || [];
    state.totalCount = data.transferProductListSize || 0;
    state.qtyByRow = {};
    state.selectedByRow = {};
  } catch (e) {
    state.transferList = [];
    state.totalCount = 0;
    banner({ type: 'error', message: e.details || e.message || 'Failed to load transfer details.', autoHideMs: 10000 });
  } finally {
    state.loading = false;
    render(container);
  }
}

function refetchPage(container) {
  // Used by pagination controls — re-runs Get Details for the current page/size.
  getDetails(container);
}

async function submitTransfer(container) {
  const selectedIdx = state.transferList
    .map((_, i) => i)
    .filter((i) => state.selectedByRow[i]);

  if (!selectedIdx.length) {
    banner({ type: 'error', message: 'Please add atleast one declaration to Submit.', autoHideMs: 10000 });
    return;
  }
  for (const i of selectedIdx) {
    const qty = state.qtyByRow[i];
    if (qty === undefined || qty === null || String(qty).trim() === '') {
      banner({ type: 'error', message: "Qty can't be Empty", autoHideMs: 10000 });
      return;
    }
  }

  const items = selectedIdx.map((i) => {
    const r = state.transferList[i];
    return {
      productId: r.productId,
      quantity: state.qtyByRow[i],
      qoh: r.qoh,
      fromFacility: state.fromFacilityId,
      fromLocation: state.fromLocation || '',
      lotNo: r.lotNo,
    };
  });

  const payload = {
    transferList: [{
      transferHeader: {
        facilityId: state.toFacilityId,
        moveToLocation: state.toLocation || '',
      },
      tranferItemList: items,
    }],
  };

  try {
    await callApi(ENDPOINTS.init, TXN.transferSubmit, payload, {});
    // Partial reset: From-side state only. To-side facility/location is preserved.
    state.transferList = [];
    state.totalCount = 0;
    state.qtyByRow = {};
    state.selectedByRow = {};
    state.fromLocation = '';
    state.fromLocationList = [];
    state.fromFacilityId = '';
    state.selectedProductId = '';
    state.selectedProductLabel = '';
    state.page = 0;
    state.hasSearched = false;
    render(container);
    banner({ type: 'success', message: 'Sucessfully Submitted', autoHideMs: 10000 });
  } catch (e) {
    banner({ type: 'error', message: e.details || e.message || 'Submit failed.', autoHideMs: 10000 });
  }
}

function doSubmitClick(container) {
  if (!state.toFacilityId) {
    banner({ type: 'error', message: 'Please Select the Mandatory Fields.', autoHideMs: 10000 });
    return;
  }
  if (state.toLocationList.length && !state.toLocation) {
    banner({ type: 'error', message: 'Please Select the Mandatory Fields.', autoHideMs: 10000 });
    return;
  }
  submitTransfer(container);
}

function tableRow(r, idx) {
  const checked = !!state.selectedByRow[idx];
  const qty = state.qtyByRow[idx] !== undefined ? state.qtyByRow[idx] : '';
  return `
    <tr data-idx="${idx}">
      <td class="cx-cell-center">${state.page * state.pageSize + idx + 1}</td>
      <td>${escapeHtml(r.productId || '')}</td>
      <td>${escapeHtml(r.productName || '')}</td>
      <td>${escapeHtml(r.lotNo || '')}</td>
      <td class="cx-cell-right">${r.qoh ?? ''}</td>
      <td><input type="text" inputmode="decimal" maxlength="7" class="cx-input" data-a="qty" data-idx="${idx}" value="${escapeHtml(qty)}" /></td>
      <td class="cx-cell-center"><input type="checkbox" data-a="rowcheck" data-idx="${idx}" ${checked ? 'checked' : ''} /></td>
    </tr>`;
}

function render(container) {
  const allSelected = state.transferList.length > 0
    && state.transferList.every((_, i) => state.selectedByRow[i]);
  const visible = visibleTransferRows();

  container.innerHTML = `
    <div class="cx-page-header"><h1><span class="cx-page-icon">${icon('transfer', { size: 18 })}</span>Transfer</h1></div>
    <div id="trBanner"></div>

    <div class="cx-card">
      <div class="cx-grid cx-grid-4">
        <div class="cx-field"><label>From Facility<span class="req">*</span></label><div data-slot="fromFacility"></div></div>
        <div class="cx-field"><label>From Location<span class="req">*</span></label><div data-slot="fromLocation"></div></div>
        <div class="cx-field"><label>Product Name/ID</label>
          <div class="cx-input-suffix-wrap">
            <input class="cx-input" id="productField" readonly placeholder="Select product" value="${escapeHtml(state.selectedProductLabel)}" />
            <button type="button" class="cx-input-suffix-btn" id="productSuffixBtn">${icon(state.selectedProductLabel ? 'x' : 'search', { size: 15 })}</button>
          </div>
        </div>
      </div>
      <div class="cx-flex-center cx-mt-16"><button type="button" class="cx-btn cx-btn-primary" id="btnGetDetails">${icon('search', { size: 15 })}Get Details</button></div>
    </div>

    ${state.hasSearched ? `
      ${!state.loading ? `<div id="trToolbar" class="cx-mt-16"></div>` : ''}
      <div class="cx-table-wrap ${state.loading ? 'cx-mt-16' : ''}">
        <div class="cx-table-scroll">
          ${state.loading ? loadingState() : (!visible.length ? emptyState(state.search ? 'No results match your search.' : 'No Result Found !') : `
            <table class="cx-table"><thead><tr>
              <th>S No.</th><th>Product ID</th><th>Product Name</th><th>Lot No.</th><th class="cx-cell-right">QOH</th><th>Qty</th>
              <th class="cx-cell-center"><input type="checkbox" id="selectAll" ${allSelected ? 'checked' : ''} /></th>
            </tr></thead><tbody>${visible.map(({ r, idx }) => tableRow(r, idx)).join('')}</tbody></table>`)}
        </div>
      </div>
      ${state.transferList.length ? `<div id="trPagination"></div>` : ''}
    ` : ''}

    <div class="cx-card cx-mt-16">
      <div class="cx-grid cx-grid-4">
        <div class="cx-field"><label>To Facility<span class="req">*</span></label><div data-slot="toFacility"></div></div>
        <div class="cx-field"><label>To Location<span class="req">*</span></label><div data-slot="toLocation"></div></div>
        <div class="cx-field" style="align-self:end"><button type="button" class="cx-btn cx-btn-primary cx-w-full" id="btnSubmit">Submit</button></div>
      </div>
    </div>
  `;

  const fromFacilityCombo = createCombobox({
    options: state.fromFacilityList.map((f) => ({ id: f.facilityId, label: f.facilityName })),
    value: state.fromFacilityId, placeholder: '--Select--',
    onChange: (id) => {
      state.fromFacilityId = id || '';
      fetchFromLocation(container);
    },
  });
  container.querySelector('[data-slot="fromFacility"]').appendChild(fromFacilityCombo.el);

  const fromLocationCombo = createCombobox({
    options: state.fromLocationList.map((l) => ({ id: l.locationSeqId, label: l.locationSeqId })),
    value: state.fromLocation, placeholder: '--Select--',
    onChange: (id) => { state.fromLocation = id || ''; },
  });
  container.querySelector('[data-slot="fromLocation"]').appendChild(fromLocationCombo.el);

  const toFacilityCombo = createCombobox({
    options: state.toFacilityList.map((f) => ({ id: f.facilityId, label: `${f.facilityId} - ${f.facilityName}` })),
    value: state.toFacilityId, placeholder: '--Select--',
    onChange: (id) => {
      state.toFacilityId = id || '';
      fetchToLocation(container);
    },
  });
  container.querySelector('[data-slot="toFacility"]').appendChild(toFacilityCombo.el);

  const toLocationCombo = createCombobox({
    options: state.toLocationList.map((l) => ({ id: l.locationSeqId, label: l.locationSeqId })),
    value: state.toLocation, placeholder: '--Select--',
    onChange: (id) => { state.toLocation = id || ''; },
  });
  container.querySelector('[data-slot="toLocation"]').appendChild(toLocationCombo.el);

  document.getElementById('productSuffixBtn').addEventListener('click', async () => {
    if (state.selectedProductLabel) {
      state.selectedProductId = ''; state.selectedProductLabel = '';
      render(container);
      return;
    }
    const picked = await openProductSearchPopup();
    if (picked) {
      state.selectedProductId = picked.productId;
      state.selectedProductLabel = `${picked.internalName}  -  ${picked.productId}`;
      render(container);
    }
  });

  document.getElementById('btnGetDetails').addEventListener('click', () => {
    state.page = 0;
    getDetails(container);
  });

  document.getElementById('btnSubmit').addEventListener('click', () => doSubmitClick(container));

  if (state.hasSearched && !state.loading) {
    const toolbar = renderTableToolbar({
      placeholder: 'Search product ID, product name, lot no...',
      countLabel: `${visible.length} of ${state.transferList.length}`,
      onSearch: (q) => { state.search = q; render(container); },
      onExportCsv: () => exportToCsv('transfer', COLUMNS, visible.map(({ r, idx }) => ({ ...r, qty: state.qtyByRow[idx] ?? '' }))),
      onExportExcel: () => exportToExcel('transfer', COLUMNS, visible.map(({ r, idx }) => ({ ...r, qty: state.qtyByRow[idx] ?? '' }))),
    });
    document.getElementById('trToolbar').appendChild(toolbar);
  }

  if (state.hasSearched && state.transferList.length) {
    container.querySelectorAll('[data-a="qty"]').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        // Filter to numeric-with-up-to-2-decimals as the user types.
        let v = e.target.value.replace(/[^\d.]/g, '');
        const m = v.match(/^\d+\.?\d{0,2}/);
        v = m ? m[0] : '';
        e.target.value = v;
      });
      inp.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        state.qtyByRow[idx] = e.target.value;
        // Matches original app quirk: editing Qty after checking a row does not
        // touch the row's isSelected/checkbox state (submit still reads that flag).
      });
    });

    container.querySelectorAll('[data-a="rowcheck"]').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        const r = state.transferList[idx];
        const checkedNow = e.target.checked;
        state.selectedByRow[idx] = checkedNow;

        const currentQty = state.qtyByRow[idx];
        if (currentQty === undefined || currentQty === null || String(currentQty).trim() === '') {
          if (checkedNow) state.qtyByRow[idx] = r.qoh != null ? String(r.qoh) : '';
        } else if (!checkedNow) {
          state.qtyByRow[idx] = '';
        }

        const parsedQty = parseFloat(state.qtyByRow[idx]);
        const parsedQoh = parseFloat(r.qoh);
        if (!Number.isNaN(parsedQty) && !Number.isNaN(parsedQoh) && parsedQty > parsedQoh) {
          banner({ type: 'error', message: 'Qty cannot be more than QOH', autoHideMs: 10000 });
        }
        render(container);
      });
    });

    const selAll = document.getElementById('selectAll');
    if (selAll) {
      selAll.addEventListener('change', (e) => {
        // Select-all bypasses the QOH auto-fill/validation that per-row toggling does.
        const checkedNow = e.target.checked;
        state.transferList.forEach((_, i) => { state.selectedByRow[i] = checkedNow; });
        render(container);
      });
    }

    const paginationSlot = document.getElementById('trPagination');
    if (paginationSlot) {
      paginationSlot.appendChild(renderPaginationBar({
        page: state.page,
        pageSize: state.pageSize,
        totalCount: state.totalCount,
        pageSizes: PAGE_SIZES,
        onPageSize: (size) => { state.pageSize = size; state.page = 0; refetchPage(container); },
        onFirst: () => { if (state.page !== 0) { state.page = 0; refetchPage(container); } },
        onPrev: () => { if (state.page > 0) { state.page -= 1; refetchPage(container); } },
        onNext: () => {
          const lastPage = Math.max(0, Math.ceil(state.totalCount / state.pageSize) - 1);
          if (state.page < lastPage) { state.page += 1; refetchPage(container); }
        },
        onLast: () => {
          const lastPage = Math.max(0, Math.ceil(state.totalCount / state.pageSize) - 1);
          if (state.page !== lastPage) { state.page = lastPage; refetchPage(container); }
        },
      }));
    }
  }
}

export default {
  title: 'Transfer',
  async mount(container) {
    resetState();
    render(container);
    try { await fetchInit(); } catch (e) {
      toast(e.details || e.message || 'Failed to load facilities', 'error');
    }
    render(container);
  },
};
