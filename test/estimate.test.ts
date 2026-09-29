import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatorLink, fitLabel, modelIdFromPath, rowsFor } from '../src/estimate.ts';
import { GIB, kvCacheBytes, slidingCells, type ModelSpec } from '../src/lib/vram.ts';
import { specFromHub } from '../src/lib/hf.ts';

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
test('KV cache as llama.cpp allocates it: Gemma 4 global V kept, sliding windows at window + ubatch', () => {
  const gemma = specFromHub(
    'google/gemma-4-31B-it',
    {
      text_config: {
        num_hidden_layers: 60, num_attention_heads: 32, num_key_value_heads: 16, head_dim: 256,
        num_global_key_value_heads: 4, global_head_dim: 512, attention_k_eq_v: true, sliding_window: 1024,
        layer_types: [...Array(50).fill('sliding_attention'), ...Array(10).fill('full_attention')],
      },
    },
    { safetensors: { total: 31_273_088_876 } },
  );
  assert.deepEqual([gemma.vHeadDim, gemma.kEqV], [undefined, true]);
  // 10 global layers × 4 × (512 + 512) per token; 50 sliding layers × 1,536 cells × 16 × (256 + 256).
  assert.equal(kvCacheBytes(gemma, 262_144, 1, 16), (10 * 262_144 * 4_096 + 50 * 1_536 * 8_192) * 2);
  assert.deepEqual([slidingCells(128, 32_768), slidingCells(1024, 4096), slidingCells(1024, 62_080, 4)], [768, 1536, 4608]);
  // llama.cpp#15789: gpt-oss-20b, f16, 32,768 cells: 768.00 MiB + SWA 18.00 MiB.
  const gptOss: ModelSpec = { id: 'openai/gpt-oss-20b', name: 'gpt-oss-20b', params: 20_914_757_184, layers: 24, kvHeads: 8, headDim: 64, slidingLayers: 12, slidingWindow: 128 };
  assert.equal(kvCacheBytes(gptOss, 32_768, 1, 16), (768 + 18) * 1024 ** 2);
});
