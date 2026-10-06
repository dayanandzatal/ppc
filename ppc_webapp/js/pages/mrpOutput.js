// MRP Output — filters, infinite-scroll table with checkboxes, Create Requirement.
// See scratchpad spec: holidays_mrp_output.md (module 2)
import { callApi, ENDPOINTS, TXN } from '../api.js';
import { icon } from '../icons.js';
import {
  el, escapeHtml, toast, loadingState, emptyState, createCombobox, mountBanner,
  statRow, renderTableToolbar, filterRows, sortableTh, wireSortableHeaders, applySort,
  exportToCsv, exportToExcel,
} from '../ui.js';
import { openProductSearchPopup } from '../productPicker.js';

const COLUMNS = [
  { key: 'requirementTypeDesc', label: 'Requirement Type' },
  { key: 'child', label: 'Product ID' },
  { key: 'productName', label: 'Product Name' },
  { key: 'facilityName', label: 'Facility' },
  { key: 'qoh', label: 'QOH' },
  { key: 'reqQty', label: 'Plan Qty' },
];

let state = {
  facilityList: [], requirementTypeOptions: ['--Select--'], requirementTypeMap: {},
  searchFacilityId: '', requirementType: '',
  selectedProductId: '', selectedProductLabel: '',
  mrpList: [], selected: new Set(),
  viewIndex: 0, hasMore: true, hasSearched: false,
  loading: false, loadingMore: false,
  search: '', sort: { key: '', dir: 'asc' },
};

async function fetchFacility() {
  const data = await callApi(ENDPOINTS.init, TXN.getFacility, {}, {});
  state.facilityList = data.facilityList || [];
  if (state.facilityList.length === 1) state.searchFacilityId = state.facilityList[0].facilityId;
}

async function fetchRequirementTypes() {
  const data = await callApi(ENDPOINTS.init, TXN.getRequirementType, {}, {});
  const list = data.requirementTypeList || data.requirementList || [];
  state.requirementTypeMap = {};
  list.forEach((t) => { state.requirementTypeMap[t.description || t.requirementTypeName] = t.requirementTypeId; });
  state.requirementTypeOptions = ['--Select--', ...list.map((t) => t.description || t.requirementTypeName)];
  if (list.length === 1) state.requirementType = list[0].requirementTypeId;
}

function mapRow(item) {
  return {
    requirementTypeId: item.reqType,
    requirementTypeDesc: item.requirementTypeDesc,
    child: item.child, productName: item.productName,
    facilityId: item.facilityId, facilityName: item.facilityName,
    departmentId: item.departmentId, qoh: item.qoh, reqQty: item.reqQty,
  };
}

async function search(container, { loadMore = false } = {}) {
  if (loadMore) { state.loadingMore = true; } else {
    state.loading = true; state.viewIndex = 0; state.mrpList = []; state.selected.clear(); state.hasMore = true; state.hasSearched = true;
  }
  render(container);
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getMrpList, {
      facilityId: state.searchFacilityId,
      requirementType: state.requirementType,
      partCode: state.selectedProductId,
      planDate: '',
      viewIndex: String(state.viewIndex),
    }, {});
    const rows = (data.mrpList || []).map(mapRow);
    if (loadMore) {
      state.mrpList = state.mrpList.concat(rows);
      state.hasMore = rows.length > 0;
      if (rows.length) state.viewIndex += 1;
    } else {
      state.mrpList = rows;
      state.hasMore = rows.length > 0;
      if (rows.length) state.viewIndex += 1;
    }
  } catch (e) {
    toast(e.details || e.message || 'Failed to load MRP list', 'error');
  } finally {
    state.loading = false; state.loadingMore = false;
    render(container);
  }
}

async function createRequirement(container) {
  if (!state.selected.size) return;
  const rows = state.mrpList.filter((r) => state.selected.has(r));
  const payload = rows.map((r) => ({
    productId: r.child || '', requirementTypeId: r.requirementTypeId,
    facilityId: r.facilityId, quantity: String(r.reqQty ?? 0), departmentId: r.departmentId || '',
  }));
  try {
    await callApi(ENDPOINTS.init, TXN.createRequirement, { requirementList: payload }, {});
    state.mrpList = state.mrpList.filter((r) => !state.selected.has(r));
    state.selected.clear();
    toast('Requirement created successfully', 'success');
    render(container);
  } catch (e) {
    toast(e.details || e.message || 'Failed to create requirement', 'error');
  }
}

function row(r, idx) {
  return `
    <tr data-idx="${idx}">
      <td class="cx-cell-center"><input type="checkbox" data-a="rowcheck" data-idx="${idx}" ${state.selected.has(r) ? 'checked' : ''} /></td>
      <td class="cx-cell-center">${idx + 1}</td>
      <td>${escapeHtml(r.requirementTypeDesc || '')}</td>
      <td>${escapeHtml(r.child || '')}</td>
      <td>${escapeHtml(r.productName || '')}</td>
      <td>${escapeHtml(r.facilityName || '')}</td>
      <td class="cx-cell-center">${r.qoh ?? ''}</td>
      <td class="cx-cell-center">${r.reqQty ?? ''}</td>
    </tr>`;
}

function visibleRows() {
  const filtered = filterRows(state.mrpList, state.search, ['requirementTypeDesc', 'child', 'productName', 'facilityName']);
  return applySort(filtered, state.sort);
}

function render(container) {
  const rows = visibleRows();
  const allSelected = rows.length > 0 && rows.every((r) => state.selected.has(r));
  container.innerHTML = `
    <div class="cx-page-header"><h1><span class="cx-page-icon">${icon('table', { size: 18 })}</span>MRP Output</h1></div>
    <div id="mrpBanner"></div>
    <div class="cx-card">
      <div class="cx-grid cx-grid-3">
        <div class="cx-field"><label>Facility<span class="req">*</span></label><div data-slot="facility"></div></div>
        <div class="cx-field"><label>Requirement Type</label><div data-slot="reqType"></div></div>
        <div class="cx-field"><label>Product</label>
          <div class="cx-input-suffix-wrap">
            <input class="cx-input" id="productField" readonly placeholder="Select product" value="${escapeHtml(state.selectedProductLabel)}" />
            <button type="button" class="cx-input-suffix-btn" id="productSuffixBtn">${icon(state.selectedProductLabel ? 'x' : 'search', { size: 15 })}</button>
          </div>
        </div>
      </div>
      <div class="cx-flex-center cx-mt-16"><button type="button" class="cx-btn cx-btn-primary" id="btnSearch">${icon('search', { size: 15 })}Search</button></div>
    </div>

    ${state.hasSearched ? `
      ${!state.loading && state.mrpList.length ? statRow([
        { label: 'Total Rows', value: String(state.mrpList.length) },
        { label: 'Selected', value: String(state.selected.size), variant: state.selected.size ? 'accent' : '' },
      ]) : ''}
      <div id="mrpToolbar"></div>
      <div class="cx-table-wrap">
        <div class="cx-table-scroll" id="tableScroll" style="max-height:520px;overflow-y:auto">
          ${state.loading ? loadingState() : (!rows.length ? emptyState(state.search ? 'No results match your search.' : 'No Data Found!') : `
            <table class="cx-table"><thead><tr>
              <th class="cx-cell-center"><input type="checkbox" id="selectAll" ${allSelected ? 'checked' : ''} /></th>
              <th>Sr No</th>
              ${sortableTh('Requirement Type', 'requirementTypeDesc', state.sort, () => render(container))}
              ${sortableTh('Product ID', 'child', state.sort, () => render(container))}
              ${sortableTh('Product Name', 'productName', state.sort, () => render(container))}
              ${sortableTh('Facility', 'facilityName', state.sort, () => render(container))}
              ${sortableTh('QOH', 'qoh', state.sort, () => render(container), 'cx-cell-center')}
              ${sortableTh('Plan Qty', 'reqQty', state.sort, () => render(container), 'cx-cell-center')}
            </tr></thead><tbody>${rows.map(row).join('')}</tbody></table>`)}
        </div>
      </div>
      <div class="cx-flex-center cx-mt-16">
        <button type="button" class="cx-btn cx-btn-primary ${state.selected.size ? '' : 'is-disabled'}" id="btnCreateReq">Create Requirement</button>
      </div>
      ${state.loadingMore ? `<div class="cx-flex-center cx-mt-12"><div class="cx-spinner cx-spinner-sm"></div></div>` : ''}
    ` : ''}
  `;

  if (state.hasSearched && !state.loading) {
    const toolbar = renderTableToolbar({
      placeholder: 'Search requirement type, product, facility...',
      countLabel: `${rows.length} of ${state.mrpList.length} loaded`,
      onSearch: (q) => { state.search = q; render(container); },
      onExportCsv: () => exportToCsv('mrp-output', COLUMNS, rows),
      onExportExcel: () => exportToExcel('mrp-output', COLUMNS, rows),
    });
    document.getElementById('mrpToolbar').appendChild(toolbar);
    wireSortableHeaders(container, state.sort, () => render(container));
  }

  const facilityCombo = createCombobox({
    options: state.facilityList.map((f) => ({ id: f.facilityId, label: f.facilityName })),
    value: state.searchFacilityId, placeholder: '--Select--',
    onChange: (id) => { state.searchFacilityId = id || ''; },
  });
  container.querySelector('[data-slot="facility"]').appendChild(facilityCombo.el);

  const reqCombo = createCombobox({
    options: Object.keys(state.requirementTypeMap).map((desc) => ({ id: state.requirementTypeMap[desc], label: desc })),
    value: state.requirementType, placeholder: '--Select--',
    onChange: (id) => { state.requirementType = id || ''; },
  });
  container.querySelector('[data-slot="reqType"]').appendChild(reqCombo.el);

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

  document.getElementById('btnSearch').addEventListener('click', () => {
    if (!state.searchFacilityId) {
      mountBanner(document.getElementById('mrpBanner'), { type: 'error', message: 'Please select a facility.', autoHideMs: 5000 });
      return;
    }
    search(container);
  });

  if (state.hasSearched) {
    container.querySelectorAll('[data-a="rowcheck"]').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        const r = rows[idx];
        if (e.target.checked) state.selected.add(r); else state.selected.delete(r);
        render(container);
      });
    });
    const selAll = document.getElementById('selectAll');
    if (selAll) {
      selAll.addEventListener('change', (e) => {
        if (e.target.checked) rows.forEach((r) => state.selected.add(r));
        else rows.forEach((r) => state.selected.delete(r));
        render(container);
      });
    }
    const btnCreate = document.getElementById('btnCreateReq');
    if (btnCreate) btnCreate.addEventListener('click', () => createRequirement(container));

    const scrollEl = document.getElementById('tableScroll');
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
  title: 'MRP Output',
  async mount(container) {
    state = {
      facilityList: [], requirementTypeOptions: ['--Select--'], requirementTypeMap: {},
      searchFacilityId: '', requirementType: '', selectedProductId: '', selectedProductLabel: '',
      mrpList: [], selected: new Set(), viewIndex: 0, hasMore: true, hasSearched: false,
      loading: false, loadingMore: false,
      search: '', sort: { key: '', dir: 'asc' },
    };
    render(container);
    try { await fetchFacility(); } catch (e) {}
    try { await fetchRequirementTypes(); } catch (e) {}
    render(container);
  },
};
