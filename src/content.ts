// Shows how much GPU memory a Hugging Face model needs, right on its model page.
// Reads only public Hub endpoints (config.json, safetensors metadata, file list) from
// huggingface.co itself; nothing is sent anywhere else and nothing is stored.
import { calculatorLink, modelIdFromPath, rowsFor } from './estimate.ts';
import { loadFromHub } from './lib/hf.ts';
import { formatGib, type ModelSpec } from './lib/vram.ts';

const PANEL_ID = 'modelvram-panel';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, style?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (style) node.style.cssText = style;
  return node;
}

function panelShell(id: string): HTMLElement {
  document.getElementById(PANEL_ID)?.remove();
  const dark = matchMedia('(prefers-color-scheme: dark)').matches || document.documentElement.classList.contains('dark');
  const panel = el(
    'aside',
    undefined,
    `position:fixed;right:16px;bottom:16px;z-index:2147483000;width:300px;` +
      `background:${dark ? '#111827' : '#fff'};color:${dark ? '#f3f4f6' : '#111827'};` +
      `border:1px solid ${dark ? '#374151' : '#d1d5db'};border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.2);` +
      'font:13px/1.4 system-ui,-apple-system,sans-serif;padding:12px 14px;',
  );
  panel.id = PANEL_ID;
  panel.setAttribute('role', 'complementary');
  panel.setAttribute('aria-label', 'VRAM estimate');
  const head = el('div', undefined, 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;');
  head.append(el('strong', 'VRAM estimate', 'font-size:14px;'));
  const close = el('button', '×', 'border:0;background:none;font-size:18px;cursor:pointer;color:inherit;opacity:.6;padding:0 4px;');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close the VRAM estimate');
  close.addEventListener('click', () => {
    sessionStorage.setItem(`modelvram-hidden:${id}`, '1');
    panel.remove();
  });
  head.append(close);
  const body = el('div');
  panel.append(head, body);
  document.body.append(panel);
  return body;
}

function renderEstimate(body: HTMLElement, id: string, spec: ModelSpec) {
  const cell = 'padding:3px 4px;text-align:right;border-bottom:1px solid rgba(128,128,128,.25);';
  const table = el('table', undefined, 'width:100%;border-collapse:collapse;margin:4px 0 8px;');
  const header = el('tr');
  for (const [i, text] of ['', '8K ctx', '32K ctx', 'fits'].entries()) {
    const th = el('th', text, cell + (i === 0 ? 'text-align:left;' : '') + 'font-weight:600;');
    th.scope = 'col';
    header.append(th);
  }
  table.append(header);
  for (const row of rowsFor(spec)) {
    const tr = el('tr');
    const th = el('th', row.label, cell + 'text-align:left;font-weight:400;');
    th.scope = 'row';
    tr.append(th);
    for (const total of row.totals) tr.append(el('td', formatGib(total), cell));
    tr.append(el('td', row.fit, cell));
    table.append(tr);
  }
  const note = el(
    'p',
    'One request, FP16 KV cache, 0.5 GB + 10% runtime overhead. Estimates, not measured peaks.',
    'margin:0 0 8px;opacity:.7;font-size:12px;',
  );
  body.append(table, note);
  if (spec.kvNote) body.append(el('p', spec.kvNote, 'margin:0 0 8px;font-size:12px;'));
  const link = el('a', 'Change quant, context and GPU on modelvram.com →', 'color:#14b8a6;font-weight:600;text-decoration:none;');
  link.href = calculatorLink(id);
  link.target = '_blank';
  link.rel = 'noopener';
  body.append(link);
}

let shownFor: string | undefined;

async function update() {
  const id = modelIdFromPath(location.pathname);
  if (id === shownFor) return;
  shownFor = id;
  document.getElementById(PANEL_ID)?.remove();
  if (!id || sessionStorage.getItem(`modelvram-hidden:${id}`)) return;
  let spec: ModelSpec;
  try {
    spec = await loadFromHub(id);
  } catch (error) {
    // Not a language model or no safetensors: show nothing rather than a guess. Gated models
    // get the reason, since their numbers can still be entered on the site by hand.
    if (id === shownFor && error instanceof Error && /gated/.test(error.message)) {
      const body = panelShell(id);
      body.textContent = 'This model is gated, so its config.json needs a login. ';
      const link = el('a', 'Enter its numbers on modelvram.com →', 'color:#14b8a6;font-weight:600;');
      link.href = calculatorLink(id);
      link.target = '_blank';
      link.rel = 'noopener';
      body.append(link);
    }
    return;
  }
  if (id === shownFor) renderEstimate(panelShell(id), id, spec);
}

void update();
// The Hub changes pages without full reloads in places, so follow the address.
let lastPath = location.pathname;
setInterval(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    void update();
  }
}, 1000);
