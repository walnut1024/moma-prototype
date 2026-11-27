import assert from 'node:assert/strict';
import test from 'node:test';
import { modelHubCandidates } from '../src/admin-v2/model-hub-candidates.js';

const qwenRepository = 'Qwen/Qwen2.5-7B-Instruct-GGUF';
const catalog = { 'ops-model-library': [{
  id: 'catalog-repository-choices', name: 'Deployment Candidate', modelCode: 'linked-model',
  specs: [
    { source: 'huggingface', repository: 'Example/HF-Model', filename: 'weights-q2_k.gguf' },
    { source: 'huggingface', repository: 'Example/HF-Model', filename: 'weights-q2_k.gguf' },
    { source: 'model_scope', repository: 'Example/MS-Model' },
  ],
}, {
  id: 'catalog-glm52', name: 'GLM-5.2', source: 'Hugging Face', repository: 'zai-org/GLM-5.2-FP8',
}] };

test('derives repository names from the chosen hub specifications and preserves MoMA model links', () => {
  const hf = modelHubCandidates(catalog, 'Hugging Face');
  const ms = modelHubCandidates(catalog, 'ModelScope');
  assert.deepEqual(hf.map(row => row.repository), ['Example/HF-Model', 'zai-org/GLM-5.2-FP8', qwenRepository]);
  assert.deepEqual(ms.map(row => row.repository), ['Example/MS-Model', 'ZhipuAI/GLM-5.2-FP8', qwenRepository]);
  assert.deepEqual(hf[0].files, ['weights-q2_k.gguf']);
  assert.equal(hf[0].fileOptions[0].quantization, 'Q2_K');
  assert.equal(ms[0].modelCode, 'linked-model');
  assert.equal(ms[0].repositoryUrl, 'https://modelscope.cn/models/Example/MS-Model');
  assert.deepEqual(modelHubCandidates(catalog, '本地路径'), []);
});

test('each official Qwen GGUF repository has nine equivalent choices with complete, size-sorted shard groups', () => {
  const [hf,ms] = ['Hugging Face','ModelScope'].map(source => modelHubCandidates({}, source)[0]);
  assert.equal(hf.repository, qwenRepository);
  assert.equal(ms.repository, qwenRepository);
  assert.equal(hf.format, 'GGUF');
  assert.equal(hf.revision, 'main');
  assert.equal(ms.revision, 'master');
  assert.equal(hf.files.length, 9);
  assert.deepEqual(hf.fileOptions, ms.fileOptions);
  assert.equal(hf.files[0], 'qwen2.5-7b-instruct-q2_k.gguf');
  const quant = hf.fileOptions.find(file => file.quantization === 'Q4_K_M');
  assert.equal(quant.value, 'qwen2.5-7b-instruct-q4_k_m-*.gguf');
  assert.equal(quant.parts.length, 2);
  assert.equal(quant.sizeBytes, 4683073632);
  assert.equal(hf.fileOptions.reduce((count, file) => count + (file.parts.length || 1), 0), 19);
  assert(hf.fileOptions.every((file, index, all) => !index || file.sizeBytes >= all[index - 1].sizeBytes));
});

test('omits auxiliary GGUF files and groups only a verified complete set of numbered shards', () => {
  const parts = {
    'ops-model-library': [{ id: 'catalog-gguf-example', name: 'Quantized model', specs: [
      'weights/mmproj-q2_k.gguf', 'weights/imatrix.gguf', 'weights/main-q4_k_m-00002-of-00002.gguf',
      'weights/main-q4_k_m-00001-of-00002.gguf', 'weights/partial-q8_0-00001-of-00002.gguf',
    ].map(filename => ({ repository: 'Example/Quantized', source: 'huggingface', filename })) }],
  };
  const [candidate] = modelHubCandidates(parts, 'Hugging Face');
  assert.deepEqual(candidate.files, ['weights/main-q4_k_m-*.gguf', 'weights/partial-q8_0-00001-of-00002.gguf']);
  assert.deepEqual(candidate.fileOptions[0].parts.map(item => item.path), [
    'weights/main-q4_k_m-00001-of-00002.gguf', 'weights/main-q4_k_m-00002-of-00002.gguf',
  ]);
  assert.equal(candidate.fileOptions[0].sizeBytes, undefined);
});
