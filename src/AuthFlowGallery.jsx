import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react';
import AuthExperience from './AuthExperience';
import { availableAuthSpaces, currentAuthUser } from './auth-state.mjs';
import { authFlowScenes, createAuthFlowScene } from './auth-flow-scenes.mjs';
import { Button } from './components/ui/button';

export default function AuthFlowGallery() {
  const [sceneId, setSceneId] = useState(() => new URLSearchParams(location.hash.split('?')[1]).get('scene') || '');
  const [loaded, setLoaded] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [state, setState] = useState(null), [route, setRoute] = useState(''), [params, setParams] = useState(''), [phone, setPhone] = useState(''), [destination, setDestination] = useState(false);
  useEffect(() => { const previous = document.title; document.title = '注册与登录流程合集'; return () => { document.title = previous; }; }, []);
  useEffect(() => {
    const sync = () => setSceneId(new URLSearchParams(location.hash.split('?')[1]).get('scene') || '');
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoaded(null); setError(''); setDestination(false);
    if (sceneId) createAuthFlowScene(sceneId).then(result => {
      if (cancelled) return;
      setState(result.state); setRoute(result.scene.route); setParams(result.params); setPhone(result.phone); setLoaded(result);
    }).catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [sceneId, revision]);
  const selectScene = id => { location.hash = `/auth/flows${id ? `?scene=${id}` : ''}`; };
  if (!sceneId) return <div className="auth-flow-index"><div className="auth-flow-heading"><span>账号与空间</span><h1>注册流程合集</h1><p>选择个人或政企流程，体验从账号验证到进入空间的完整交互。</p></div>{['个人用户', '政企用户', '异常状态'].map(group => <section key={group}><h2>{group}</h2><div className="auth-flow-grid">{authFlowScenes.filter(scene => scene.group === group).map(scene => <button key={scene.id} className="auth-flow-card" onClick={() => selectScene(scene.id)}><span>{scene.title}<ArrowRight /></span><p>{scene.path}</p></button>)}</div></section>)}</div>;
  const user = state && currentAuthUser(state), spaces = state ? availableAuthSpaces(state) : [];
  const navigate = (next, query = '') => { if (next === 'flows') { selectScene(''); return; } setRoute(next); setParams(query); setDestination(false); };
  const auth = { state, route, params: new URLSearchParams(params), draftPhone: phone, setDraftPhone: setPhone, navigate, close: () => setDestination(true), commit: next => { setState(next); return next; }, storageError: '', user, spaces, preview: true };
  return <div className="auth-flow-player"><div className="auth-flow-toolbar"><Button variant="ghost" onClick={() => selectScene('')}><ArrowLeft />返回合集</Button><label><span className="sr-only">选择注册流程</span><select aria-label="选择注册流程" value={sceneId} onChange={event => selectScene(event.target.value)}>{authFlowScenes.map(scene => <option key={scene.id} value={scene.id}>{scene.title}</option>)}</select></label><Button variant="outline" onClick={() => setRevision(value => value + 1)}><RotateCcw />重新开始</Button></div>{loaded && <details className="auth-flow-details"><summary>体验资料 · {loaded.scene.path}</summary><dl>{loaded.details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>各流程独立。确认填写信息后可完成提交；切换流程会重新开始。</p></details>}{error ? <p className="auth-field-error" role="alert">{error}</p> : !loaded ? <p className="auth-flow-loading" role="status">正在加载流程…</p> : destination ? <section className="auth-flow-destination"><Check /><h1>已进入{spaces.find(space => space.id === state.activeSpace)?.name || '使用空间'}</h1><p>{user?.name}，你已完成账号验证。</p><label>切换使用空间<select aria-label="切换使用空间" value={state.activeSpace || ''} onChange={event => setState(current => ({ ...current, activeSpace: event.target.value }))}>{spaces.map(space => <option key={space.id} value={space.id}>{space.name} · {space.role}</option>)}</select></label><div><Button onClick={() => { setState(current => ({ ...current, currentUserId: null })); navigate('login', state.activeSpace === 'personal' ? '' : '?type=enterprise'); }}>退出并体验登录</Button><Button variant="outline" onClick={() => selectScene('')}>返回流程合集</Button></div></section> : <AuthExperience key={`${sceneId}-${revision}-${route}`} auth={auth} />}</div>;
}
