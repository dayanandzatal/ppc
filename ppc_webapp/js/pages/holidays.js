// Holidays — list + create/edit dialog. See scratchpad spec: holidays_mrp_output.md
import { callApi, ENDPOINTS, TXN } from '../api.js';
import { icon } from '../icons.js';
import {
  el, escapeHtml, toast, openModal, confirmDialog, loadingState, emptyState,
  renderTableToolbar, filterRows, sortableTh, wireSortableHeaders, applySort,
  exportToCsv, exportToExcel,
} from '../ui.js';

const COLUMNS = [
  { key: 'holidayDate', label: 'Date' },
  { key: 'reason', label: 'Holiday Name' },
];

let state = { loading: false, list: [], search: '', sort: { key: '', dir: 'asc' } };

async function fetchList(container) {
  state.loading = true;
  render(container);
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getHolidaysList, { holidayId: '', holidayDate: '' }, {});
    state.list = data.holidaysList || [];
  } catch (e) {
    toast(e.details || e.message || 'Failed to load holidays list', 'error');
  } finally {
    state.loading = false;
    render(container);
  }
}

function row(r, idx) {
  return `
    <tr data-idx="${idx}">
      <td class="cx-cell-center">${idx + 1}</td>
      <td class="cx-cell-center">${escapeHtml(r.holidayDate || '')}</td>
      <td>${escapeHtml(r.reason || '')}</td>
      <td class="cx-cell-actions">
        <button type="button" class="cx-row-action" data-a="edit" title="Edit">${icon('edit', { size: 15 })}</button>
      </td>
    </tr>`;
}

function visibleRows() {
  const filtered = filterRows(state.list, state.search, ['holidayDate', 'reason']);
  return applySort(filtered, state.sort);
}

function render(container) {
  const rows = visibleRows();
  container.innerHTML = `
    <div class="cx-page-header">
      <h1><span class="cx-page-icon">${icon('event-available', { size: 18 })}</span>Holidays</h1>
      <div class="cx-page-header-actions">
        <button type="button" class="cx-btn cx-btn-primary" id="btnAdd">${icon('plus', { size: 16 })}Add Holiday</button>
      </div>
    </div>
    <div id="hdToolbar"></div>
    <div class="cx-table-wrap">
      <div class="cx-table-scroll">
        ${state.loading
          ? loadingState()
          : (!rows.length
              ? emptyState(state.search ? 'No results match your search.' : 'No Data Found!')
              : `<table class="cx-table"><thead><tr>
                  <th class="cx-cell-center">Sr No</th>
                  ${sortableTh('Date', 'holidayDate', state.sort, () => render(container), 'cx-cell-center')}
                  ${sortableTh('Holiday Name', 'reason', state.sort, () => render(container))}
                  <th>Edit</th>
                 </tr></thead><tbody>${rows.map(row).join('')}</tbody></table>`)}
      </div>
    </div>
  `;

  if (!state.loading) {
    const toolbar = renderTableToolbar({
      placeholder: 'Search date, holiday name...',
      countLabel: `${rows.length} of ${state.list.length}`,
      onSearch: (q) => { state.search = q; render(container); },
      onExportCsv: () => exportToCsv('holidays', COLUMNS, rows),
      onExportExcel: () => exportToExcel('holidays', COLUMNS, rows),
    });
    document.getElementById('hdToolbar').appendChild(toolbar);
    wireSortableHeaders(container, state.sort, () => render(container));
  }

  document.getElementById('btnAdd').addEventListener('click', () => openDialog(container));
  container.querySelectorAll('[data-a="edit"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = Number(e.target.closest('tr').dataset.idx);
      openDialog(container, rows[idx]);
    });
  });
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function openDialog(listContainer, existing) {
  const isEdit = !!existing;
  const modal = openModal({
    title: isEdit ? 'Edit Holiday' : 'Create Holiday',
    width: 520,
    bodyHtml: `
      <div id="hdError"></div>
      <div class="cx-grid cx-grid-2">
        <div class="cx-field"><label>Date<span class="req">*</span></label>
          <input class="cx-input" type="date" id="hdDate" value="${escapeHtml(existing ? existing.holidayDate : todayIso())}" />
        </div>
        <div class="cx-field"><label>Holiday Name<span class="req">*</span></label>
          <input class="cx-input" id="hdName" value="${escapeHtml(existing ? existing.reason : '')}" placeholder="Holiday Name" />
        </div>
      </div>
    `,
  });
  const footer = el(`
    <div class="cx-modal-footer">
      <button type="button" class="cx-btn cx-btn-secondary" data-a="cancel">Cancel</button>
      ${isEdit ? '<button type="button" class="cx-btn cx-btn-danger" data-a="delete">Delete</button>' : ''}
      <button type="button" class="cx-btn cx-btn-primary" data-a="save">Save</button>
    </div>
  `);
  modal.overlay.querySelector('.cx-modal').appendChild(footer);
  const errorSlot = document.getElementById('hdError');

  function showErr(msg) {
    errorSlot.innerHTML = `<div class="cx-banner cx-banner-error">${icon('alert-circle', { size: 16 })}<span>${escapeHtml(msg)}</span></div>`;
  }

  footer.querySelector('[data-a="cancel"]').addEventListener('click', () => modal.close());

  if (isEdit) {
    footer.querySelector('[data-a="delete"]').addEventListener('click', async () => {
      if (!existing.holidayId) { showErr('Holiday Id is missing.'); return; }
      const ok = await confirmDialog({ title: 'Confirm Delete', body: 'Are you sure you want to delete this holiday?' });
      if (!ok) return;
      try {
        await callApi(ENDPOINTS.init, TXN.deleteHolidays, { holidayId: existing.holidayId }, {});
        modal.close();
        toast('Holiday deleted', 'success');
        fetchList(listContainer);
      } catch (e) {
        showErr(e.details || e.message || 'Failed to delete holiday');
      }
    });
  }

  footer.querySelector('[data-a="save"]').addEventListener('click', async () => {
    const date = document.getElementById('hdDate').value.trim();
    const name = document.getElementById('hdName').value.trim();
    if (!date || !name) { showErr('Date and Holiday Name are mandatory.'); return; }
    try {
      if (isEdit) {
        await callApi(ENDPOINTS.init, TXN.updateHolidays, { holidayId: existing.holidayId, reason: name, holidayDate: date }, {});
        toast('Holiday updated successfully', 'success');
      } else {
        await callApi(ENDPOINTS.init, TXN.createHolidays, { reason: name, holidayDate: date }, {});
        toast('Holiday created successfully', 'success');
      }
      modal.close();
      fetchList(listContainer);
    } catch (e) {
      showErr(e.details || e.message || (isEdit ? 'Failed to update holiday' : 'Failed to create holiday'));
    }
  });
}

export default {
  title: 'Holidays',
  async mount(container) {
    state = { loading: false, list: [], search: '', sort: { key: '', dir: 'asc' } };
    fetchList(container);
  },
};
