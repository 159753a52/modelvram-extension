// Pure helpers behind the panel, kept free of DOM access so they run under `node --test`.
import { GIB, WEIGHT_PRECISIONS, estimate, type ModelSpec } from './lib/vram.ts';

export const SITE = 'https://modelvram.com/llm-vram-calculator/';
export const CONTEXTS = [8192, 32768];
const ROWS = ['q4_k_m', 'q8_0', 'bf16'];
const CARDS = [8, 12, 16, 24, 32, 48, 80];
const OVERHEAD_PCT = 10;
// First path segments that are Hub sections, not model owners.
const NOT_OWNERS = new Set([
  'datasets', 'spaces', 'docs', 'blog', 'models', 'organizations', 'settings', 'papers', 'collections',
  'learn', 'posts', 'pricing', 'enterprise', 'join', 'login', 'new', 'notifications', 'chat', 'api', 'tasks',
]);

/** "owner/name" for a model page (including its /tree and /blob views), else undefined. */
export function modelIdFromPath(pathname: string): string | undefined {
  const [owner, name] = pathname.split('/').filter(Boolean);
  if (!owner || !name || NOT_OWNERS.has(owner)) return undefined;
  return /^[\w.-]+$/.test(owner) && /^[\w.-]+$/.test(name) ? `${owner}/${name}` : undefined;
}

/** Smallest common single card that holds the estimate, else how many 80 GB cards. */
export function fitLabel(totalBytes: number): string {
  const card = CARDS.find((gib) => totalBytes <= gib * GIB);
  if (card) return `${card} GB`;
  // Split across cards, each keeps some headroom; a rough count, not a tensor-parallel plan.
  return `${Math.ceil(totalBytes / (80 * GIB * 0.9))}× 80 GB`;
}

export function rowsFor(spec: ModelSpec) {
  return ROWS.map((id) => {
    const precision = WEIGHT_PRECISIONS.find((p) => p.id === id)!;
    const totals = CONTEXTS.map((context) => estimate(spec, precision, context, 1, 16, OVERHEAD_PCT).total);
    return { label: precision.label.replace('GGUF ', ''), totals, fit: fitLabel(totals[0]) };
  });
}

export function calculatorLink(id: string): string {
  const query = new URLSearchParams({ model: id, precision: 'q4_k_m', context: '8192', requests: '1', kv: 'fp16' });
  return `${SITE}?${query}&utm_source=hf-extension`;
}
