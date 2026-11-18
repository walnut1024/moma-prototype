import { workspaceStoragePrefix } from "./workspace-storage.mjs";
import { useState } from 'react';

const storageKey = workspaceStoragePrefix + 'selected-project:';
export const experiencePages = { text:'文本生成', image:'图片生成', video:'视频生成', voice:'语音识别' };
export function readProjectScope(params = new URLSearchParams(location.search)) {
  return { id:params.get('project') || '', projectRules:params.get('routeType') === 'project', days:Number(params.get('days')) || 1,
    keyId:params.get('keyId') || '', modelId:params.get('modelId') || '', requestId:params.get('requestId') || '' };
}

export function useProjectSelection(owner, projects, page, scope) {
  const [choice, setChoice] = useState(null);
  const active = projects.filter(row => row.status === '正常');
  const remembered = choice?.owner === owner ? choice.id : (() => {
    try { return owner ? sessionStorage.getItem(storageKey + owner) : ''; }
    catch { return ''; }
  })();
  const project = scope.id ? active.find(row => row.id === scope.id)
    : active.find(row => row.id === remembered) || (active.length === 1 ? active[0] : undefined);
  const select = id => {
    if (!owner) return;
    setChoice({ owner, id });
    try { sessionStorage.setItem(storageKey + owner, id); } catch { /* This tab retains its selection in memory. */ }
  };
  const selected = scope.id || project?.id || '';
  return { project, select, selected, active, detail:page === '项目管理' && projects.find(row => row.id === scope.id) };
}
