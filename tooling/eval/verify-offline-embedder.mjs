#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EMBEDDING_MODEL, createEmbedder } from '../../packages/embedder/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const modelPath = resolve(
  root,
  '.cache/transformers',
  EMBEDDING_MODEL.id,
  EMBEDDING_MODEL.revision,
);

if (!existsSync(resolve(modelPath, 'tokenizer.json'))) {
  throw new Error(`offline tokenizer is missing from ${modelPath}`);
}

const embedder = await createEmbedder(EMBEDDING_MODEL, {
  modelPath,
  allowRemoteModels: false,
});
const vector = await embedder.embedQuery('WaveCast synthetic support ticket');
if (
  vector.length !== EMBEDDING_MODEL.dimensions ||
  [...vector].some((value) => !Number.isFinite(value))
) {
  throw new Error(`offline embedder returned an invalid ${vector.length}-value vector`);
}

console.log(
  `OFFLINE EMBEDDER OK — ${embedder.modelId}@${embedder.revision}; ${vector.length} finite dimensions`,
);
