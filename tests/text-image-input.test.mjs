import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as root from '../src/text-image-input.mjs';
import * as version512 from '../versions/moma_5.12.0_estack/src/text-image-input.mjs';

const kimi = { type: 'text', inputModalities: ['text', 'image'] };
const image = { type: 'image/png', size: 1024 };
for (const [version, { imageInputError, supportsImageInput }] of [['5.11.0', root], ['5.12.0', version512]]) {
test(`${version}: image input follows model capability, including language models`, () => {
  assert.equal(supportsImageInput(kimi), true);
  for (const model of [undefined, { type: 'multimodal' }, { inputModalities: ['text'] }]) {
    assert.equal(supportsImageInput(model), false);
    assert.match(imageInputError(model, [image]), /不支持图片/);
  }
  assert.equal(imageInputError(kimi, [image]), '');
});
test(`${version}: reject non-images, empty, oversized and too many images without relying on extensions`, () => {
  for (const type of ['video/mp4', 'application/pdf', 'image/svg+xml', '']) {
    assert.match(imageInputError(kimi, [{ name: 'file.png', type, size: 1024 }]), /仅支持/);
  }
  for (const size of [0, 5 * 1024 * 1024 + 1]) {
    assert.match(imageInputError(kimi, [{ ...image, size }]), /5 MB/);
  }
  assert.equal(imageInputError(kimi, [{ ...image, size: 5 * 1024 * 1024 }]), '');
  assert.match(imageInputError(kimi, [image, image], 3), /4 张/);
  assert.equal(imageInputError(kimi, [image], 3), '');
});
}
