import { useEffect, useState } from 'react';
import { LINK_EVENT } from './service-access.mjs';
import { directorySnapshot } from './service-directory.mjs';
export function useServiceDirectory(task) {
  const read = () => { try { return directorySnapshot(); } catch (error) { return { models: [], identity: null, identityError: '', error: error.message }; } };
  const [snapshot, setSnapshot] = useState(read);
  useEffect(() => {
    const update = () => setSnapshot(read());
    for (const event of [LINK_EVENT, 'storage', 'focus']) window.addEventListener(event, update);
    document.addEventListener('visibilitychange', update);
    return () => { for (const event of [LINK_EVENT, 'storage', 'focus']) window.removeEventListener(event, update); document.removeEventListener('visibilitychange', update); };
  }, []);
  return { ...snapshot, models: task ? snapshot.models.filter(model => model.tasks.includes(task)) : snapshot.models };
}
