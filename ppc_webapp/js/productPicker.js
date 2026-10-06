// Shared "Product Search" popup used by Transfer and MRP Output (and any other
// screen that needs the PRODUCT_LOOKUP_INIT / PRODUCT_LOOKUP_LIST flow).
// Mirrors transfer_api_provider.dart's getProductNamepopupDropdown/createInspecPopup.
import { callApi, ENDPOINTS, TXN } from './api.js';
import { el, escapeHtml, openModal, loadingState, createCombobox, toast } from './ui.js';

let cachedCategoryList = null;
let cachedTypeList = null;

async function ensureInitLists() {
  if (cachedCategoryList && cachedTypeList) return;
  const data = await callApi(ENDPOINTS.init, TXN.productLookupInit, {}, {});
  cachedCategoryList = data.productCategoryList || [];
  cachedTypeList = data.productTypeList || [];
}

/**
 * Opens the Product Search modal. Resolves with { productId, internalName } or null if cancelled.
 */
export function openProductSearchPopup() {
  return new Promise(async (resolve) => {
    const modal = openModal({ title: 'Product Search', width: 1000, bodyHtml: loadingState() });
    let resolved = false;
    modal.overlay.addEventListener('remove', () => {}); // no-op, close handled below
    const origClose = modal.close;
    modal.close = () => { if (!resolved) { resolved = true; resolve(null); } origClose(); };

    try { await ensureInitLists(); } catch (e) { toast('Failed to load product search filters', 'error'); }

    modal.body.innerHTML = `
      <div class="cx-grid cx-grid-3 cx-mb-16">
        <div class="cx-field"><label>Product Id</label><input class="cx-input" id="ppProductId" maxlength="20" autofocus /></div>
        <div class="cx-field"><label>Product Name</label><input class="cx-input" id="ppProductName" /></div>
        <div class="cx-field"><label>Product Category</label><div data-slot="cat"></div></div>
      </div>
      <div class="cx-grid cx-grid-3 cx-mb-16">
        <div class="cx-field"><label>Product Type</label><div data-slot="type"></div></div>
        <div class="cx-field" style="align-self:end"><button type="button" class="cx-btn cx-btn-primary cx-w-full" id="ppSearchBtn">${'Search'}</button></div>
      </div>
      <div id="ppResults"></div>
    `;
    let categoryId = '';
    let typeId = '';
    const catCombo = createCombobox({
      options: cachedCategoryList.map((c) => ({ id: c.productCategoryId, label: c.description })),
      placeholder: '--Select--', allowClear: true,
      onChange: (id) => { categoryId = id || ''; },
    });
    modal.body.querySelector('[data-slot="cat"]').appendChild(catCombo.el);
    const typeCombo = createCombobox({
      options: cachedTypeList.map((t) => ({ id: t.productTypeId, label: t.description })),
      placeholder: '--Select--', allowClear: true,
      onChange: (id) => { typeId = id || ''; },
    });
    modal.body.querySelector('[data-slot="type"]').appendChild(typeCombo.el);

    async function doSearch() {
      const resultsEl = document.getElementById('ppResults');
      resultsEl.innerHTML = loadingState();
      try {
        const data = await callApi(ENDPOINTS.init, TXN.searchProductIdLookUp, {
          productId: document.getElementById('ppProductId').value.trim(),
          productName: document.getElementById('ppProductName').value.trim(),
          productTypeId: typeId,
          productCategoryId: categoryId,
        }, {});
        const list = data.productIdList || [];
        if (!list.length) {
          resultsEl.innerHTML = `<div class="cx-empty-state" style="padding:24px">No Result Found !</div>`;
          return;
        }
        resultsEl.innerHTML = `
          <div class="cx-table-wrap"><div class="cx-table-scroll">
            <table class="cx-table"><thead><tr><th>S No.</th><th>Product Name/ID</th><th>Product Type</th><th>Product Category</th></tr></thead>
            <tbody>${list.map((p, i) => `
              <tr data-i="${i}">
                <td>${i + 1}</td>
                <td><a href="#" class="pp-row-pick" data-i="${i}">${escapeHtml(p.internalName || '')} [${escapeHtml(p.productId || '')}]</a></td>
                <td>${escapeHtml(p.prodTypeDesc || '')}</td>
                <td>${escapeHtml(p.prodCategopryDesc || '')}</td>
              </tr>`).join('')}</tbody></table>
          </div></div>`;
        resultsEl.querySelectorAll('.pp-row-pick').forEach((a) => {
          a.addEventListener('click', (e) => {
            e.preventDefault();
            const idx = Number(a.dataset.i);
            const chosen = list[idx];
            resolved = true;
            resolve({ productId: chosen.productId, internalName: chosen.internalName });
            origClose();
          });
        });
      } catch (e) {
        resultsEl.innerHTML = `<div class="cx-banner cx-banner-error">${escapeHtml(e.details || e.message || 'Search failed')}</div>`;
      }
    }
    document.getElementById('ppSearchBtn').addEventListener('click', doSearch);
  });
}
