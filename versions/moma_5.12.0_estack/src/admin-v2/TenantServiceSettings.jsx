import { useState } from 'react';
import { Banner, Button, Input, Select, Space, Toast, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/FilterControls';
import { activeCustomer } from '../service-access.mjs';
import AdminStatus from './AdminStatus';
import { TENANT_SERVICE_LEVELS, tenantModelCatalogue, tenantModelRules } from './tenant-service-settings.mjs';
import { EnterpriseDialog, EnterpriseTable } from './EnterpriseUI';

const { Text } = Typography;
const label = {
  level:'设置服务等级', 'open-models':'授权模型服务', 'remove-model':'移除授权',
};
const levelOptions = TENANT_SERVICE_LEVELS.map(level=>({value:level,label:level}));

export function TenantServiceSettings({ state, tenant, section, canWrite, transact }) {
  const [editor,setEditor] = useState(null);
  const [query,setQuery] = useState('');
  const [page,setPage] = useState(1);
  const [size,setSize] = useState(DEFAULT_PAGE_SIZE);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const writable = canWrite && state.currentRole==='平台管理员' && activeCustomer(tenant);
  const catalogue = section==='models' ? tenantModelCatalogue(state,tenant.id) : new Map();
  const rules = section==='models' ? tenantModelRules(state,tenant,catalogue) : [];
  const models = new Map(state.models.map(model=>[model.id,model]));
  const opened = new Set(rules.map(rule=>rule.modelId));
  const name = id => models.get(id)?.name || id;
  const codes = id => [...(catalogue.get(id)?.calls || [])].join('、') || models.get(id)?.modelId || id;
  const options = [...catalogue].filter(([id,model])=>model.availability && !opened.has(id))
    .map(([id])=>({value:id,label:name(id)+' · '+codes(id)}));
  const rows = rules.filter(({modelId})=>[name(modelId),codes(modelId),modelId].some(value=>value.toLowerCase().includes(query.trim().toLowerCase())));
  const current = Math.min(page,Math.max(1,Math.ceil(rows.length/size)));

  const open = (operation,data) => { setError(''); setEditor({operation,revision:state.revision,data}); };
  const set = (field,value) => setEditor(previous=>({...previous,data:{...previous.data,[field]:value}}));
  const close = () => { if (!saving) setEditor(null); };
  async function submit(event) {
    event.preventDefault();
    if (!writable || saving) return;
    const { operation,revision,data } = editor;
    setError('');
    setSaving(true);
    try {
      await transact({type:'tenantServiceSettings',tenantId:tenant.id,operation,data},revision);
      if (operation==='open-models') { setQuery(''); setPage(1); }
      setEditor(null);
      Toast.success(({level:'服务等级已保存','open-models':'已授权','remove-model':'已移除授权'})[operation]);
    } catch (issue) { setError(issue.message); }
    finally { setSaving(false); }
  }

  const { operation,data } = editor || {};
  const removing = operation==='remove-model';
  const submitDisabled = !writable || operation==='level' && !data.level || operation==='open-models' && !data.modelIds.length;
  return <>
    {section==='level' && <Space wrap>
      <Text>{tenant.serviceLevel || '未设置'}</Text>
      {writable && <Button theme="borderless" size="small" onClick={()=>open('level',{
        level:TENANT_SERVICE_LEVELS.includes(tenant.serviceLevel) ? tenant.serviceLevel : undefined,
      })}>设置等级</Button>}
    </Space>}
    {section==='models' && <>
      <div className="admin-page-heading">
        <Input className="admin-list-search" aria-label="搜索已授权的模型服务" prefix={<IconSearch aria-hidden="true"/>}
          placeholder="搜索模型服务名称或模型 ID" value={query} onChange={value=>{setQuery(value);setPage(1);}} showClear/>
        {writable && <Button theme="solid" onClick={()=>open('open-models',{modelIds:[]})}>授权模型服务</Button>}
      </div>
      <EnterpriseTable columns={['模型服务','状态','操作']}
        rows={rows.slice((current-1)*size,current*size).map(({modelId})=>({id:modelId,cells:[
          <div className="admin-table-record"><Text>{name(modelId)}</Text><Text type="tertiary" size="small">{codes(modelId)}</Text></div>,
          <AdminStatus value={catalogue.get(modelId)?.availability || '暂不可用'}/>,
          writable ?
            <Button size="small" theme="borderless" type="danger" aria-label={'移除授权 '+name(modelId)}
              onClick={()=>open('remove-model',{modelId})}>移除授权</Button>
          : '—',
        ]}))} empty={query.trim() ? '暂无匹配的模型' : '当前租户暂无已授权的模型服务'}
        pagination={{currentPage:current,pageSize:size,total:rows.length,pageSizeOpts:PAGE_SIZES,showTotal:true,showSizeChanger:true,
          onPageChange:setPage,onPageSizeChange:value=>{setSize(value);setPage(1);}}}/>
    </>}
    {editor && <EnterpriseDialog title={label[operation]} close={close} closeOnEsc={!saving}
      footer={<><Button onClick={close} disabled={saving}>取消</Button>
        {!(operation==='open-models' && !options.length) && <Button form={'tenant-service-'+section} htmlType="submit"
          theme="solid" type={removing ? 'danger' : 'primary'} loading={saving} disabled={submitDisabled}>
          {removing ? '确认移除授权' : operation==='open-models' ? '授权' : '保存'}
        </Button>}</>}>
      <form id={'tenant-service-'+section} className="admin-analytics-fields" onSubmit={submit}>
        {operation==='level' && <Select aria-label="服务等级" optionList={levelOptions} value={data.level}
          placeholder="请选择服务等级" onChange={value=>set('level',value)} disabled={saving}/>}
        {operation==='open-models' && (options.length
          ? <Select aria-label="选择模型服务" multiple filter showClear optionList={options} value={data.modelIds}
              placeholder="搜索并选择可授权的模型服务" onChange={value=>set('modelIds',value || [])} disabled={saving}/>
          : <Text type="secondary">当前租户暂无可授权的模型服务。</Text>)}
        {removing && <Text>移除「{name(data.modelId)}」后，该租户下的项目将无法调用此模型。</Text>}
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
      </form>
    </EnterpriseDialog>}
  </>;
}
