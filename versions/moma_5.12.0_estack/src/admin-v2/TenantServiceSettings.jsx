import { useState } from 'react';
import { Banner, Button, Input, Select, Space, Toast, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/FilterControls';
import { activeCustomer } from '../service-access.mjs';
import AdminStatus from './AdminStatus';
import { TENANT_SERVICE_LEVELS, tenantModelCatalogue, tenantModelHasTpm, tenantModelRules } from './tenant-service-settings.mjs';
import { EnterpriseDialog, EnterpriseTable } from './EnterpriseUI';

const { Text } = Typography;
const label = {
  level:'设置服务等级', 'open-models':'开通新模型', 'model-limits':'限流设置', 'remove-model':'移除模型',
};
const amount = value => value == null ? '未设置' : value.toLocaleString('zh-CN');
const limitValue = value => value === '' ? null : Number(value);
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
      const input = operation==='model-limits'
        ? {...data,rpm:limitValue(data.rpm),tpm:limitValue(data.tpm)} : data;
      await transact({type:'tenantServiceSettings',tenantId:tenant.id,operation,data:input},revision);
      if (operation==='open-models') { setQuery(''); setPage(1); }
      setEditor(null);
      Toast.success(({level:'服务等级已保存','open-models':'模型已开通','model-limits':'限流已保存','remove-model':'模型已移除'})[operation]);
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
        <Input className="admin-list-search" aria-label="搜索已开通模型" prefix={<IconSearch aria-hidden="true"/>}
          placeholder="搜索模型名称或调用标识" value={query} onChange={value=>{setQuery(value);setPage(1);}} showClear/>
        {writable && <Button theme="solid" onClick={()=>open('open-models',{modelIds:[]})}>开通新模型</Button>}
      </div>
      <EnterpriseTable columns={['模型服务','状态','模型级限流','操作']}
        rows={rows.slice((current-1)*size,current*size).map(({modelId,rpm,tpm})=>({id:modelId,cells:[
          <div className="admin-table-record"><Text>{name(modelId)}</Text><Text type="tertiary" size="small">{codes(modelId)}</Text></div>,
          <AdminStatus value={catalogue.get(modelId)?.availability || '暂不可用'}/>,
          <div className="admin-table-record"><Text>RPM {amount(rpm)}</Text>
            {tenantModelHasTpm(models.get(modelId)) && <Text>TPM {amount(tpm)}</Text>}</div>,
          writable ? <Space wrap spacing={4}>
            <Button size="small" theme="borderless" aria-label={'限流设置 '+name(modelId)}
              onClick={()=>open('model-limits',{modelId,rpm:rpm ?? '',tpm:tpm ?? ''})}>限流设置</Button>
            <Button size="small" theme="borderless" type="danger" aria-label={'移除 '+name(modelId)}
              onClick={()=>open('remove-model',{modelId})}>移除</Button>
          </Space> : '—',
        ]}))} empty={query.trim() ? '暂无匹配的模型' : '当前租户暂无已开通的模型服务'}
        pagination={{currentPage:current,pageSize:size,total:rows.length,pageSizeOpts:PAGE_SIZES,showTotal:true,showSizeChanger:true,
          onPageChange:setPage,onPageSizeChange:value=>{setSize(value);setPage(1);}}}/>
    </>}
    {editor && <EnterpriseDialog title={label[operation]} close={close} closeOnEsc={!saving}
      footer={<><Button onClick={close} disabled={saving}>取消</Button>
        {!(operation==='open-models' && !options.length) && <Button form={'tenant-service-'+section} htmlType="submit"
          theme="solid" type={removing ? 'danger' : 'primary'} loading={saving} disabled={submitDisabled}>
          {removing ? '确认移除' : operation==='open-models' ? '开通' : '保存'}
        </Button>}</>}>
      <form id={'tenant-service-'+section} className="admin-analytics-fields" onSubmit={submit}>
        {operation==='level' && <Select aria-label="服务等级" optionList={levelOptions} value={data.level}
          placeholder="请选择服务等级" onChange={value=>set('level',value)} disabled={saving}/>}
        {operation==='open-models' && (options.length
          ? <Select aria-label="选择模型服务" multiple filter showClear optionList={options} value={data.modelIds}
              placeholder="搜索并选择可开通的模型服务" onChange={value=>set('modelIds',value || [])} disabled={saving}/>
          : <Text type="secondary">当前租户暂无可新增开通的模型服务。</Text>)}
        {operation==='model-limits' && <>
          <Text strong>{name(data.modelId)}</Text>
          <label>RPM（每分钟请求数）<Input type="number" min={1} step={1} aria-label="RPM" placeholder="未设置"
            value={data.rpm} onChange={value=>set('rpm',value)} disabled={saving}/></label>
          {tenantModelHasTpm(models.get(data.modelId)) && <label>TPM（每分钟 Token 数）<Input type="number" min={1} step={1}
            aria-label="TPM" placeholder="未设置" value={data.tpm} onChange={value=>set('tpm',value)} disabled={saving}/></label>}
          <Text type="secondary">留空可清除本模型的租户级上限。</Text>
        </>}
        {removing && <Text>移除「{name(data.modelId)}」后，该租户下的项目将无法调用此模型。</Text>}
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
      </form>
    </EnterpriseDialog>}
  </>;
}
