import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatorLink, fitLabel, modelIdFromPath, rowsFor } from '../src/estimate.ts';
import { GIB, type ModelSpec } from '../src/lib/vram.ts';

test('model ids come only from model pages', () => {
  assert.equal(modelIdFromPath('/Qwen/Qwen3.8-27B'), 'Qwen/Qwen3.8-27B');
  assert.equal(modelIdFromPath('/Qwen/Qwen3.8-27B/tree/main'), 'Qwen/Qwen3.8-27B');
  assert.equal(modelIdFromPath('/datasets/foo/bar'), undefined);
  assert.equal(modelIdFromPath('/spaces/foo/bar'), undefined);
  assert.equal(modelIdFromPath('/Qwen'), undefined);
  assert.equal(modelIdFromPath('/'), undefined);
});

test('fit labels pick the smallest card, then counts 80 GB cards', () => {
  assert.equal(fitLabel(7.9 * GIB), '8 GB');
  assert.equal(fitLabel(18.3 * GIB), '24 GB');
  assert.equal(fitLabel(100 * GIB), '2× 80 GB');
});

test('Llama 3.1 8B: Q4_K_M, Q8_0 and BF16 rows match the site', () => {
  const llama: ModelSpec = { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', params: 8_030_261_248, layers: 32, kvHeads: 8, headDim: 128, maxContext: 131_072 };
  const [q4, q8, bf16] = rowsFor(llama);
  assert.deepEqual([q4.label, q8.label, bf16.label], ['Q4_K_M', 'Q8_0', 'FP16 / BF16']);
  // Same formula as the calculator: 4.84 bpw weights + 1 GiB FP16 KV at 8K + 0.5 GiB + 10%.
  const expected = ((8_030_261_248 * 4.84) / 8 + GIB) * 1.1 + 0.5 * GIB;
  assert.ok(Math.abs(q4.totals[0] - expected) < 1);
  assert.equal(q4.fit, '8 GB');
  assert.ok(q4.totals[1] > q4.totals[0]);
});

test('the site link carries the model and a source tag', () => {
  const url = new URL(calculatorLink('Qwen/Qwen3.8-27B'));
  assert.equal(url.origin + url.pathname, 'https://modelvram.com/llm-vram-calculator/');
  assert.equal(url.searchParams.get('model'), 'Qwen/Qwen3.8-27B');
  assert.equal(url.searchParams.get('utm_source'), 'hf-extension');
});
