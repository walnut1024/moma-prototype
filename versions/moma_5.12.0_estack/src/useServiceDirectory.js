import { useEffect, useState } from 'react';
import { LINK_EVENT } from './service-access.mjs';
import { directorySnapshot } from './service-directory.mjs';
import { projectModelEnabled } from './project-access.mjs';
export function useServiceDirectory(task, project) {
  const read = () => { try { return directorySnapshot(); } catch (error) { return { models: [], identity: null, identityError: '', error: error.message }; } };
  const [snapshot, setSnapshot] = useState(read);
  useEffect(() => {
    const update = () => setSnapshot(read());
    for (const event of [LINK_EVENT, 'storage', 'focus', 'moma:deployment-license']) window.addEventListener(event, update);
    document.addEventListener('visibilitychange', update);
    return () => { for (const event of [LINK_EVENT, 'storage', 'focus', 'moma:deployment-license']) window.removeEventListener(event, update); document.removeEventListener('visibilitychange', update); };
  }, []);
  const models = task ? snapshot.models.filter(model => model.tasks.includes(task)) : snapshot.models;
  return { ...snapshot, models: project ? models.map(model => model.callable && !projectModelEnabled(project, model.modelKey)
    ? { ...model, callable: false, reason: '该模型未在当前项目开通' } : model) : models };
}
