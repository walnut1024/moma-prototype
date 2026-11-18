import { useId } from 'react';
import { Button, Select, Tag, Typography } from '@douyinfe/semi-ui';
import { IconArrowRight, IconPlus } from '@douyinfe/semi-icons';
import Table from './AdminTable';
import { CopyId } from './ServiceUI';
import { forwardingChoices, forwardingInterfaces, publicRouteAddress } from './service-route-forwarding';

function UpstreamAddress({url}) {
  return <CopyId value={url} label="上游接口地址" copyAtStart/>;
}

export function RouteForwarding({model, rows, changes, targets, draft, blocked, controls, onEdit, onChange, onCancel, onDone, onRemove, removablePaths = []}) {
  const labelId = useId();
  const interfaces = forwardingInterfaces(model, rows);
  const unconfigured = interfaces.filter(item => !rows.some(row => row.path === item.path) || draft?.adding && draft.path === item.path);
  const locked = blocked || Boolean(draft && !draft.targetPath);
  const directions = draft?.path ? forwardingChoices(draft.path, targets) : [];
  const target = directions.find(item => item.upstreamPath === draft?.direction)?.target;
  const addDraft = draft?.adding && {path:draft.path, label:'新增路由', adding:true};
  const displayed = addDraft ? [...rows.filter(row => row.path !== addDraft.path), addDraft] : rows;
  const editing = row => draft && (draft.adding ? row.adding : draft.path === row.path);
  const protocol = path => interfaces.find(row=>row.path===path)?.label;
  return <section className="ss-route-forwarding" aria-label="路由转发">
    <div className="ss-forward-toolbar">{controls}
      <Button size="small" icon={<IconPlus aria-hidden="true"/>} theme="borderless" disabled={blocked || Boolean(draft) || !unconfigured.length || !targets.length}
        onClick={() => onEdit({adding:true, path:null, direction:null, targetPath:null})}>添加路由</Button>
    </div>
    <Table className="ss-forward-table" pagination={false} rowKey={row=>row.adding ? 'new' : row.path}
      scroll={{x:'max(100%, 1240px)'}} empty="选择主渠道后配置接口路由。" dataSource={displayed}
      onRow={row=>({className:editing(row) ? 'ss-forward-editing' : undefined})} columns={[
        {title:<span id={labelId+'-external'}>对外接口</span>, width:'40%', render:(_,row)=>editing(row) && draft.adding
          ? <Select aria-labelledby={labelId+'-external'} value={draft.path} placeholder="选择对外接口" disabled={blocked}
              optionList={interfaces.map(({path,label})=>({value:path,label:label+' · POST '+path,disabled:!unconfigured.some(item=>item.path===path)}))}
              onChange={path=>onChange({...draft,path,direction:null,targetPath:null})}/>
          : <div className="ss-forward-endpoint"><div className="ss-forward-protocol"><Typography.Text>{row.label}</Typography.Text>
              {!editing(row) && changes.some(item=>item.path===row.path) && <Tag color="blue" size="small">待保存</Tag>}
            </div>
              {publicRouteAddress(row.path) ? <CopyId value={publicRouteAddress(row.path)} label="对外调用地址" copyAtStart/>
                : <Typography.Text type="secondary">对外地址未配置</Typography.Text>}
            </div>},
        {title:<span id={labelId+'-forwarding'}>转发方式</span>, width:124, render:(_,row)=>editing(row)
          ? <Select aria-labelledby={labelId+'-forwarding'} value={draft.direction} placeholder={draft.path ? '选择转换方向' : '先选择对外接口'} disabled={blocked || !draft.path}
              optionList={directions.map(({upstreamPath,label,target})=>({value:upstreamPath,label:target ? label : label+'（无匹配上游接口）',disabled:!target}))}
              onChange={direction=>onChange({...draft,direction,targetPath:null})}/>
          : <div className="ss-forward-connection"><Typography.Text title={row.forwarding}>{row.path===row.upstreamPath ? '原生转发' : '协议转换'}</Typography.Text><IconArrowRight aria-hidden="true"/></div>},
        {title:<span id={labelId+'-upstream'}>上游接口</span>, render:(_,row)=>editing(row)
          ? <Select aria-labelledby={labelId+'-upstream'} value={draft.targetPath} placeholder={draft.direction ? '选择匹配的上游接口' : '先选择转换方向'} disabled={blocked || !target}
              optionList={target ? [{value:target.path,label:(protocol(target.path)||target.label)+' · '+target.url}] : []}
              onChange={targetPath=>onChange({...draft,targetPath})}/>
          : <div className="ss-forward-endpoint"><Typography.Text>{protocol(row.upstreamPath)}</Typography.Text>
              {row.url ? <UpstreamAddress url={row.url}/> : <Typography.Text type="secondary">待配置</Typography.Text>}
            </div>},
        {title:'操作',width:112,render:(_,row)=><div className="ss-forward-actions">
          {editing(row) ? <>
            <Button size="small" theme="borderless" type="tertiary" disabled={blocked} onClick={onCancel}>{draft.adding ? '取消新增' : '取消编辑'}</Button>
            <Button size="small" theme="borderless" disabled={locked} onClick={onDone}>完成</Button>
          </> : <>
            <Button size="small" theme="borderless" disabled={blocked || Boolean(draft)} aria-label={'编辑 '+row.label}
              onClick={()=>onEdit({path:row.path,label:row.label,direction:row.upstreamPath,targetPath:row.url ? row.upstreamPath : null})}>编辑</Button>
            {removablePaths.includes(row.path) && <Button size="small" theme="borderless" type="danger" disabled={blocked || Boolean(draft)}
              aria-label={'删除 '+row.label} onClick={()=>onRemove(row.path)}>移除</Button>}
          </>}
        </div>},
      ]}/>
  </section>;
}

function ReviewRouteValue({row}) {
  if (!row) return <Typography.Text type="secondary">未配置</Typography.Text>;
  return <div className="ss-forward-review-value">
    <Typography.Text strong>{row.forwarding}</Typography.Text>
    {row.url ? <UpstreamAddress url={row.url}/> : <Typography.Text type="secondary">上游地址待配置</Typography.Text>}
  </div>;
}

export function RouteForwardingReview({rows}) {
  if (!rows.length) return null;
  return <Table className="ss-forward-review" pagination={false} rowKey="path" scroll={{x:'max(100%, 540px)'}}
    dataSource={rows} columns={[
      {title:'对外接口', width:'25%', render:(_, row) => <div className="ss-forward-review-value">
        <Tag color={row.previous ? row.next ? 'orange' : 'grey' : 'blue'} size="small">{row.previous ? row.next ? '修改' : '移除' : '新增'}</Tag>
        <Typography.Text strong>{row.label}</Typography.Text><code>POST {row.path}</code>
      </div>},
      {title:'当前生效', width:'33%', render:(_, row) => <ReviewRouteValue row={row.previous}/>},
      {title:'保存后', render:(_, row) => <ReviewRouteValue row={row.next}/>},
    ]}/>;
}
