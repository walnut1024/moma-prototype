import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readProjectScope, useProjectSelection } from '../src/useProjectSelection.js';
import { workspaceStoragePrefix } from '../src/workspace-storage.mjs';

test('project pages auto-select a sole project and require selection for multiple projects and honor valid remembered or explicit selections', t => {
  const owner = 'account:enterprise';
  const projects = [
    { id: 'paused', status: '停用' },
    { id: 'first', status: '正常' },
    { id: 'second', status: '正常' },
  ];
  const selectionKey = workspaceStoragePrefix + 'selected-project:';
  const selections = new Map([[selectionKey + 'account:personal', 'second']]);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true, value: { getItem: key => selections.get(key) ?? null },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor);
    else delete globalThis.sessionStorage;
  });

  function Selection({ query, visible }) {
    const { project } = useProjectSelection(owner, visible, readProjectScope(new URLSearchParams(query)));
    return project?.id || 'none';
  }
  const selected = (query = '', visible = projects) => renderToStaticMarkup(createElement(Selection, { query, visible }));
  assert.equal(selected(), 'none');
  assert.equal(selected('', [projects[1]]), 'first');
  assert.equal(selected('project=second'), 'second');
  assert.equal(selected('project=paused'), 'none');
  assert.equal(selected('project=other-space'), 'none');
  assert.equal(selected('', [projects[0]]), 'none');

  selections.set(selectionKey + owner, 'second');
  assert.equal(selected(), 'second');
  assert.equal(selected('project=first'), 'first');
  assert.equal(selected('', projects.slice(0, 2)), 'first');
});
