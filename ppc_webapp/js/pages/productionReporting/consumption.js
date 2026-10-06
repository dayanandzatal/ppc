// Production Reporting — Consumption Reporting screen.
// Route: /production-reporting/consumption/:id  (id = production run group id)
// See spec: production_reporting.md §3.
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

const BOM_ITEM = 'BOM Item';
const ADDITIONAL_ITEM = 'Additional Item';

function freshState(id) {
  return {
    id: id || null,
    perms: Session.getPrPerms(),
    loading: true,
    groupId: PrState.getGroupId() || (id || ''),
    facilityId: PrState.getFacilityId() || '',
    statusId: PrState.getStatusId() || 'PROD_GROUP_CREATED',
    statusIdforConsumption: PrState.getConsumptionStatus() || 'PROD_GROUP_CREATED',
    productDropdown: [],
    // add-product toolbar
    productId: '', productUom: '', productQoh: '', productAtp: '', reGrinded: 'No',
    quantity: '', itemType: BOM_ITEM,
    // main data
    rows: [], cancelScrap: [],
    editResponseExists: false, // GET_CONSUMPTION_DETAILS returned data
    totalScrap: '0.0',
    // table UX (search/sort). Main table is search-only (see visibleRows note);
    // the read-only Scrap Details table gets full search+sort.
    search: '',
    scrapSearch: '', scrapSort: { key: '', dir: 'asc' },
  };
}

const MAIN_COLUMNS = [
  { key: 'productIdName', label: 'Product Id/Name' },
  { key: 'uom', label: 'UOM' },
  { key: 'type', label: 'Type' },
  { key: 'stdQty', label: 'Std Quantity', value: (r) => fx(r.stdQty) },
  { key: 'lumbs', label: 'Lumps', value: (r) => fx(r.lumbs) },
  { key: 'actualQty', label: 'Actual Qty' },
  { key: 'qoh', label: 'QOH' },
];

const SCRAP_COLUMNS = [
  { key: 'machineName', label: 'Machine No' },
  { key: 'scrapProductName', label: 'Product Id/Name', value: (r) => `${r.scrapProductName} [${r.scrapProductId}]` },
  { key: 'grossWt', label: 'Gross Wt' },
  { key: 'netWt', label: 'Net Wt' },
  { key: 'uomDesc', label: 'UOM' },
  { key: 'acceptedQty', label: 'Accepted Qty' },
  { key: 'totalScrapQty', label: 'Total Scrap' },
  { key: 'unitCost', label: 'Unit Cost' },
  { key: 'locationDesc', label: 'Location', value: (r) => r.locationDesc || r.locationId },
];

// Filtered view of the main consumption rows. NOT sorted: the editable Actual Qty
// column plus the synthetic Total row make a stable order the least surprising
// choice, so we offer search + export only here. Returned entries are the SAME
// object references as state.rows, so edits via rows[idx] persist correctly.
function visibleMainRows() {
  return filterRows(state.rows, state.search, ['productIdName', 'uom', 'type']);
}

// Scrap Details rows are read-only (plus a remove button), so full search + sort
// is safe. Returned entries share references with state.cancelScrap; removal
// resolves the real index via indexOf so it never targets the wrong scrap line.
function visibleScrapRows() {
  const filtered = filterRows(state.cancelScrap, state.scrapSearch, ['machineName', 'scrapProductName', 'scrapProductId', 'locationDesc']);
  return applySort(filtered, state.scrapSort);
}

/* ---------------- number helpers ---------------- */
function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
function fx(v, d = 2) { return num(v).toFixed(d); }

/* ---------------- init loads ---------------- */
async function loadStatusIfNeeded() {
  // When arriving via a direct URL we may not have PrState. Fetch the group
  // status + facility so the screen behaves correctly.
  if (state.statusId && state.facilityId && PrState.getGroupId()) return;
  try {
    const data = await callApi(ENDPOINTS.init, TXN.editReporting,
      { productionRunGroupId: String(state.groupId) }, {});
    const raw = data.statusId || '';
    state.statusIdforConsumption = raw;
    state.statusId = (raw === 'PROD_GROUP_SUBMITTED' || raw === 'PROD_GROUP_CREATED') ? 'PROD_GROUP_CREATED' : '';
    state.facilityId = data.facilityId || state.facilityId;
    PrState.setGroupId(state.groupId);
    PrState.setFacilityId(state.facilityId);
    PrState.setStatusId(state.statusId);
    PrState.setConsumptionStatus(state.statusIdforConsumption);
  } catch (e) { /* best-effort */ }
}

async function loadProductDropdown() {
  const data = await callApi(ENDPOINTS.init, TXN.getConsumptionProduct,
    { facilityId: String(state.facilityId) }, {});
  state.productDropdown = data.productDetails || [];
}

function mapFgDetail(d, opts = {}) {
  return {
    newStdQty: d.newStdQty != null ? String(d.newStdQty) : '0',
    fgQuantity: d.quantityToProduce != null ? String(d.quantityToProduce) : (d.fgQuantity != null ? String(d.fgQuantity) : ''),
    productIdInvType: d.inventoryItemTypeId || d.productIdInvType || '',
    rejectedQty: d.fgRejectedQty != null ? String(d.fgRejectedQty) : (d.rejectedQty != null ? String(d.rejectedQty) : ''),
    scrapQty: d.fgScrapFactor != null ? String(d.fgScrapFactor) : (d.scrapQty != null ? String(d.scrapQty) : '0.0'),
    workEffortParentId: d.workEffortParentId || '',
    workEffortChildId: d.workEffortChildId || '',
    productId: d.productId || '',
    machineNumber: d.machineNumber || '',
    routingId: d.routingId || '',
    productName: d.productName || '',
    productIdTo: d.productIdTo || '',
    bomQty: d.bomQty != null ? String(d.bomQty) : '',
    quantityToProduce: d.quantityToProduce != null ? String(d.quantityToProduce) : '',
    stdQty: opts.stdQty != null ? String(opts.stdQty) : (d.stdQty != null ? String(d.stdQty) : '0'),
    uom: d.uom || '',
  };
}

async function loadBomItems() {
  // Bulk-load initial BOM breakdown (GET_BOM_ITEMS).
  const data = await callApi(ENDPOINTS.init, TXN.getBomItem,
    { productionRunGroupId: String(state.groupId), productId: '', facilityId: String(state.facilityId) }, {});
  const rmProducts = data.rmProducts || [];
  state.rows = rmProducts.map((rm) => ({
    addedNew: true,
    reGrindedMaterial: false,
    type: BOM_ITEM,
    productId: rm.rmProductId || '',
    productIdName: rm.rmProductName || '',
    uom: rm.uomDesc || '',
    stdQty: rm.stdQty != null ? String(rm.stdQty) : '0',
    scrapFactor: '0',
    lumbs: '0.0',
    actualQty: rm.stdQty != null ? String(rm.stdQty) : '0',
    qoh: rm.qoh != null ? String(rm.qoh) : '',
    hasManualInput: false,
    reportingLocal: (rm.productDetails || []).map((d) => mapFgDetail(d)),
  }));
}

async function loadConsumptionDetails() {
  const data = await callApi(ENDPOINTS.init, TXN.viewConsumptionReporting,
    { productionRunGroupId: String(state.groupId) }, {});
  state.editResponseExists = true;
  const reGrinded = data.isReGrinded === true;
  const list = data.consumptionProductList || [];
  state.rows = list.map((p) => {
    const stdQty = reGrinded && String(p.reGrindedStandardQuantity) !== '0'
      ? String(p.reGrindedStandardQuantity) : String(p.stdQty);
    const type = num(p.stdQty) !== 0 ? BOM_ITEM : ADDITIONAL_ITEM;
    return {
      addedNew: false,
      reGrindedMaterial: p.reGrindedMaterial === true,
      type,
      productId: p.rmProductId || '',
      productIdName: `${p.rmProductName || ''} [${p.rmProductId || ''}]`,
      uom: p.uomDesc || '',
      stdQty,
      scrapFactor: p.scrapFactor != null ? String(p.scrapFactor) : '0',
      lumbs: p.lumps != null ? String(p.lumps) : '0.0',
      actualQty: p.quantity != null ? String(p.quantity) : '0',
      qoh: p.qoh != null ? String(p.qoh) : '',
      hasManualInput: true,
      reportingLocal: (p.fgProductList || []).map((d) => mapFgDetail(d, {
        stdQty: reGrinded ? d.fgReGrindedStandardQuantity : d.stdQty,
      })),
    };
  });
  // scrap product list -> cancelScrap (Scrap Details table)
  state.cancelScrap = (data.scrapProductList || []).map((s) => {
    const totalScrapQty = ((num(s.grossWt) - num(s.netWt)) * num(s.totalQty)).toFixed(2);
    return {
      workEffortId: s.workEffortId || '', machineName: s.machineName || '',
      scrapProductId: s.scrapProductId || '', scrapProductName: s.scrapProductName || '',
      grossWt: s.grossWt || '', netWt: s.netWt || '', uomDesc: s.uomDesc || '',
      acceptedQty: s.acceptedQty != null ? String(s.acceptedQty) : '', totalQty: s.totalQty != null ? String(s.totalQty) : '',
      unitCost: s.unitCost || '', locationId: s.locationSeqId || '', locationDesc: s.locationDesc || '',
      totalScrapQty,
    };
  });
}

/* ---------------- totals ---------------- */
function computeTotals() {
  let tScrap = 0, tStd = 0, tActual = 0;
  state.rows.forEach((r) => { tScrap += num(r.scrapFactor); tStd += num(r.stdQty); tActual += num(r.actualQty); });
  state.totalScrap = tScrap.toFixed(4);
  return { tScrap: tScrap.toFixed(2), tStd: tStd.toFixed(2), tActual: tActual.toFixed(2) };
}

// Auto-recompute a row's actual qty unless manually edited.
// expectedActualQty = effStdQty + scrapFactor ; effStdQty = regrind?0:(newStdQty||stdQty)
function recomputeActual(r) {
  if (r.hasManualInput) return;
  const effStd = r.reGrindedMaterial ? 0 : num(r.stdQty);
  r.actualQty = (effStd + num(r.scrapFactor)).toFixed(2);
}

/* ---------------- product dropdown select ---------------- */
function onProductSelect(id) {
  state.productId = id || '';
  const p = state.productDropdown.find((x) => String(x.productId) === String(id));
  if (p) {
    state.productUom = p.uomDesc || '';
    state.productQoh = p.qoh != null ? String(p.qoh) : '';
    state.productAtp = p.atp != null ? String(p.atp) : '';
    state.reGrinded = p.reGrindedMaterial != null ? String(p.reGrindedMaterial) : 'No';
  } else {
    state.productUom = ''; state.productQoh = ''; state.productAtp = ''; state.reGrinded = 'No';
  }
}

/* ---------------- Add BOM / Additional item ---------------- */
async function onAdd(container) {
  const banner = container.querySelector('#prBanner');
  const err = (m) => mountBanner(banner, { type: 'error', message: m, autoHideMs: 4500 });
  if (!state.productId) return err('Please select a Product.');
  const p = state.productDropdown.find((x) => String(x.productId) === String(state.productId));
  const productLabel = p ? `${p.productName} [${p.productId}]` : state.productId;

  if (state.itemType === ADDITIONAL_ITEM) {
    if (!state.quantity || num(state.quantity) <= 0) return err('Please enter a Quantity.');
    if (state.rows.some((r) => String(r.productId) === String(state.productId)))
      return err('This product is already added.');
    let listRows = [];
    try {
      const data = await callApi(ENDPOINTS.init, TXN.getAddScarp, { productionRunGroupId: String(state.groupId) }, {});
      listRows = data.productDetails || [];
    } catch (e) { return err(e.details || e.message || 'Failed to load items'); }
    openSelectionDialog(container, ADDITIONAL_ITEM, productLabel, listRows);
  } else {
    if (state.rows.some((r) => String(r.productId) === String(state.productId)))
      return err('This product is already added.');
    let listRows = [];
    try {
      const data = await callApi(ENDPOINTS.init, TXN.getBomAddtionalItem,
        { productionRunGroupId: String(state.groupId), productId: String(state.productId) }, {});
      listRows = data.productDetails || [];
    } catch (e) { return err(e.details || e.message || 'Failed to load items'); }
    openSelectionDialog(container, BOM_ITEM, productLabel, listRows);
  }
}

// Selection dialog: pick FG rows to include, then build a consumption row.
// NOTE: regrind proportional-split math is simplified — we use the standard
// non-regrind path (totalStdQty = sum of selected stdQty), which covers the
// overwhelming majority of usage. Regrind redistribution is not replicated.
function openSelectionDialog(container, valueName, productLabel, listRows) {
  const modal = openModal({ title: `${valueName} : ${productLabel}`, width: 900 });
  const selected = new Set();
  function draw() {
    modal.body.innerHTML = `
      <div class="cx-table-wrap"><div class="cx-table-scroll" style="max-height:420px;overflow-y:auto">
        ${!listRows.length ? emptyState('No items') : `
          <table class="cx-table"><thead><tr>
            <th class="cx-cell-center"><input type="checkbox" id="selAll" /></th>
            <th class="cx-cell-center">Sl.No</th><th>Machine No</th><th>Product Id/Name</th>
            <th class="cx-cell-center">Produced Qty</th><th class="cx-cell-center">UOM</th>
          </tr></thead><tbody>${listRows.map((d, i) => `<tr>
            <td class="cx-cell-center"><input type="checkbox" data-sel="${i}" ${selected.has(i) ? 'checked' : ''} /></td>
            <td class="cx-cell-center">${i + 1}</td>
            <td>${escapeHtml(d.machineNumber || '')}</td>
            <td>${escapeHtml(`${d.productName || ''} [${d.productId || ''}]`)}</td>
            <td class="cx-cell-center">${escapeHtml(String(d.quantityToProduce != null ? d.quantityToProduce : ''))}</td>
            <td class="cx-cell-center">${escapeHtml(d.uom || '')}</td>
          </tr>`).join('')}</tbody></table>`}
      </div></div>
      <div class="cx-modal-footer">
        <button type="button" class="cx-btn cx-btn-secondary" data-a="cancel">Cancel</button>
        <button type="button" class="cx-btn cx-btn-primary" data-a="add">Add</button>
      </div>`;
    const selAll = modal.body.querySelector('#selAll');
    if (selAll) selAll.addEventListener('change', (e) => {
      selected.clear();
      if (e.target.checked) listRows.forEach((_, i) => selected.add(i));
      draw();
    });
    modal.body.querySelectorAll('[data-sel]').forEach((cb) => cb.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.sel);
      if (e.target.checked) selected.add(i); else selected.delete(i);
    }));
    modal.body.querySelector('[data-a="cancel"]').addEventListener('click', () => modal.close());
    modal.body.querySelector('[data-a="add"]').addEventListener('click', () => {
      const picks = Array.from(selected).map((i) => listRows[i]);
      if (!picks.length) { toast('Please select at least one item', 'error'); return; }
      const totalStdQty = picks.reduce((a, d) => a + num(d.stdQty), 0).toFixed(4);
      const reportingLocal = picks.map((d) => mapFgDetail(d));
      state.rows.push({
        addedNew: true, reGrindedMaterial: false, type: valueName,
        productId: state.productId, productIdName: productLabel,
        uom: state.productUom,
        stdQty: valueName === BOM_ITEM ? totalStdQty : '0',
        scrapFactor: '0', lumbs: '0.0',
        actualQty: valueName === BOM_ITEM ? totalStdQty : String(state.quantity),
        qoh: state.productQoh, hasManualInput: valueName !== BOM_ITEM,
        reportingLocal,
      });
      // reset toolbar
      state.productId = ''; state.productUom = ''; state.quantity = '';
      modal.close();
      render(container);
    });
  }
  draw();
}

/* ---------------- Add Lumps (simplified) ---------------- */
// NOTE (simplification): Add Lumps in the original app feeds the proportional
// regrind scrap-split. We implement a pragmatic version: pick items, enter a
// Scrap Qty (Gram) per item, and roll the sum into the row's scrapFactor/lumps.
async function onAddLumps(container) {
  let listRows = [];
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getAddScarp, { productionRunGroupId: String(state.groupId) }, {});
    listRows = data.productDetails || [];
  } catch (e) { toast(e.details || e.message || 'Failed to load lumps', 'error'); return; }
  const modal = openModal({ title: 'Add Lumps', width: 820 });
  const scrapById = {};
  modal.body.innerHTML = `
    <div class="cx-table-wrap"><div class="cx-table-scroll" style="max-height:400px;overflow-y:auto">
      ${!listRows.length ? emptyState('No items') : `
        <table class="cx-table"><thead><tr>
          <th class="cx-cell-center">Sl.No</th><th>Machine No</th><th>Product Id/Name</th><th class="cx-cell-center">Scrap Qty (Gram)</th>
        </tr></thead><tbody>${listRows.map((d, i) => `<tr>
          <td class="cx-cell-center">${i + 1}</td>
          <td>${escapeHtml(d.machineNumber || '')}</td>
          <td>${escapeHtml(`${d.productName || ''} [${d.productId || ''}]`)}</td>
          <td class="cx-cell-center"><input class="cx-input" style="width:110px" data-scrap="${i}" inputmode="decimal" value="0" /></td>
        </tr>`).join('')}</tbody></table>`}
    </div></div>
    <div class="cx-modal-footer">
      <button type="button" class="cx-btn cx-btn-secondary" data-a="cancel">Cancel</button>
      <button type="button" class="cx-btn cx-btn-primary" data-a="save">Add</button>
    </div>`;
  modal.body.querySelectorAll('[data-scrap]').forEach((inp) => inp.addEventListener('input', (e) => {
    scrapById[e.target.dataset.scrap] = e.target.value;
  }));
  modal.body.querySelector('[data-a="cancel"]').addEventListener('click', () => modal.close());
  modal.body.querySelector('[data-a="save"]').addEventListener('click', () => {
    const totalScrap = Object.values(scrapById).reduce((a, v) => a + num(v), 0);
    if (totalScrap <= 0) { toast('Enter a scrap quantity', 'error'); modal.close(); return; }
    // Apply lumps scrap to the last BOM-item row (pragmatic mapping).
    const target = [...state.rows].reverse().find((r) => r.type === BOM_ITEM);
    if (target) {
      target.scrapFactor = (num(target.scrapFactor) + totalScrap).toFixed(4);
      target.lumbs = (num(target.lumbs) + totalScrap).toFixed(4);
      recomputeActual(target);
    }
    modal.close();
    render(container);
  });
}

/* ---------------- Add Scrap ---------------- */
async function onAddScrap(container) {
  let scrapRows = [];
  try {
    const data = await callApi(ENDPOINTS.init, TXN.getAddScarpDetails,
      { productionRunGroupId: String(state.groupId), facilityId: String(state.facilityId) }, {});
    scrapRows = data.scrapDetails || [];
  } catch (e) { toast(e.details || e.message || 'Failed to load scrap details', 'error'); return; }

  const modal = openModal({ title: 'Add Scrap', width: 1000 });
  const selected = new Set();
  const locSel = {}; // idx -> locationSeqId

  function totalScrapFor(d) {
    const acc = num(d.totalQty);
    return acc === 0 ? '0.00' : ((num(d.grossWt) - num(d.netWt)) * acc).toFixed(2);
  }
  function draw() {
    modal.body.innerHTML = `
      <div id="scrapErr"></div>
      <div class="cx-table-wrap"><div class="cx-table-scroll" style="max-height:440px;overflow-y:auto">
        ${!scrapRows.length ? emptyState('No scrap') : `
          <table class="cx-table"><thead><tr>
            <th class="cx-cell-center"><input type="checkbox" id="selAll" /></th>
            <th class="cx-cell-center">Sl.No</th><th>Machine No</th><th>Product Id/Name</th>
            <th class="cx-cell-center">Gross Wt</th><th class="cx-cell-center">Net Wt</th><th class="cx-cell-center">UOM</th>
            <th class="cx-cell-center">Accepted Qty</th><th class="cx-cell-center">Total Scrap</th><th>Location</th>
          </tr></thead><tbody>${scrapRows.map((d, i) => `<tr>
            <td class="cx-cell-center"><input type="checkbox" data-sel="${i}" ${selected.has(i) ? 'checked' : ''} /></td>
            <td class="cx-cell-center">${i + 1}</td>
            <td>${escapeHtml(d.machineName || '')}</td>
            <td>${escapeHtml(`${d.scrapProductName || ''} [${d.scrapProductId || ''}]`)}</td>
            <td class="cx-cell-center">${escapeHtml(String(d.grossWt || ''))}</td>
            <td class="cx-cell-center">${escapeHtml(String(d.netWt || ''))}</td>
            <td class="cx-cell-center">${escapeHtml(d.uomDesc || '')}</td>
            <td class="cx-cell-center">${escapeHtml(String(d.totalQty != null ? d.totalQty : ''))}</td>
            <td class="cx-cell-center">${totalScrapFor(d)}</td>
            <td data-locslot="${i}"></td>
          </tr>`).join('')}</tbody></table>`}
      </div></div>
      <div class="cx-modal-footer">
        <button type="button" class="cx-btn cx-btn-secondary" data-a="cancel">Cancel</button>
        <button type="button" class="cx-btn cx-btn-primary" data-a="add">Add</button>
      </div>`;
    scrapRows.forEach((d, i) => {
      const slot = modal.body.querySelector(`[data-locslot="${i}"]`);
      if (!slot) return;
      const combo = createCombobox({
        options: (d.locationList || []).map((l) => ({ id: l.locationSeqId, label: l.locationSeqId || l.areaId })),
        value: locSel[i] || '', placeholder: '--Select--',
        onChange: (id) => { locSel[i] = id || ''; },
      });
      slot.appendChild(combo.el);
    });
    const selAll = modal.body.querySelector('#selAll');
    if (selAll) selAll.addEventListener('change', (e) => {
      selected.clear();
      if (e.target.checked) {
        // select-all only picks rows with acceptedQty>0 && location set
        scrapRows.forEach((d, i) => { if (num(d.totalQty) > 0 && locSel[i]) selected.add(i); });
        if (!selected.size) mountBanner(modal.body.querySelector('#scrapErr'),
          { type: 'error', message: 'No items can be selected. Make sure Accepted Qty is more than 0 and Location is selected.', autoHideMs: 5000 });
      }
      draw();
    });
    modal.body.querySelectorAll('[data-sel]').forEach((cb) => cb.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.sel);
      if (e.target.checked) {
        if (num(scrapRows[i].totalQty) === 0) {
          e.target.checked = false;
          mountBanner(modal.body.querySelector('#scrapErr'), { type: 'error', message: 'Accepted Qty cannot be empty or 0', autoHideMs: 4000 });
          return;
        }
        selected.add(i);
      } else selected.delete(i);
    }));
    modal.body.querySelector('[data-a="cancel"]').addEventListener('click', () => modal.close());
    modal.body.querySelector('[data-a="add"]').addEventListener('click', () => {
      const picks = Array.from(selected).map((i) => ({ d: scrapRows[i], loc: locSel[i] || '' }));
      picks.forEach(({ d, loc }) => {
        state.cancelScrap.push({
          workEffortId: d.workEffortId || '', machineName: d.machineName || '',
          scrapProductId: d.scrapProductId || '', scrapProductName: d.scrapProductName || '',
          grossWt: d.grossWt || '', netWt: d.netWt || '', uomDesc: d.uomDesc || '',
          acceptedQty: d.totalQty != null ? String(d.totalQty) : '', totalQty: d.totalQty != null ? String(d.totalQty) : '',
          unitCost: d.unitCost || '', locationId: loc, locationDesc: loc,
          totalScrapQty: totalScrapFor(d),
        });
      });
      modal.close();
      render(container);
    });
  }
  draw();
}

/* ---------------- remove main row ---------------- */
async function removeRow(container, row) {
  const ok = await confirmDialog({ title: 'Delete', body: 'Are you sure you would like to delete?' });
  if (!ok) return;
  const realIdx = state.rows.indexOf(row);
  if (realIdx < 0) return;
  if (row.addedNew) { state.rows.splice(realIdx, 1); render(container); return; }
  const fgProductList = (row.reportingLocal || []).map((d) => ({
    fgProductId: d.productId, workEffortChildId: d.workEffortChildId, workEffortParentId: d.workEffortParentId,
  }));
  try {
    await callApi(ENDPOINTS.init, TXN.removeConsumerAPI, { rmProductId: row.productId, fgProductList }, {});
    state.rows.splice(realIdx, 1);
    render(container);
  } catch (e) { toast(e.details || e.message || 'Remove failed', 'error'); }
}

/* ---------------- View BOM detail popup ---------------- */
function openViewDetail(row) {
  const modal = openModal({ title: `${row.type} : ${row.productIdName}`, width: 900 });
  modal.body.innerHTML = `
    <div class="cx-table-wrap"><div class="cx-table-scroll" style="max-height:420px;overflow-y:auto">
      ${!(row.reportingLocal || []).length ? emptyState('No details') : `
        <table class="cx-table"><thead><tr>
          <th class="cx-cell-center">Sl.No</th><th>Machine No</th><th>Product Id/Name</th><th class="cx-cell-center">Produced Qty</th><th class="cx-cell-center">UOM</th>
        </tr></thead><tbody>${row.reportingLocal.map((d, i) => `<tr>
          <td class="cx-cell-center">${i + 1}</td>
          <td>${escapeHtml(d.machineNumber || '')}</td>
          <td>${escapeHtml(`${d.productName || ''} [${d.productId || ''}]`)}</td>
          <td class="cx-cell-center">${escapeHtml(d.quantityToProduce || '')}</td>
          <td class="cx-cell-center">${escapeHtml(d.uom || '')}</td>
        </tr>`).join('')}</tbody></table>`}
    </div></div>
    <div class="cx-modal-footer"><button type="button" class="cx-btn cx-btn-primary" data-a="close">Close</button></div>`;
  modal.body.querySelector('[data-a="close"]').addEventListener('click', () => modal.close());
}

/* ---------------- Submit / Complete / Cancel ---------------- */
function buildConsumptionProductList(complete) {
  return state.rows.map((r) => {
    const typeApi = r.type === BOM_ITEM ? 'BOM_ITEM' : 'ADDITIONAL_ITEM';
    if (complete) {
      return {
        lumps: r.lumbs || '0.0', rmProductId: r.productId, type: typeApi,
        quantity: r.actualQty || '0', scrapFactor: r.scrapFactor || '0', standardQty: r.stdQty || '0',
        fgProductList: (r.reportingLocal || []).map((d) => ({
          fgGrindedStdQty: d.stdQty || '0', productIdInvType: d.productIdInvType || '',
          fgScrapFactor: d.scrapQty && d.scrapQty !== 'null' ? d.scrapQty : '0.0',
          fgRejectedQty: d.rejectedQty || '', fgQuantity: d.fgQuantity || '',
          fgProductId: d.productId, workEffortChildId: d.workEffortChildId, workEffortParentId: d.workEffortParentId,
        })),
      };
    }
    return {
      rmProductId: r.productId, type: typeApi, quantity: r.actualQty || '0',
      scrapFactor: r.scrapFactor || '0', standardQty: r.stdQty || '0', lumbs: r.lumbs || '0',
      fgProductList: (r.reportingLocal || []).map((d) => ({
        fgGrindedStdQty: d.newStdQty || '0', fgProductId: d.productId,
        workEffortChildId: d.workEffortChildId, workEffortParentId: d.workEffortParentId,
        fgScrapFactor: d.scrapQty || '0.0',
      })),
    };
  });
}
function buildScrapList() {
  return state.cancelScrap.map((s) => ({
    locationSeqId: s.locationId || '', productId: s.scrapProductId || '',
    quantity: s.totalScrapQty || '0', workEffortId: s.workEffortId || '',
  }));
}

async function doSubmit(container) {
  const ok = await confirmDialog({ title: 'Submit', body: 'Are you sure you would like to submit?', confirmLabel: 'Submit', danger: false });
  if (!ok) return;
  computeTotals();
  const payload = {
    productionRunGroupId: String(state.groupId), facilityId: String(state.facilityId),
    totalScrap: state.totalScrap,
    consumptionProductList: buildConsumptionProductList(false),
    scrapProductList: buildScrapList(),
  };
  try {
    await callApi(ENDPOINTS.init, TXN.submitBomItem, payload, {});
    openSummary(container);
  } catch (e) { toast(e.details || e.message || 'Submit failed', 'error'); }
}

async function doComplete(container) {
  const ok = await confirmDialog({ title: 'Complete', body: 'Are you sure you would like to complete?', confirmLabel: 'Complete', danger: false });
  if (!ok) return;
  const payload = {
    docType: 'P', fromAction: 'PR_S_L',
    productionRunGroupId: String(state.groupId), facilityId: String(state.facilityId),
    consumptionProductList: buildConsumptionProductList(true),
    scrapDetails: buildScrapList(),
  };
  try {
    await callApi(ENDPOINTS.init, TXN.completeConsumption, payload, {});
    openSummary(container);
  } catch (e) { toast(e.details || e.message || 'Complete failed', 'error'); }
}

async function doCancel() {
  const ok = await confirmDialog({ title: 'Cancel', body: 'Are you sure you would like to cancel?' });
  if (!ok) return;
  try {
    await callApi(ENDPOINTS.init, TXN.cancelConsumption, { productionRunGroupId: String(state.groupId) }, {});
    PrState.clear();
    window.location.hash = '#/production-reporting';
    toast('Cancelled Successfully', 'success');
  } catch (e) { toast(e.details || e.message || 'Cancel failed', 'error'); }
}

/* ---------------- View Summary popup ---------------- */
async function openSummary(container) {
  const modal = openModal({ title: 'Summary', width: 720 });
  modal.body.innerHTML = loadingState();
  let s = {};
  try {
    const data = await callApi(ENDPOINTS.init, TXN.viewSummary, { productionRunGroupId: String(state.groupId) }, {});
    s = data.summaryList || {};
  } catch (e) { toast(e.details || e.message || 'Failed to load summary', 'error'); modal.close(); return; }

  const isDraft = state.statusId === 'PROD_GROUP_CREATED';
  const row = (label, val) => `<div style="display:flex;gap:6px;margin-bottom:6px"><span style="font-weight:600">${label} :</span><span>${escapeHtml(String(val != null ? val : ''))}</span></div>`;
  modal.body.innerHTML = `
    <div id="sumErr"></div>
    ${row('Total Input', s.totalInput)}
    ${row('Total Output', s.totalOutput)}
    ${row('Difference', s.difference)}
    ${row('Differential Ratio', s.differentialRatio)}
    <div style="height:8px"></div>
    ${row('Total Rejection', s.totalRejection)}
    ${row('Wastage Percentage', s.wastagePercentage)}
    <div class="cx-field cx-mt-16"><label>Reason (if any)</label>
      <textarea class="cx-input" id="remarks" ${isDraft ? '' : 'readonly'}>${escapeHtml(s.remarks || '')}</textarea></div>
    <div class="cx-modal-footer"><button type="button" class="cx-btn cx-btn-primary" data-a="go">${isDraft ? 'Confirm' : 'Next'}</button></div>
  `;
  modal.body.querySelector('[data-a="go"]').addEventListener('click', async () => {
    if (isDraft) {
      const remarks = modal.body.querySelector('#remarks').value;
      try {
        await callApi(ENDPOINTS.init, TXN.finalComplete, { productionRunGroupId: String(state.groupId), remarks }, {});
        modal.close();
        PrState.clear();
        window.location.hash = '#/production-reporting';
        toast('Submitted Successfully', 'success');
      } catch (e) { mountBanner(modal.body.querySelector('#sumErr'), { type: 'error', message: e.details || e.message, autoHideMs: 5000 }); }
    } else {
      modal.close();
      const dl = await confirmDialog({
        title: 'Download', body: `Do you want to download the report for this production : ${state.groupId} ?`,
        confirmLabel: 'Yes', cancelLabel: 'No', danger: false,
      });
      if (dl) {
        try {
          const data = await callApi(ENDPOINTS.init, TXN.downLoadProductionRunPdf,
            { productionRunGroupId: String(state.groupId), docTypeId: 'PROD_RUN_GROUP', documentName: 'Production Run Group' }, {});
          if (data && data.encodedData) downloadPdf(data.encodedData, `daily_production_${state.groupId}.pdf`);
        } catch (e) { toast(e.details || e.message || 'Download failed', 'error'); }
      }
      PrState.clear();
      window.location.hash = '#/production-reporting';
    }
  });
}

function downloadPdf(encodedData, filename) {
  const bytes = Uint8Array.from(atob(encodedData), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------------- render ---------------- */
function bottomActions() {
  // statusId != CREATED -> read-only "Next" (view summary)
  if (state.statusId !== 'PROD_GROUP_CREATED') return { kind: 'next' };
  const draftFirst = state.statusIdforConsumption === 'PROD_GROUP_CREATED';
  if (!draftFirst && state.perms.PR_COMPLETE && state.rows.length) return { kind: 'complete' };
  if (state.perms.PR_SUBMIT) return { kind: 'submit' };
  return { kind: 'none' };
}

function mainRowHtml(r, idx) {
  const editable = state.statusId === 'PROD_GROUP_CREATED';
  const canRemove = editable && state.perms.PR_SUBMIT && !r.reGrindedMaterial;
  return `
    <tr data-idx="${idx}">
      <td class="cx-cell-center">${idx + 1}</td>
      <td>${escapeHtml(r.productIdName)}</td>
      <td class="cx-cell-center">${escapeHtml(r.uom || '')}</td>
      <td class="cx-cell-center">${escapeHtml(r.type)}</td>
      <td class="cx-cell-center">${escapeHtml(fx(r.stdQty))}</td>
      <td class="cx-cell-center">${escapeHtml(fx(r.lumbs))}</td>
      <td class="cx-cell-center"><input class="cx-input" style="width:96px" data-a="actual" data-idx="${idx}" value="${escapeHtml(r.actualQty)}" ${editable ? '' : 'readonly'} /></td>
      <td class="cx-cell-center">${escapeHtml(r.qoh || '')}</td>
      <td class="cx-cell-center" style="white-space:nowrap">
        <button type="button" class="cx-row-action" data-a="view" data-idx="${idx}" title="View">${icon('eye', { size: 15 })}</button>
        ${canRemove ? `<button type="button" class="cx-row-action" data-a="remove" data-idx="${idx}" title="Remove">${icon('trash', { size: 15 })}</button>` : ''}
      </td>
    </tr>`;
}

function render(container) {
  if (state.loading) { container.innerHTML = `<div class="cx-page-header"><h1><span class="cx-page-icon">${icon('package', { size: 18 })}</span>Consumption Reporting</h1></div>${loadingState()}`; return; }
  const editable = state.statusId === 'PROD_GROUP_CREATED';
  const t = computeTotals();
  const mainRows = visibleMainRows();
  const scrapRows = visibleScrapRows();
  const title = (state.id != null && state.statusId !== 'PROD_GROUP_CREATED')
    ? `View Consumption Reporting ${escapeHtml(String(state.groupId))}` : 'Consumption Reporting';
  const actions = bottomActions();

  container.innerHTML = `
    <div class="cx-page-header"><h1><span class="cx-page-icon">${icon('package', { size: 18 })}</span>${title}</h1></div>
    <div id="prBanner"></div>

    ${editable ? `
    <div class="cx-card">
      <div class="cx-grid cx-grid-4" style="align-items:end">
        <div class="cx-field"><label>Product</label><div data-slot="product"></div>
          ${state.productUom ? `<span class="cx-field-hint">UOM: ${escapeHtml(state.productUom)}</span>` : ''}</div>
        ${state.itemType === ADDITIONAL_ITEM ? `<div class="cx-field"><label>Quantity</label><input class="cx-input" id="qtyInput" inputmode="decimal" value="${escapeHtml(state.quantity)}" /></div>` : ''}
        <div class="cx-field"><label>Type</label>
          <div style="display:flex;gap:14px;height:38px;align-items:center">
            <label class="cx-checkbox"><input type="radio" name="itemType" value="${BOM_ITEM}" ${state.itemType === BOM_ITEM ? 'checked' : ''} />BOM Item</label>
            <label class="cx-checkbox"><input type="radio" name="itemType" value="${ADDITIONAL_ITEM}" ${state.itemType === ADDITIONAL_ITEM ? 'checked' : ''} />Additional Item</label>
          </div>
        </div>
        <div class="cx-field"><label>&nbsp;</label><button type="button" class="cx-btn cx-btn-primary" id="btnAddProduct">${icon('plus', { size: 15 })}Add</button></div>
      </div>
      <div class="cx-flex cx-mt-12" style="gap:12px">
        <button type="button" class="cx-btn cx-btn-secondary" id="btnAddLumps">Add Lumps</button>
        <button type="button" class="cx-btn cx-btn-secondary" id="btnAddScrap">Add Scrap</button>
      </div>
    </div>` : ''}

    ${state.rows.length ? '<div id="consToolbar"></div>' : ''}
    <div class="cx-table-wrap cx-mt-16"><div class="cx-table-scroll">
      ${!state.rows.length ? emptyState('No items') : (!mainRows.length ? emptyState('No results match your search.') : `
        <table class="cx-table"><thead><tr>
          <th class="cx-cell-center">Sl.No</th><th>Product Id/Name</th><th class="cx-cell-center">UOM</th><th class="cx-cell-center">Type</th>
          <th class="cx-cell-center">Std Quantity</th><th class="cx-cell-center">Lumps</th><th class="cx-cell-center">Actual Qty</th>
          <th class="cx-cell-center">QOH</th><th class="cx-cell-center">Action</th>
        </tr></thead><tbody>${mainRows.map(mainRowHtml).join('')}
          ${state.search ? '' : `<tr style="font-weight:700;background:var(--cx-gray-50)">
            <td class="cx-cell-center" colspan="4">Total</td>
            <td class="cx-cell-center">${t.tStd}</td>
            <td class="cx-cell-center">${t.tScrap}</td>
            <td class="cx-cell-center">${t.tActual}</td>
            <td colspan="2"></td>
          </tr>`}
        </tbody></table>`)}
    </div></div>

    ${state.cancelScrap.length ? `
      <div class="cx-card-title cx-mt-16">Scrap Details</div>
      <div id="scrapToolbar"></div>
      <div class="cx-table-wrap"><div class="cx-table-scroll">
        ${!scrapRows.length ? emptyState('No results match your search.') : `
        <table class="cx-table"><thead><tr>
          <th class="cx-cell-center">Sl.No</th>
          ${sortableTh('Machine No', 'machineName', state.scrapSort, () => render(container))}
          ${sortableTh('Product Id/Name', 'scrapProductName', state.scrapSort, () => render(container))}
          ${sortableTh('Gross Wt', 'grossWt', state.scrapSort, () => render(container), 'cx-cell-center')}
          ${sortableTh('Net Wt', 'netWt', state.scrapSort, () => render(container), 'cx-cell-center')}
          ${sortableTh('UOM', 'uomDesc', state.scrapSort, () => render(container), 'cx-cell-center')}
          ${sortableTh('Accepted Qty', 'acceptedQty', state.scrapSort, () => render(container), 'cx-cell-center')}
          ${sortableTh('Total Scrap', 'totalScrapQty', state.scrapSort, () => render(container), 'cx-cell-center')}
          ${sortableTh('Unit Cost', 'unitCost', state.scrapSort, () => render(container), 'cx-cell-center')}
          ${sortableTh('Location', 'locationDesc', state.scrapSort, () => render(container))}
          ${editable ? '<th class="cx-cell-center">Remove</th>' : ''}
        </tr></thead><tbody>${scrapRows.map((s, i) => `<tr data-scrapidx="${i}">
          <td class="cx-cell-center">${i + 1}</td>
          <td>${escapeHtml(s.machineName)}</td>
          <td>${escapeHtml(`${s.scrapProductName} [${s.scrapProductId}]`)}</td>
          <td class="cx-cell-center">${escapeHtml(String(s.grossWt))}</td>
          <td class="cx-cell-center">${escapeHtml(String(s.netWt))}</td>
          <td class="cx-cell-center">${escapeHtml(s.uomDesc)}</td>
          <td class="cx-cell-center">${escapeHtml(String(s.acceptedQty))}</td>
          <td class="cx-cell-center">${escapeHtml(String(s.totalScrapQty))}</td>
          <td class="cx-cell-center">${escapeHtml(String(s.unitCost))}</td>
          <td>${escapeHtml(s.locationDesc || s.locationId)}</td>
          ${editable ? `<td class="cx-cell-center"><button type="button" class="cx-row-action" data-scrapdel="${i}">${icon('trash', { size: 15 })}</button></td>` : ''}
        </tr>`).join('')}</tbody></table>`}
      </div></div>` : ''}

    ${state.rows.length || actions.kind === 'next' ? `<div class="cx-flex-center cx-mt-16" style="gap:16px" id="actionBar"></div>` : ''}
  `;

  if (editable) wireToolbar(container);

  // Main consumption table: search + export (no sort — see visibleMainRows note).
  if (state.rows.length) {
    const toolbar = renderTableToolbar({
      placeholder: 'Search product, type...',
      countLabel: `${mainRows.length} of ${state.rows.length}`,
      onSearch: (q) => { state.search = q; render(container); },
      onExportCsv: () => exportToCsv('consumption-items', MAIN_COLUMNS, mainRows),
      onExportExcel: () => exportToExcel('consumption-items', MAIN_COLUMNS, mainRows),
    });
    const slot = container.querySelector('#consToolbar');
    if (slot) slot.appendChild(toolbar);
  }

  // Scrap Details table: search + sort + export.
  if (state.cancelScrap.length) {
    const scrapToolbar = renderTableToolbar({
      placeholder: 'Search machine, product, location...',
      countLabel: `${scrapRows.length} of ${state.cancelScrap.length}`,
      onSearch: (q) => { state.scrapSearch = q; render(container); },
      onExportCsv: () => exportToCsv('scrap-details', SCRAP_COLUMNS, scrapRows),
      onExportExcel: () => exportToExcel('scrap-details', SCRAP_COLUMNS, scrapRows),
    });
    const slot = container.querySelector('#scrapToolbar');
    if (slot) slot.appendChild(scrapToolbar);
    wireSortableHeaders(container, state.scrapSort, () => render(container));
  }

  // Handlers index into the SAME filtered arrays that produced the DOM; each
  // entry is a shared reference into state.rows / state.cancelScrap, so edits and
  // removals target the correct line regardless of active search/sort.
  container.querySelectorAll('[data-a="actual"]').forEach((inp) => inp.addEventListener('change', (e) => {
    const r = mainRows[Number(e.target.dataset.idx)];
    r.actualQty = e.target.value;
    r.hasManualInput = true;
  }));
  container.querySelectorAll('[data-a="view"]').forEach((b) => b.addEventListener('click', (e) => openViewDetail(mainRows[Number(e.currentTarget.dataset.idx)])));
  container.querySelectorAll('[data-a="remove"]').forEach((b) => b.addEventListener('click', (e) => removeRow(container, mainRows[Number(e.currentTarget.dataset.idx)])));
  container.querySelectorAll('[data-scrapdel]').forEach((b) => b.addEventListener('click', (e) => {
    const s = scrapRows[Number(e.currentTarget.dataset.scrapdel)];
    const realIdx = state.cancelScrap.indexOf(s);
    if (realIdx >= 0) state.cancelScrap.splice(realIdx, 1);
    render(container);
  }));

  const bar = container.querySelector('#actionBar');
  if (bar) {
    if (actions.kind === 'submit') {
      const b = el(`<button type="button" class="cx-btn cx-btn-primary">Submit</button>`);
      b.addEventListener('click', () => doSubmit(container));
      bar.appendChild(b);
    } else if (actions.kind === 'complete') {
      const c = el(`<button type="button" class="cx-btn cx-btn-primary">Complete</button>`);
      c.addEventListener('click', () => doComplete(container));
      const x = el(`<button type="button" class="cx-btn cx-btn-danger">Cancel</button>`);
      x.addEventListener('click', () => doCancel());
      bar.appendChild(c); bar.appendChild(x);
    } else if (actions.kind === 'next') {
      const n = el(`<button type="button" class="cx-btn cx-btn-primary">Next</button>`);
      n.addEventListener('click', () => openSummary(container));
      bar.appendChild(n);
    }
  }
}

function wireToolbar(container) {
  const productCombo = createCombobox({
    options: state.productDropdown.map((p) => ({ id: p.productId, label: `${p.productName} [${p.productId}]` })),
    value: state.productId, placeholder: '--Select--',
    onChange: (id) => { onProductSelect(id); render(container); },
  });
  container.querySelector('[data-slot="product"]').appendChild(productCombo.el);

  const qtyInput = container.querySelector('#qtyInput');
  if (qtyInput) qtyInput.addEventListener('input', (e) => { state.quantity = e.target.value; });

  container.querySelectorAll('input[name="itemType"]').forEach((r) => r.addEventListener('change', (e) => {
    state.itemType = e.target.value; render(container);
  }));

  container.querySelector('#btnAddProduct').addEventListener('click', () => onAdd(container));
  container.querySelector('#btnAddLumps').addEventListener('click', () => onAddLumps(container));
  container.querySelector('#btnAddScrap').addEventListener('click', () => onAddScrap(container));
}

export default {
  title: 'Consumption Reporting',
  async mount(container, params) {
    state = freshState(params && params.id);
    render(container);
    await loadStatusIfNeeded();
    try {
      if (state.statusId === 'PROD_GROUP_CREATED') {
        await loadProductDropdown();
        if (state.statusIdforConsumption !== 'PROD_GROUP_CREATED') {
          // existing (submitted) group being viewed with edit rights
          await loadConsumptionDetails();
        } else {
          await loadBomItems();
        }
      } else {
        // completed / cancelled -> read-only view of prior submission
        await loadConsumptionDetails();
      }
    } catch (e) {
      toast(e.details || e.message || 'Failed to load consumption', 'error');
    }
    state.loading = false;
    render(container);
  },
};
