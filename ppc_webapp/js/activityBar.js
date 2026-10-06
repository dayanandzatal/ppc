import { getEntries, clearEntries, subscribe } from './apiActivity.js';
import { icon } from './icons.js';
import { escapeHtml, el } from './ui.js';

export function mountActivityBar(container) {
  let expanded = false;
  let panel = null;

  function renderBar() {
    const entries = getEntries();
    container.innerHTML = `
      <span class="cx-activity-bar-label">${icon('terminal', { size: 13 })}API Responses</span>
      <span class="cx-activity-count">${entries.length}</span>
      <span class="cx-activity-bar-spacer"></span>
      <button type="button" data-a="clear">Clear</button>
      <button type="button" data-a="expand">${expanded ? 'Collapse' : 'Expand'}</button>
    `;
    container.querySelector('[data-a="clear"]').addEventListener('click', () => clearEntries());
    container.querySelector('[data-a="expand"]').addEventListener('click', () => {
      expanded = !expanded;
      renderBar();
      renderPanel();
    });
  }

  function renderPanel() {
    if (panel) { panel.remove(); panel = null; }
    if (!expanded) return;
    const entries = getEntries();
    panel = el(`<div class="cx-activity-panel"></div>`);
    if (!entries.length) {
      panel.innerHTML = `<div class="cx-activity-empty">No API calls yet.</div>`;
    } else {
      panel.innerHTML = entries.map((e) => `
        <div class="cx-activity-row">
          <span class="dot ${e.ok ? 'ok' : 'err'}"></span>
          <span class="txn">${escapeHtml(e.txnId)}</span>
          <span class="ms">${e.ms}ms</span>
        </div>
      `).join('');
    }
    document.body.appendChild(panel);
  }

  renderBar();
  subscribe(() => { renderBar(); if (expanded) renderPanel(); });
}
