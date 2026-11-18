import { workspaceStoragePrefix } from './workspace-storage.mjs';
import { useCallback, useEffect, useState } from 'react';

const storageKey = workspaceStoragePrefix + 'selected-project:';
export const experiencePages = { text:'文本生成', image:'图片生成', video:'视频生成', voice:'语音识别' };
export function readProjectScope(params = new URLSearchParams(location.search)) {
  const preset = params.get('preset') || '';
  const panel = params.get('panel');
  return { id:params.get('project') || '', projectRules:params.get('routeType') === 'project', space:params.get('scope') === 'space', days:Number(params.get('days')) || 1,
    keyId:params.get('keyId') || '', modelId:params.get('modelId') || '', requestId:params.get('requestId') || '',
    view:params.get('view') || '',
    routing: { type:preset || params.get('routeType') === 'preset' ? 'preset' : 'auto', preset,
      panel:['api','history','edit'].includes(panel) ? panel : 'config', create:params.get('edit') === 'new',
      settings:params.get('routing') === 'settings', strategy:params.get('strategy') || '' } };
}

export function useProjectSelection(owner, projects, scope) {
  const [choice, setChoice] = useState(null);
  const active = projects.filter(row => row.status === '正常');
  const remembered = choice?.owner === owner ? choice.id : (() => {
    try { return owner ? sessionStorage.getItem(storageKey + owner) : ''; }
    catch { return ''; }
  })();
  const project = scope.id ? active.find(row => row.id === scope.id)
    : active.find(row => row.id === remembered) || (active.length === 1 ? active[0] : undefined);
  const select = useCallback(id => {
    if (!owner) return;
    setChoice({ owner, id });
    try { sessionStorage.setItem(storageKey + owner, id); } catch { /* This tab retains its selection in memory. */ }
  },[owner]);
  const projectId = project?.id;
  useEffect(() => {
    if (scope.id && projectId && projectId !== remembered) select(projectId);
  },[scope.id,projectId,remembered,select]);
  return { project, select, active };
}
