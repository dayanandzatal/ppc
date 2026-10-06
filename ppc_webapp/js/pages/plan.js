// Plan (Part Plan) — list + create/edit dialog + Get MRP Data + Run CRP scripted progress.
// See scratchpad spec: plan_module_research.md
import { callApi, ENDPOINTS, TXN } from '../api.js';
import { icon } from '../icons.js';
import {
  el, escapeHtml, toast, openModal, confirmDialog, loadingState, emptyState,
  createCombobox, openProgressDialog,
  renderTableToolbar, filterRows, sortableTh, wireSortableHeaders, applySort,
  exportToCsv, exportToExcel,
} from '../ui.js';
import { isoWithMidnight, todayIso } from '../dateUtils.js';

const COLUMNS = [
  { key: 'partCode', label: 'Part Code' },
  { key: 'partDescription', label: 'Part Description' },
  { key: 'planDate', label: 'Plan Date' },
  { key: 'schQty', label: 'Sch. Qty' },
  { key: 'rejQty', label: 'Rejection %' },
  { key: 'planQty', label: 'Plan Qty' },
  { key: 'priority', label: 'Priority' },
];

let state = { loading: false, list: [], partCodeList: [], search: '', sort: { key: '', dir: 'asc' } };
let crpRunning = false;
let mrpDataLoading = false;

function pad(n) { return String(n).padStart(2, '0'); }
function formatNowSeconds() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function fetchPartCodeList() {
  const data = await callApi(ENDPOINTS.init, TXN.getMachineMappingInit, {}, {});
  state.partCodeList = data.partCodeList || [];
}

function partDescriptionFor(partCode) {
  const match = state.partCodeList.find((p) => String(p.productId) === String(partCode));
  return match ? (match.internalName || '') : '';
}

async function fetchList(container) {
  state.loading = true;
  render(container);
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getPartPlanList, { partCode: '', planDate: '' }, {});
    state.list = data.planList || [];
  } catch (e) {
    toast(e.details || e.message || 'Failed to fetch plan list', 'error');
  } finally {
    state.loading = false;
    render(container);
  }
}

function row(r, idx) {
  const zebra = idx % 2 === 1 ? 'style="background:var(--cx-gray-50)"' : '';
  return `
    <tr ${zebra} data-idx="${idx}">
      <td>${escapeHtml(r.partCode || '')}</td>
      <td>${escapeHtml(r.partDescription || '')}</td>
      <td class="cx-cell-center">${escapeHtml(r.planDate || '')}</td>
      <td class="cx-cell-center">${r.schQty ?? ''}</td>
      <td class="cx-cell-center">${r.rejQty ?? ''}</td>
      <td class="cx-cell-center">${r.planQty ?? ''}</td>
      <td class="cx-cell-center">${r.priority ?? ''}</td>
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
      <h1><span class="cx-page-icon">${icon('event-note', { size: 18 })}</span>Plan</h1>
      <div class="cx-page-header-actions">
        <button type="button" class="cx-btn cx-btn-secondary" id="btnGetMrp" ${mrpDataLoading ? 'disabled' : ''}>
          ${icon('refresh', { size: 15 })}${mrpDataLoading ? 'Loading...' : 'Get MRP Data'}
        </button>
        <button type="button" class="cx-btn cx-btn-secondary" id="btnRunCrp" ${crpRunning ? 'disabled' : ''}>
          ${icon('play', { size: 15 })}${crpRunning ? 'Running...' : 'Run CRP'}
        </button>
        <button type="button" class="cx-btn cx-btn-primary" id="btnAdd">${icon('plus', { size: 16 })}Add Plan</button>
      </div>
    </div>
    <div id="planToolbar"></div>
    <div class="cx-table-wrap">
      <div class="cx-table-scroll">
        ${state.loading
          ? loadingState()
          : (!rows.length
              ? emptyState(state.search ? 'No results match your search.' : 'No Data Found!')
              : `<table class="cx-table"><thead><tr>
                  ${sortableTh('Part Code', 'partCode', state.sort, () => render(container))}
                  ${sortableTh('Part Description', 'partDescription', state.sort, () => render(container))}
                  ${sortableTh('Plan Date', 'planDate', state.sort, () => render(container), 'cx-cell-center')}
                  ${sortableTh('Sch. Qty', 'schQty', state.sort, () => render(container), 'cx-cell-center')}
                  ${sortableTh('Rejection %', 'rejQty', state.sort, () => render(container), 'cx-cell-center')}
                  ${sortableTh('Plan Qty', 'planQty', state.sort, () => render(container), 'cx-cell-center')}
                  ${sortableTh('Priority', 'priority', state.sort, () => render(container), 'cx-cell-center')}
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
      onExportCsv: () => exportToCsv('plan', COLUMNS, rows),
      onExportExcel: () => exportToExcel('plan', COLUMNS, rows),
    });
    document.getElementById('planToolbar').appendChild(toolbar);
    wireSortableHeaders(container, state.sort, () => render(container));
  }

  document.getElementById('btnAdd').addEventListener('click', () => openPlanDialog(container));
  document.getElementById('btnGetMrp').addEventListener('click', () => onGetMrpData(container));
  document.getElementById('btnRunCrp').addEventListener('click', () => onRunCrp(container));
  if (rows.length) {
    container.querySelectorAll('[data-a="edit"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.target.closest('tr').dataset.idx);
        openPlanDialog(container, rows[idx]);
      });
    });
  }
}

function partCodeOptions() {
  return state.partCodeList.map((p) => ({ id: p.productId, label: `${p.productId} - ${p.internalName || ''}` }));
}

function intOrUndefined(v) {
  const t = String(v || '').trim();
  if (!t) return undefined;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : undefined;
}

async function openPlanDialog(listContainer, existing) {
  const isEdit = !!existing;
  const modal = openModal({ title: isEdit ? 'Edit Plan' : 'Create Plan', width: 720, bodyHtml: loadingState() });
  try { if (!state.partCodeList.length) await fetchPartCodeList(); } catch (e) { /* best-effort */ }

  modal.body.innerHTML = `
    <div id="planError"></div>
    <div class="cx-grid cx-grid-2" style="row-gap:18px">
      <div class="cx-field"><label>Part Code</label><div data-slot="partCode"></div></div>
      <div class="cx-field"><label>Part Description</label><input class="cx-input" id="planPartDesc" readonly /></div>
      <div class="cx-field"><label>Plan Date</label><div data-slot="planDate"></div></div>
      <div class="cx-field"><label>Scheduled Quantity</label><input class="cx-input" id="planSchQty" inputmode="numeric" /></div>
      <div class="cx-field"><label>Rejection %</label><input class="cx-input" id="planRejQty" inputmode="numeric" /></div>
      <div class="cx-field"><label>Plan Quantity</label><input class="cx-input" id="planPlanQty" inputmode="numeric" /></div>
      <div class="cx-field"><label>Priority</label><input class="cx-input" id="planPriority" inputmode="numeric" /></div>
      <div></div>
    </div>
  `;

  let selectedPartCode = isEdit ? (existing.partCode || '') : '';

  const partDescInput = modal.body.querySelector('#planPartDesc');
  const partCodeSlot = modal.body.querySelector('[data-slot="partCode"]');
  const planDateSlot = modal.body.querySelector('[data-slot="planDate"]');

  if (isEdit) {
    partCodeSlot.appendChild(el(`<input class="cx-input" readonly value="${escapeHtml(selectedPartCode)}" />`));
    planDateSlot.appendChild(el(`<input class="cx-input" readonly value="${escapeHtml(existing.planDate || '')}" />`));
    partDescInput.value = partDescriptionFor(selectedPartCode) || existing.partDescription || '';
  } else {
    const partCombo = createCombobox({
      options: partCodeOptions(), placeholder: '--Select--',
      onChange: (id) => {
        selectedPartCode = id || '';
        partDescInput.value = partDescriptionFor(selectedPartCode);
      },
    });
    partCodeSlot.appendChild(partCombo.el);
    planDateSlot.appendChild(el(`<input type="date" class="cx-input" id="planDateInput" value="${todayIso()}" />`));
  }

  modal.body.querySelector('#planSchQty').value = isEdit ? (existing.schQty ?? '') : '';
  modal.body.querySelector('#planRejQty').value = isEdit ? (existing.rejQty ?? '') : '';
  modal.body.querySelector('#planPlanQty').value = isEdit ? (existing.planQty ?? '') : '';
  modal.body.querySelector('#planPriority').value = isEdit ? (existing.priority ?? '') : '';

  const footer = el(`
    <div class="cx-modal-footer">
      <button type="button" class="cx-btn cx-btn-secondary" data-a="cancel">Cancel</button>
      ${isEdit ? '<button type="button" class="cx-btn cx-btn-danger" data-a="delete">Delete</button>' : ''}
      <button type="button" class="cx-btn cx-btn-primary" data-a="save">Save</button>
    </div>
  `);
  modal.overlay.querySelector('.cx-modal').appendChild(footer);

  const errorSlot = modal.body.querySelector('#planError');
  const showErr = (msg) => {
    errorSlot.innerHTML = `<div class="cx-banner cx-banner-error">${icon('alert-circle', { size: 16 })}<span>${escapeHtml(msg)}</span></div>`;
  };

  footer.querySelector('[data-a="cancel"]').addEventListener('click', () => modal.close());

  if (isEdit) {
    footer.querySelector('[data-a="delete"]').addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Confirm Delete', body: 'Are you sure you want to delete this plan?' });
      if (!ok) return;
      try {
        await callApi(ENDPOINTS.init, TXN.deletePartPlan, {
          partCode: existing.partCode || '', planDate: existing.planDate || '',
        }, {});
        modal.close();
        toast('Plan deleted', 'success');
        fetchList(listContainer);
      } catch (e) {
        showErr(e.details || e.message || 'Failed to delete plan');
      }
    });
  }

  footer.querySelector('[data-a="save"]').addEventListener('click', async () => {
    let planDate;
    if (isEdit) {
      planDate = existing.planDate || '';
    } else {
      const dateVal = modal.body.querySelector('#planDateInput').value;
      planDate = dateVal ? isoWithMidnight(dateVal) : '';
    }
    if (!selectedPartCode || !planDate) {
      showErr('Part Code and Plan Date are mandatory.');
      return;
    }
    const payload = { partCode: selectedPartCode, planDate };
    const schQty = intOrUndefined(modal.body.querySelector('#planSchQty').value);
    const rejQty = intOrUndefined(modal.body.querySelector('#planRejQty').value);
    const planQty = intOrUndefined(modal.body.querySelector('#planPlanQty').value);
    const priority = intOrUndefined(modal.body.querySelector('#planPriority').value);
    if (schQty !== undefined) payload.schQty = schQty;
    if (rejQty !== undefined) payload.rejQty = rejQty;
    if (planQty !== undefined) payload.planQty = planQty;
    if (priority !== undefined) payload.priority = priority;

    try {
      const txn = isEdit ? TXN.updatePartPlan : TXN.createPartPlan;
      await callApi(ENDPOINTS.init, txn, payload, {});
      modal.close();
      toast(isEdit ? 'Plan updated successfully' : 'Plan created successfully', 'success');
      fetchList(listContainer);
    } catch (e) {
      showErr(e.details || e.message || (isEdit ? 'Failed to update plan' : 'Failed to create plan'));
    }
  });
}

async function onGetMrpData(listContainer) {
  if (mrpDataLoading) return;
  mrpDataLoading = true;
  render(listContainer);
  const modal = openModal({
    title: 'Please Wait', width: 360, dismissible: false, closeIcon: false,
    bodyHtml: loadingState('Getting MRP data...'),
  });
  try {
    await callApi(ENDPOINTS.init, TXN.createPartPlanMrp, { planDate: formatNowSeconds() }, {});
    modal.close();
    toast('MRP data fetched successfully', 'success');
    await fetchList(listContainer);
  } catch (e) {
    modal.close();
    toast(e.details || e.message || 'Failed to get MRP data', 'error');
  } finally {
    mrpDataLoading = false;
    render(listContainer);
  }
}

const CRP_STEPS = [
  'Preparing Planning data',
  'Ordering on priority and preference',
  'Calculating work days',
  'Calculating Machine capacity and efficiency',
  'Calculating the quantity that can be produced',
  'Updating balance capacity for the month',
  'Checking shortfall and available Machine to accommodate the shortfall',
  'Calculating the production Start date',
  'Updating the production End Date',
  'Completed',
];

function onRunCrp(listContainer) {
  if (crpRunning) return;
  crpRunning = true;
  render(listContainer);
  const apiPromise = callApi(ENDPOINTS.init, TXN.runCrpPlan, {}, {}).then((data) => {
    data.__message = data.successMessage || data.responseMessage || undefined;
    return data;
  });
  openProgressDialog({
    title: 'Running CRP',
    steps: CRP_STEPS,
    stepMs: 3000,
    apiPromise,
    successMessageDefault: 'CRP completed successfully',
    failMessageDefault: 'CRP Failed',
    onSuccess: async () => { await fetchList(listContainer); },
  });
  apiPromise.finally(() => {
    setTimeout(() => { crpRunning = false; render(listContainer); }, CRP_STEPS.length * 3000 + 200);
  });
}

export default {
  title: 'Plan',
  async mount(container) {
    state = { loading: false, list: [], partCodeList: [], search: '', sort: { key: '', dir: 'asc' } };
    crpRunning = false;
    mrpDataLoading = false;
    fetchList(container);
    try { await fetchPartCodeList(); } catch (e) { /* best-effort, re-fetched lazily on dialog open */ }
  },
};
