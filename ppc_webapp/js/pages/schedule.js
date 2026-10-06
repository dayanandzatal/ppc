// Schedule (Part Schedule) — list + create/edit dialog + Run MRP scripted progress.
// See scratchpad spec: schedule.md
import { callApi, ENDPOINTS, TXN } from '../api.js';
import { icon } from '../icons.js';
import {
  el, escapeHtml, toast, openModal, confirmDialog, loadingState, emptyState,
  createCombobox, openProgressDialog,
  renderTableToolbar, filterRows, sortableTh, wireSortableHeaders, applySort,
  exportToCsv, exportToExcel,
} from '../ui.js';

const COLUMNS = [
  { key: 'partCode', label: 'Part Code' },
  { key: 'partDescription', label: 'Part Description' },
  { key: 'quantity', label: 'Qty' },
];

let state = { loading: false, list: [], partCodeList: [], search: '', sort: { key: '', dir: 'asc' } };
let mrpRunning = false;

async function fetchPartCodeList() {
  const data = await callApi(ENDPOINTS.init, TXN.getMachineMappingInit, {}, {});
  state.partCodeList = data.partCodeList || [];
}

async function fetchList(container) {
  state.loading = true;
  render(container);
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getPartScheduleList, { partCode: '' }, {});
    const list = data.partScheduleList || data.scheduleList || data.partSchedule || data.partSchedules || [];
    state.list = list;
  } catch (e) {
    toast(e.details || e.message || 'Failed to fetch schedule list', 'error');
  } finally {
    state.loading = false;
    render(container);
  }
}

function row(r, idx) {
  return `
    <tr data-idx="${idx}">
      <td>${escapeHtml(r.partCode || '')}</td>
      <td>${escapeHtml(r.partDescription || '')}</td>
      <td class="cx-cell-center">${r.quantity ?? 0}</td>
      <td class="cx-cell-actions">
        <button type="button" class="cx-row-action" data-a="edit" title="Edit">${icon('edit', { size: 15 })}</button>
      </td>
    </tr>`;
}

function visibleRows() {
  const filtered = filterRows(state.list, state.search, ['partCode', 'partDescription']);
  return applySort(filtered, state.sort);
}

function render(container) {
  const rows = visibleRows();
  container.innerHTML = `
    <div class="cx-page-header">
      <h1><span class="cx-page-icon">${icon('calendar', { size: 18 })}</span>Schedule</h1>
      <div class="cx-page-header-actions">
        <button type="button" class="cx-btn ${mrpRunning ? 'cx-btn-secondary' : 'cx-btn-secondary'}" id="btnRunMrp" ${mrpRunning ? 'disabled' : ''}>
          ${icon('play', { size: 15 })}${mrpRunning ? 'Running...' : 'Run MRP'}
        </button>
        <button type="button" class="cx-btn cx-btn-primary" id="btnAdd">${icon('plus', { size: 16 })}Add Schedule</button>
      </div>
    </div>
    <div id="schToolbar"></div>
    <div class="cx-table-wrap">
      <div class="cx-table-scroll">
        ${state.loading
          ? loadingState()
          : (!rows.length
              ? emptyState(state.search ? 'No results match your search.' : 'No Data Found!')
              : `<table class="cx-table"><thead><tr>
                  ${sortableTh('Part Code', 'partCode', state.sort, () => render(container))}
                  ${sortableTh('Part Description', 'partDescription', state.sort, () => render(container))}
                  ${sortableTh('Qty', 'quantity', state.sort, () => render(container), 'cx-cell-center')}
                  <th>Edit</th>
                 </tr></thead><tbody>${rows.map(row).join('')}</tbody></table>`)}
      </div>
    </div>
  `;

  if (!state.loading) {
    const toolbar = renderTableToolbar({
      placeholder: 'Search part code, description...',
      countLabel: `${rows.length} of ${state.list.length}`,
      onSearch: (q) => { state.search = q; render(container); },
      onExportCsv: () => exportToCsv('schedule', COLUMNS, rows),
      onExportExcel: () => exportToExcel('schedule', COLUMNS, rows),
    });
    document.getElementById('schToolbar').appendChild(toolbar);
    wireSortableHeaders(container, state.sort, () => render(container));
  }

  document.getElementById('btnAdd').addEventListener('click', () => openScheduleDialog(container));
  document.getElementById('btnRunMrp').addEventListener('click', () => openRunMrp(container));
  container.querySelectorAll('[data-a="edit"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = Number(e.target.closest('tr').dataset.idx);
      openScheduleDialog(container, rows[idx]);
    });
  });
}

function partCodeOptions() {
  return state.partCodeList.map((p) => ({ id: p.productId, label: `${p.productId} - ${p.internalName || ''}` }));
}

async function openScheduleDialog(listContainer, existing) {
  const isEdit = !!existing;
  const modal = openModal({ title: isEdit ? 'Edit Schedule' : 'Create Schedule', width: 640, bodyHtml: loadingState() });
  try { if (!state.partCodeList.length) await fetchPartCodeList(); } catch (e) {}

  modal.body.innerHTML = `
    <div id="schError"></div>
    <div class="cx-grid cx-grid-2">
      <div class="cx-field"><label>Part Code</label><div data-slot="partCode"></div></div>
      <div class="cx-field"><label>Quantity</label><input class="cx-input" id="schQty" inputmode="numeric" value="${isEdit ? (existing.quantity ?? '') : ''}" /></div>
    </div>
  `;
  let selectedPartCode = isEdit ? existing.partCode : '';
  const combo = createCombobox({
    options: partCodeOptions(), value: selectedPartCode, placeholder: '--Select--',
    onChange: (id) => { selectedPartCode = id || ''; },
  });
  modal.body.querySelector('[data-slot="partCode"]').appendChild(combo.el);

  const footer = el(`
    <div class="cx-modal-footer">
      <button type="button" class="cx-btn cx-btn-secondary" data-a="cancel">Cancel</button>
      ${isEdit ? '<button type="button" class="cx-btn cx-btn-danger" data-a="delete">Delete</button>' : ''}
      <button type="button" class="cx-btn cx-btn-primary" data-a="save">Save</button>
    </div>
  `);
  modal.overlay.querySelector('.cx-modal').appendChild(footer);
  const errorSlot = document.getElementById('schError');
  const showErr = (msg) => { errorSlot.innerHTML = `<div class="cx-banner cx-banner-error">${icon('alert-circle', { size: 16 })}<span>${escapeHtml(msg)}</span></div>`; };

  footer.querySelector('[data-a="cancel"]').addEventListener('click', () => modal.close());

  if (isEdit) {
    footer.querySelector('[data-a="delete"]').addEventListener('click', async () => {
      if (!selectedPartCode) { showErr('Part Code is mandatory.'); return; }
      const ok = await confirmDialog({ title: 'Confirm Delete', body: 'Are you sure you want to delete this schedule?' });
      if (!ok) return;
      try {
        await callApi(ENDPOINTS.init, TXN.deletePartSchedule, { partCode: selectedPartCode }, {});
        modal.close();
        toast('Schedule deleted', 'success');
        fetchList(listContainer);
      } catch (e) { showErr(e.details || e.message || 'Delete failed'); }
    });
  }

  footer.querySelector('[data-a="save"]').addEventListener('click', async () => {
    const qtyText = document.getElementById('schQty').value.trim();
    const qty = parseInt(qtyText, 10);
    if (!selectedPartCode || Number.isNaN(qty)) { showErr('Part Code and Quantity are mandatory.'); return; }
    try {
      const txn = isEdit ? TXN.updatePartSchedule : TXN.createPartSchedule;
      await callApi(ENDPOINTS.init, txn, { partCode: selectedPartCode, quantity: qty }, {});
      modal.close();
      toast(isEdit ? 'Schedule updated successfully' : 'Schedule created successfully', 'success');
      fetchList(listContainer);
    } catch (e) {
      showErr(e.details || e.message || (isEdit ? 'Failed to update schedule' : 'Failed to create schedule'));
    }
  });
}

const MRP_STEPS = [
  'Building BOM',
  'Updating demand quantity for products',
  'Checking & Updating Stock',
  'Updating demand quantity for sub products',
  'Updating available stock for sub products',
  'Calculating & updating requirements',
];

function openRunMrp(listContainer) {
  if (mrpRunning) return;
  mrpRunning = true;
  render(listContainer);
  const apiPromise = callApi(ENDPOINTS.init, TXN.runMrp, {}, {}).then((data) => {
    data.__message = data.successMessage || data.responseMessage || undefined;
    return data;
  });
  openProgressDialog({
    title: 'Running MRP',
    steps: MRP_STEPS,
    stepMs: 3000,
    apiPromise,
    successMessageDefault: 'MRP completed successfully',
    failMessageDefault: 'MRP failed',
    onSuccess: async () => { await fetchList(listContainer); },
  });
  apiPromise.finally(() => {
    setTimeout(() => { mrpRunning = false; render(listContainer); }, MRP_STEPS.length * 3000 + 200);
  });
}

export default {
  title: 'Schedule',
  async mount(container) {
    state = { loading: false, list: [], partCodeList: [], search: '', sort: { key: '', dir: 'asc' } };
    mrpRunning = false;
    fetchList(container);
  },
};
