import test from 'node:test';
import assert from 'node:assert/strict';
import { examples, planDemoRequest, protocols } from '../src/admin-v2/model-link-demo.mjs';

test('model link replay picks an available priority group before weighting and forwarding', () => {
  const plan = planDemoRequest(examples.find(example => example.protocol === 'chat' && example.hit === 'B'));
  assert.deepEqual(plan.group, ['glm-A', 'glm-B']);
  assert.deepEqual(plan.standby, ['glm-D']);
  assert.equal(plan.chosen, 'glm-B');
  const fromGroup = plan.steps.findIndex(step => step.stage === 'group');
  assert.deepEqual(plan.steps.slice(fromGroup, fromGroup + 3).map(step => step.stage || step.to),
    ['group', 'chosen', 'glm-B-conversion']);
  assert.equal(plan.steps[fromGroup + 2].message, 'OpenAI Chat → Anthropic Messages');
  const stopped = planDemoRequest(examples.find(example => example.service === 'r1'));
  assert(!stopped.steps.some(step => step.to?.endsWith('-policy')));
  assert.match(stopped.steps.at(-1).message, /服务已停止/);
});

test('all seven formats have playable examples and video submissions end with a task id', () => {
  assert.deepEqual(new Set(examples.map(example => example.protocol)), new Set(Object.keys(protocols)));
  for (const example of examples) {
    const plan = planDemoRequest(example);
    if (example.service !== 'r1') assert(plan.chosen, example.protocol);
    if (example.service === 'video') {
      assert.match(plan.steps.at(-1).message, /任务已受理 · 返回任务 ID/);
      assert(plan.steps.some(step => step.message.startsWith('原生转发 · ' + protocols[example.protocol].name)));
      assert.equal(plan.group.length, 1);
    }
  }
});
