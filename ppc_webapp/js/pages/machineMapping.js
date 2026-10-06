// Machine Mapping — list + create/edit dialog. See scratchpad spec: machine_mapping.md
import { callApi, ENDPOINTS, TXN } from '../api.js';
import { icon } from '../icons.js';
import {
  el, escapeHtml, mountBanner, toast, openModal, confirmDialog,
  loadingState, emptyState, createCombobox,
  renderTableToolbar, filterRows, sortableTh, wireSortableHeaders, applySort,
  exportToCsv, exportToExcel,
} from '../ui.js';

const COLUMNS = [
  { key: 'partCode', label: 'Part Code' },
  { key: 'partDescription', label: 'Part Description' },
  { key: 'machineName', label: 'Machine' },
  { key: 'preference', label: 'Preference' },
  { key: 'machineEfficiency', label: 'Efficiency (%)' },
  { key: 'setupTime', label: 'Setup Time' },
  { key: 'cycleTime', label: 'Cycle Time' },
  { key: 'outputUnits', label: 'Output/Cycle' },
  { key: 'tool', label: 'Tool' },
  { key: 'opType', label: 'Op Type' },
  { key: 'operationName', label: 'Operation' },
  { key: 'seqNo', label: 'Seq No' },
];

let state = {
  loading: false,
  list: [],
  operationList: [],
  machineList: [],
  partCodeList: [],
  search: '',
  sort: { key: '', dir: 'asc' },
};

async function fetchInit() {
  const data = await callApi(ENDPOINTS.init, TXN.getMachineMappingInit, {}, {});
  state.operationList = data.operationList || [];
  state.machineList = data.machineList || [];
  state.partCodeList = data.partCodeList || [];
}

async function fetchList(container) {
  state.loading = true;
  render(container);
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getMachineMappingList, { partCode: '' }, {});
    state.list = data.machineMappingList || [];
  } catch (e) {
    mountBanner(document.getElementById('mmBanner'), { type: 'error', message: e.details || e.message });
  } finally {
    state.loading = false;
    render(container);
  }
}

function comboOptionsFromList(list, idKey, nameKey) {
  return list.map((x) => ({ id: x[idKey], label: `${x[idKey]} - ${x[nameKey] || ''}` }));
}

function tableRow(row, idx) {
  const zebra = idx % 2 === 1 ? 'style="background:var(--cx-gray-50)"' : '';
  return `
    <tr ${zebra} data-idx="${idx}">
      <td>${escapeHtml(row.partCode || '')}</td>
      <td>${escapeHtml(row.partDescription || '')}</td>
      <td>${escapeHtml(row.machineName || '')}</td>
      <td class="cx-cell-center">${row.preference ?? 0}</td>
      <td class="cx-cell-center">${row.machineEfficiency ?? 0}%</td>
      <td class="cx-cell-center">${row.setupTime ?? 0} min</td>
      <td class="cx-cell-center">${row.cycleTime ?? 0} sec</td>
      <td class="cx-cell-center">${row.outputUnits ?? 0}</td>
      <td>${escapeHtml(row.tool || '-')}</td>
      <td>${escapeHtml(row.opType || '-')}</td>
      <td>${escapeHtml(row.operationName || '-')}</td>
      <td class="cx-cell-center">${row.seqNo ?? 0}</td>
      <td class="cx-cell-actions">
        <button type="button" class="cx-row-action" data-a="edit" title="Edit">${icon('edit', { size: 15 })}</button>
      </td>
    </tr>`;
}

function visibleRows() {
  const filtered = filterRows(state.list, state.search, ['partCode', 'partDescription', 'machineName', 'operationName', 'tool']);
  return applySort(filtered, state.sort);
}

function render(container) {
  const rows = visibleRows();
  container.innerHTML = `
    <div class="cx-page-header">
      <h1><span class="cx-page-icon">${icon('settings', { size: 18 })}</span>Machine Mapping</h1>
      <div class="cx-page-header-actions">
        <button type="button" class="cx-btn cx-btn-primary" id="btnAdd">${icon('plus', { size: 16 })}Add Operation</button>
      </div>
    </div>
    <div id="mmBanner"></div>
    <div id="mmToolbar"></div>
    <div class="cx-table-wrap">
      <div class="cx-table-scroll">
        ${state.loading
          ? loadingState()
          : (!rows.length
              ? emptyState(state.search ? 'No results match your search.' : 'No Data Found!')
              : `<table class="cx-table"><thead><tr>
                  ${COLUMNS.map((c) => sortableTh(c.label, c.key, state.sort, () => render(container))).join('')}
                  <th>Edit</th>
                 </tr></thead><tbody>${rows.map(tableRow).join('')}</tbody></table>`)}
      </div>
    </div>
  `;

  if (!state.loading) {
    const toolbar = renderTableToolbar({
      placeholder: 'Search part code, machine, operation...',
      countLabel: `${rows.length} of ${state.list.length}`,
      onSearch: (q) => { state.search = q; render(container); },
      onExportCsv: () => exportToCsv('machine-mapping', COLUMNS, rows),
      onExportExcel: () => exportToExcel('machine-mapping', COLUMNS, rows),
    });
    document.getElementById('mmToolbar').appendChild(toolbar);
    wireSortableHeaders(container, state.sort, () => render(container));
  }

  document.getElementById('btnAdd').addEventListener('click', () => openCreateDialog(container));
  if (rows.length) {
    container.querySelectorAll('[data-a="edit"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.target.closest('tr').dataset.idx);
        openEditDialog(container, rows[idx]);
      });
    });
  }
}

function fieldBlock(labelText, innerHtml) {
  return `<div class="cx-field"><label>${labelText}</label>${innerHtml}</div>`;
}

function buildFormShell() {
  return el(`
    <form class="cx-grid cx-grid-2" style="row-gap:18px">
      <div data-slot="partCode"></div>
      <div class="cx-field"><label>Part Description</label><input class="cx-input" data-f="partDescription" readonly /></div>
      <div data-slot="machine"></div>
      <div class="cx-field"><label>Machine Efficiency</label><input class="cx-input" data-f="machineEfficiency" inputmode="numeric" /></div>
      <div class="cx-field"><label>Setup Time</label><input class="cx-input" data-f="setupTime" inputmode="numeric" /></div>
      <div class="cx-field"><label>Cycle Time</label><input class="cx-input" data-f="cycleTime" inputmode="numeric" /></div>
      <div class="cx-field"><label>Output Units</label><input class="cx-input" data-f="outputUnits" inputmode="numeric" /></div>
      <div class="cx-field"><label>Preference</label><input class="cx-input" data-f="preference" inputmode="numeric" /></div>
      <div class="cx-field"><label>Tool</label><input class="cx-input" data-f="tool" /></div>
      <div data-slot="operation"></div>
      <div class="cx-field"><label>Operation Type</label><input class="cx-input" data-f="opType" /></div>
      <div class="cx-field"><label>Operation Sequence</label><input class="cx-input" data-f="seqNo" inputmode="numeric" /></div>
    </form>
  `);
}

function intOrZero(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }

async function openCreateDialog(listContainer) {
  const modal = openModal({ title: 'Create Operation', width: 720, bodyHtml: '' });
  modal.body.innerHTML = loadingState();
  try { if (!state.partCodeList.length && !state.machineList.length && !state.operationList.length) await fetchInit(); }
  catch (e) { /* dropdown fetch best-effort */ }

  const form = buildFormShell();
  modal.body.innerHTML = '';
  modal.body.appendChild(form);

  let selectedPartId = '';
  let selectedMachineId = '';
  let selectedOpId = '';

  const partCombo = createCombobox({
    options: comboOptionsFromList(state.partCodeList, 'productId', 'internalName'),
    placeholder: '--Select--',
    onChange: (id, opt) => {
      selectedPartId = id || '';
      form.querySelector('[data-f="partDescription"]').value = opt ? opt.label.split(' - ').slice(1).join(' - ') : '';
    },
  });
  form.querySelector('[data-slot="partCode"]').innerHTML = '<label style="font-size:12.5px;font-weight:600;color:var(--cx-gray-600);display:block;margin-bottom:6px">Part Code</label>';
  form.querySelector('[data-slot="partCode"]').appendChild(partCombo.el);

  const machineCombo = createCombobox({
    options: comboOptionsFromList(state.machineList, 'fixedAssetId', 'fixedAssetName'),
    placeholder: '--Select--',
    onChange: (id) => { selectedMachineId = id || ''; },
  });
  form.querySelector('[data-slot="machine"]').innerHTML = '<label style="font-size:12.5px;font-weight:600;color:var(--cx-gray-600);display:block;margin-bottom:6px">Machine</label>';
  form.querySelector('[data-slot="machine"]').appendChild(machineCombo.el);

  const opCombo = createCombobox({
    options: comboOptionsFromList(state.operationList, 'workEffortId', 'workEffortName'),
    placeholder: '--Select--',
    onChange: (id) => { selectedOpId = id || ''; },
  });
  form.querySelector('[data-slot="operation"]').innerHTML = '<label style="font-size:12.5px;font-weight:600;color:var(--cx-gray-600);display:block;margin-bottom:6px">Operation</label>';
  form.querySelector('[data-slot="operation"]').appendChild(opCombo.el);

  const errorSlot = el('<div></div>');
  modal.body.insertBefore(errorSlot, form);

  const footer = el(`
    <div class="cx-modal-footer">
      <button type="button" class="cx-btn cx-btn-secondary" data-a="cancel">Cancel</button>
      <button type="button" class="cx-btn cx-btn-primary" data-a="save">Save</button>
    </div>
  `);
  modal.overlay.querySelector('.cx-modal').appendChild(footer);
  footer.querySelector('[data-a="cancel"]').addEventListener('click', () => modal.close());
  footer.querySelector('[data-a="save"]').addEventListener('click', async () => {
    const f = (name) => form.querySelector(`[data-f="${name}"]`).value;
    const payload = {
      partCode: selectedPartId || '',
      seqNo: intOrZero(f('seqNo')),
      operation: selectedOpId || '',
      opType: f('opType'),
      tool: f('tool'),
      machine: selectedMachineId || '',
      setupTime: intOrZero(f('setupTime')),
      cycleTime: intOrZero(f('cycleTime')),
      outputUnits: intOrZero(f('outputUnits')),
      machineEfficiency: intOrZero(f('machineEfficiency')),
      preference: intOrZero(f('preference')),
    };
    try {
      const data = await callApi(ENDPOINTS.init, TXN.createMachineMapping, payload, {});
      const message = data.successMessage || data.responseMessage || 'Success';
      if (String(message).toLowerCase().includes('success')) {
        modal.close();
        toast('Operation created successfully', 'success');
        fetchList(listContainer);
      } else {
        errorSlot.innerHTML = '';
        errorSlot.appendChild(el(`<div class="cx-banner cx-banner-error">${icon('alert-circle', { size: 16 })}<span>${escapeHtml(message)}</span></div>`));
      }
    } catch (e) {
      errorSlot.innerHTML = '';
      errorSlot.appendChild(el(`<div class="cx-banner cx-banner-error">${icon('alert-circle', { size: 16 })}<span>${escapeHtml(e.details || e.message)}</span></div>`));
    }
  });
}

async function openEditDialog(listContainer, row) {
  const modal = openModal({ title: 'Edit Operation', width: 720, bodyHtml: '' });
  modal.body.innerHTML = loadingState();
  try { if (!state.partCodeList.length) await fetchInit(); } catch (e) {}

  const form = buildFormShell();
  modal.body.innerHTML = '';
  modal.body.appendChild(form);

  let selectedPartId = row.partCode || '';
  let selectedMachineId = row.machine || '';
  let selectedOpId = row.operation || '';

  form.querySelector('[data-f="machineEfficiency"]').value = row.machineEfficiency ?? 0;
  form.querySelector('[data-f="setupTime"]').value = row.setupTime ?? 0;
  form.querySelector('[data-f="cycleTime"]').value = row.cycleTime ?? 0;
  form.querySelector('[data-f="outputUnits"]').value = row.outputUnits ?? 0;
  form.querySelector('[data-f="preference"]').value = row.preference ?? 0;
  form.querySelector('[data-f="tool"]').value = row.tool || '';
  form.querySelector('[data-f="opType"]').value = row.opType || '';
  form.querySelector('[data-f="seqNo"]').value = row.seqNo ?? 0;

  const partMatch = state.partCodeList.find((p) => String(p.productId) === String(selectedPartId));
  form.querySelector('[data-slot="partCode"]').innerHTML = '<label style="font-size:12.5px;font-weight:600;color:var(--cx-gray-600);display:block;margin-bottom:6px">Part Code</label>';
  const partReadonly = el(`<input class="cx-input" readonly value="${escapeHtml(selectedPartId)}${partMatch ? ' - ' + escapeHtml(partMatch.internalName || '') : ''}" />`);
  form.querySelector('[data-slot="partCode"]').appendChild(partReadonly);
  form.querySelector('[data-f="partDescription"]').value = partMatch ? (partMatch.internalName || '') : '';

  const machineCombo = createCombobox({
    options: comboOptionsFromList(state.machineList, 'fixedAssetId', 'fixedAssetName'),
    value: selectedMachineId, placeholder: '--Select--',
    onChange: (id) => { selectedMachineId = id || ''; },
  });
  form.querySelector('[data-slot="machine"]').innerHTML = '<label style="font-size:12.5px;font-weight:600;color:var(--cx-gray-600);display:block;margin-bottom:6px">Machine</label>';
  form.querySelector('[data-slot="machine"]').appendChild(machineCombo.el);
  machineCombo.setValue(selectedMachineId);

  const opCombo = createCombobox({
    options: comboOptionsFromList(state.operationList, 'workEffortId', 'workEffortName'),
    value: selectedOpId, placeholder: '--Select--',
    onChange: (id) => { selectedOpId = id || ''; },
  });
  form.querySelector('[data-slot="operation"]').innerHTML = '<label style="font-size:12.5px;font-weight:600;color:var(--cx-gray-600);display:block;margin-bottom:6px">Operation</label>';
  form.querySelector('[data-slot="operation"]').appendChild(opCombo.el);
  opCombo.setValue(selectedOpId);

  const errorSlot = el('<div></div>');
  modal.body.insertBefore(errorSlot, form);

  const footer = el(`
    <div class="cx-modal-footer">
      <button type="button" class="cx-btn cx-btn-secondary" data-a="cancel">Cancel</button>
      <button type="button" class="cx-btn cx-btn-danger" data-a="delete">Delete</button>
      <button type="button" class="cx-btn cx-btn-primary" data-a="save">Save</button>
    </div>
  `);
  modal.overlay.querySelector('.cx-modal').appendChild(footer);
  footer.querySelector('[data-a="cancel"]').addEventListener('click', () => modal.close());
  footer.querySelector('[data-a="delete"]').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Confirm Delete', body: 'Are you sure you want to delete this operation?' });
    if (!ok) return;
    try {
      await callApi(ENDPOINTS.init, TXN.deleteMachineMapping, {
        partCode: selectedPartId, seqNo: intOrZero(form.querySelector('[data-f="seqNo"]').value),
      }, {});
      toast('Operation deleted', 'success');
    } catch (e) {
      toast(e.details || e.message || 'Delete failed', 'error');
    } finally {
      modal.close();
      fetchList(listContainer);
    }
  });
  footer.querySelector('[data-a="save"]').addEventListener('click', async () => {
    const f = (name) => form.querySelector(`[data-f="${name}"]`).value;
    const payload = {
      partCode: selectedPartId || '',
      seqNo: intOrZero(f('seqNo')),
      operation: selectedOpId || '',
      opType: f('opType'),
      tool: f('tool'),
      machine: selectedMachineId || '',
      setupTime: intOrZero(f('setupTime')),
      cycleTime: intOrZero(f('cycleTime')),
      outputUnits: intOrZero(f('outputUnits')),
      machineEfficiency: intOrZero(f('machineEfficiency')),
      preference: intOrZero(f('preference')),
    };
    try {
      const data = await callApi(ENDPOINTS.init, TXN.updateMachineMapping, payload, {});
      const message = data.successMessage || data.responseMessage || 'Success';
      if (String(message).toLowerCase().includes('success')) {
        modal.close();
        toast('Operation updated successfully', 'success');
        fetchList(listContainer);
      } else {
        errorSlot.innerHTML = '';
        errorSlot.appendChild(el(`<div class="cx-banner cx-banner-error">${icon('alert-circle', { size: 16 })}<span>${escapeHtml(message)}</span></div>`));
      }
    } catch (e) {
      errorSlot.innerHTML = '';
      errorSlot.appendChild(el(`<div class="cx-banner cx-banner-error">${icon('alert-circle', { size: 16 })}<span>${escapeHtml(e.details || e.message)}</span></div>`));
    }
  });
}

export default {
  title: 'Machine Mapping',
  async mount(container) {
    state = { loading: false, list: [], operationList: [], machineList: [], partCodeList: [], search: '', sort: { key: '', dir: 'asc' } };
    render(container);
    try { await fetchInit(); } catch (e) {}
    fetchList(container);
  },
};
