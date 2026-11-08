import Table, { AdminPagination } from './AdminTable';
import { useEffect, useId, useRef, useState } from 'react';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { Banner, Button, Card, Input, Select, Spin, Switch, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal, AdminSideSheet } from './AdminOverlay';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/FilterControls';
import { loadPackageFactorHistory } from './CloudModelOperations';
import { canManagePackages, MAX_PACKAGE_FACTOR_RULES, packageFactorRange, packageFactorRuleInputs, packageFactorRules, packageModelBillingItems, packageModelsWithRules } from './token-packages';
import './package-production.css';

const emptyRule = { tiered: false, lower: '', upper: '', factor: '' };
const dateTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' });
const hasRuleInput = row => Boolean(row.factor.trim()) || row.tiered;

function initialRuleRows(rules, billingItems) {
  const rows = packageFactorRuleInputs(rules);
  const configured = new Set(rows.map(row => row.billingItemId));
  return [...rows, ...billingItems.filter(item => !configured.has(item.id)).map(item => ({ ...emptyRule, billingItemId: item.id }))]
    .map((row, key) => ({ ...row, key }));
}

function RuleEditor({ model, candidates, billingItems, save, close, canWrite, dirty }) {
  const config = model?.draft ?? model;
  const [modelId, setModelId] = useState(model?.id);
  const selected = model ?? candidates.find(item => item.id === modelId);
  const activeItems = packageModelBillingItems(selected, billingItems);
  const activeIds = new Set(activeItems.map(item => item.id));
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [changeNote, setChangeNote] = useState(config?.changeNote ?? '');
  const [rows, setRows] = useState(() => initialRuleRows(config?.rules ?? [], activeItems));
  const entered = rows.filter(hasRuleInput);
  const unavailable = entered.filter(row => !activeIds.has(row.billingItemId));
  const nextKey = useRef(rows.length);
  const labelId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = change => {
    setRows(change);
    dirty.current = true;
    setError('');
  };
  const edit = (key, patch) => update(current => current.map(row => row.key === key ? { ...row, ...patch } : row));
  const [discard, setDiscard] = useState(null);
  const cancel = () => {
    if (busy) return;
    if (dirty.current) setDiscard({ close: true });
    else close();
  };
  const selectModel = id => {
    const next = candidates.find(item => item.id === id);
    const nextRows = initialRuleRows([], packageModelBillingItems(next, billingItems));
    nextKey.current = nextRows.length;
    setModelId(id);
    setEnabled(false);
    setChangeNote('');
    update(nextRows);
  };
  const submit = async event => {
    event.preventDefault();
    if (!canWrite || busy || !selected || (!model && !activeItems.length)) return;
    setError('');
    try {
      const rules = entered.map(({ billingItemId, tiered, lower, upper, factor }) => ({ billingItemId, tiered, lower, upper, factor }));
      packageFactorRules(rules, activeItems);
      setBusy(true);
      await save({ modelId, rules, enabled, changeNote });
      close();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  const locked = busy || !canWrite;
  return <Modal visible title={discard ? '有未保存的配置' : model ? '编辑模型抵扣系数' : '添加模型'} width="min(760px, calc(100vw - 32px))" onCancel={discard ? () => setDiscard(null) : cancel}
    closable={!busy} maskClosable={!busy} closeOnEsc={!busy}
    footer={discard ? <>
      <Button key="keep" autoFocus onClick={() => setDiscard(null)}>继续编辑</Button>
      <Button type="danger" onClick={() => {
        if (discard.close) close();
        else { selectModel(discard.modelId); setDiscard(null); }
      }}>放弃本次修改</Button>
    </> : <>
      <Button key="cancel" type="tertiary" disabled={busy} onClick={cancel}>取消</Button>
      <Button theme="solid" htmlType="submit" form="package-rule-editor" loading={busy}
        disabled={locked || !selected || unavailable.length > 0 || ((!model || enabled) && !entered.length)}>保存草稿</Button>
    </>}>
    {discard ? <Typography.Paragraph>{discard.close ? '抵扣规则尚未保存，放弃修改后将关闭弹窗。' : '切换模型将清空当前模型未保存的配置。'}</Typography.Paragraph> :
    <form id="package-rule-editor" className="package-rule-editor" onSubmit={submit}>
      {model ? <Typography.Text strong>{model.name} · {model.code}</Typography.Text> :
        <div className="package-field">
          <Typography.Text id={`${labelId}-model`}>模型服务</Typography.Text>
          <Select aria-labelledby={`${labelId}-model`} value={modelId} filter disabled={locked} placeholder="搜索或选择模型服务"
            emptyContent={candidates.length ? '暂无匹配的模型服务' : '没有可添加的未归档模型'}
            optionList={candidates.map(item => ({ value: item.id, label: `${item.name} · ${item.code}` }))}
            onChange={value => {
              if (value === modelId) return;
              if (entered.length || enabled || changeNote) setDiscard({ modelId: value });
              else selectModel(value);
            }}/>
        </div>}
      {selected && (!activeItems.length && !model ? <Banner type="warning" closeIcon={null}
        description="该模型暂无生效售价计费项，请先在「模型售价」配置并发布售价。"/> : <>
      <div className="admin-list-toolbar">
        <Typography.Text id={`${labelId}-enabled`}>允许加入套餐</Typography.Text>
        <Switch aria-labelledby={`${labelId}-enabled`} checked={enabled} disabled={locked} onChange={checked => {
          setEnabled(checked);
          dirty.current = true;
          setError('');
        }}/>
      </div>
      <Typography.Paragraph type="secondary">发布后，允许加入套餐且至少有一条抵扣规则的模型可在制作套餐时选用。</Typography.Paragraph>
      {model?.legacyFactor && !model.rules.length && <Banner type="info" closeIcon={null}
        description={`原模型系数为 ${model.legacyFactor} 倍，请为它明确配置适用的计费项。`}/>}
      {unavailable.length > 0 && <Banner type="warning" closeIcon={null} description={<>
        下列规则对应的计费项已不在当前售价中，移除后可保存新草稿。
        {unavailable.map(row => <div key={row.key}>
          {billingItems.find(item => item.id === row.billingItemId)?.name ?? row.billingItemId} · {row.factor} 倍
          <Button type="danger" theme="borderless" size="small" disabled={locked}
            onClick={() => update(current => current.filter(item => item.key !== row.key))}>移除</Button>
        </div>)}
      </>}/>}
      {activeItems.length > 0 && <Typography.Paragraph type="secondary">计费项来自该模型当前生效的售价。留空表示该计费项未配置系数。分档时按本次请求的输入 Token 数选档，整笔使用命中系数。</Typography.Paragraph>}
      {activeItems.map(item => {
        const group = rows.filter(row => row.billingItemId === item.id);
        return <Card key={item.id} title={item.name} headerExtraContent={
          <Button theme="borderless" size="small" disabled={locked || entered.length >= MAX_PACKAGE_FACTOR_RULES || group.some(row => !row.factor.trim())}
            aria-label={`为${item.name}添加档位`} onClick={() => {
              const key = nextKey.current++;
              update(current => [...current.map(row => row.billingItemId === item.id ? { ...row, tiered: true } : row),
                { ...emptyRule, billingItemId: item.id, tiered: true, key }]);
            }}>添加档位</Button>
        }>
        <div className="package-factor-rule-rows">
        {group.map((row, index) => <div className="package-fields" key={row.key} role="group" aria-label={`${item.name} 规则 ${index + 1}`}>
          <div className="package-field"><Typography.Text id={`${labelId}-tier-${row.key}`}>输入 Token 档位</Typography.Text>
            <Select value={row.tiered ? 'tiered' : 'flat'} disabled={locked} aria-labelledby={`${labelId}-tier-${row.key}`}
              optionList={[{ value: 'flat', label: '不分档', disabled: group.length > 1 }, { value: 'tiered', label: '按区间' }]}
              onChange={value => edit(row.key, { tiered: value === 'tiered' })}/>
          </div>
          <label className="package-field"><Typography.Text>抵扣系数</Typography.Text>
            <Input aria-label={`${item.name} 规则 ${index + 1} 抵扣系数`} value={row.factor} inputMode="decimal" placeholder="例如 1.25"
              disabled={locked} onChange={factor => edit(row.key, { factor })}/>
          </label>
          {row.tiered && <>
            <label className="package-field"><Typography.Text>下限（不含）</Typography.Text>
              <Input aria-label={`规则 ${index + 1} 下限`} inputMode="numeric" value={row.lower} placeholder="留空从 0 开始"
                disabled={locked} onChange={lower => edit(row.key, { lower })}/>
            </label>
            <label className="package-field"><Typography.Text>上限（含）</Typography.Text>
              <Input aria-label={`规则 ${index + 1} 上限`} inputMode="numeric" value={row.upper} placeholder="留空无上限"
                disabled={locked} onChange={upper => edit(row.key, { upper })}/>
            </label>
          </>}
          {group.length > 1 && <div><Button type="danger" theme="borderless" size="small" disabled={locked}
            aria-label={`移除${item.name}规则 ${index + 1}`} onClick={() => update(current => current.filter(entry => entry.key !== row.key))}>移除档位</Button></div>}
        </div>)}
        </div>
      </Card>;
      })}
      <label className="package-field"><Typography.Text>修改说明</Typography.Text>
        <TextArea aria-label="修改说明" maxCount={300} value={changeNote} disabled={locked}
          onChange={value => { setChangeNote(value); dirty.current = true; }}/>
      </label>
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
      </>)}
    </form>}
  </Modal>;
}

function FactorHistory({ model, billingItems, close }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const request = new AbortController();
    loadPackageFactorHistory(model.id, request.signal).then(result => setHistory(result.history)).catch(cause => {
      if (!request.signal.aborted) setError(cause.message);
    });
    return () => request.abort();
  }, [model.id]);
  const names = new Map(billingItems.map(item => [item.id, item.name]));
  const snapshot = ({ version, enabled, rules }) => <div className="admin-table-record">
    <Typography.Text>{version ? (enabled ? '允许加入套餐' : '不允许加入套餐') : '未发布'}</Typography.Text>
    {rules.map(rule => <Typography.Text type="secondary" key={`${rule.billingItemId}:${rule.lower}:${rule.upper}`}>
      {rule.billingItem ?? names.get(rule.billingItemId) ?? rule.billingItemId} · {packageFactorRange(rule)} · {rule.factor} 倍
    </Typography.Text>)}
  </div>;
  return <AdminSideSheet visible closeOnEsc width="min(680px, 100vw)" title={`${model.name} · 修改历史`} onCancel={close}>
    <div className="package-factor-history">
      {error ? <Banner type="danger" closeIcon={null} description={error}/> :
        history === null ? <Spin aria-label="加载修改历史"/> : !history.length ?
          <Typography.Text type="tertiary">暂无发布记录</Typography.Text> :
          history.map(entry => <Card key={entry.id} title={entry.version ? `版本 V${entry.version}` : '历史配置'}>
            <div className="package-factor-history-entry">
              <Typography.Text type="secondary">{dateTime.format(new Date(entry.createdAt))} · {entry.actor}</Typography.Text>
              {entry.changeNote && <Typography.Paragraph>{entry.changeNote}</Typography.Paragraph>}
              <div className="package-fields">
                <div><Typography.Text strong>变更前</Typography.Text>{snapshot(entry.before)}</div>
                <div><Typography.Text strong>变更后</Typography.Text>{snapshot(entry.after)}</div>
              </div>
            </div>
          </Card>)}
    </div>
  </AdminSideSheet>;
}

export default function PackageModelFactors({ state, transact, conflict, dirty }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [editor, setEditor] = useState(null);
  const [historyModel, setHistoryModel] = useState(null);
  const [publication, setPublication] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const addButton = useRef(null);
  const keyword = query.trim().toLowerCase();
  const models = packageModelsWithRules(state);
  const candidates = models.filter(item => !item.configured);
  const rows = models.filter(item => item.configured && `${item.name} ${item.code}`.toLowerCase().includes(keyword));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const canWrite = !conflict && canManagePackages(state.currentRole, 'saveFactorDraft');
  const run = (operation, values) => transact({ type: 'tokenPackage', operation, values });
  const focusModel = (trigger, id) => requestAnimationFrame(() => {
    const edit = id && document.getElementById(`factor-edit-${id}`);
    (trigger?.isConnected && !trigger.disabled ? trigger : edit || addButton.current)?.focus();
  });

  const pageRows = rows.slice((currentPage - 1) * size, currentPage * size).flatMap(item =>
    (item.rules.length ? item.rules : [null]).map((rule, index, group) => ({
      key: `${item.id}:${index}`, item, rule, rowSpan: index === 0 ? group.length : 0,
    })));
  const grouped = ({ rowSpan }, children) => ({ children, props: { rowSpan } });
  const columns = [
    { title: '模型服务', width: 170, fixed: 'left', render: (_, row) => grouped(row, <div className="admin-table-record">
      <Typography.Text strong>{row.item.name}</Typography.Text><Typography.Text type="tertiary" size="small">{row.item.code}</Typography.Text>
    </div>) },
    { title: '允许加入套餐', width: 124, render: (_, row) => grouped(row, <Tag size="small" color={row.item.enabled ? 'green' : 'grey'}>
      {row.item.enabled ? '已允许' : '未允许'}
    </Tag>) },
    { title: '计费项', width: 133, render: (_, { item, rule }) => rule ? rule.billingItem : {
      children: <Typography.Text type="tertiary">{item.legacyFactor ? `原模型系数 ${item.legacyFactor} 倍 · 待配置计费项` : '未配置抵扣规则'}</Typography.Text>,
      props: { colSpan: 3 },
    } },
    { title: '输入 Token 档位', width: 142, render: (_, { rule }) => rule ? packageFactorRange(rule) : { props: { colSpan: 0 } } },
    { title: '抵扣系数', width: 86, align: 'right', render: (_, { rule }) => rule ? `${rule.factor} 倍` : { props: { colSpan: 0 } } },
    { title: '生效版本', width: 124, render: (_, row) => grouped(row, <div className="admin-table-record">
      <Typography.Text>{row.item.version ? `V${row.item.version}` : '未发布'}</Typography.Text>
      {row.item.publishedAt && <Typography.Text type="tertiary" size="small">{dateTime.format(new Date(row.item.publishedAt))}</Typography.Text>}
    </div>) },
    { title: '待发布变更', width: 100, render: (_, row) => grouped(row, row.item.draft ? <Tag size="small" color="orange">待发布</Tag> : '—') },
    { title: '操作', width: 172, fixed: 'right', render: (_, row) => grouped(row, <div className="package-actions">
      <Button id={`factor-edit-${row.item.id}`} theme="borderless" size="small" disabled={!canWrite}
        aria-label={`编辑 ${row.item.name} 抵扣系数`} onClick={event => setEditor({ model: row.item, trigger: event.currentTarget })}>编辑</Button>
      {row.item.draft && <Button theme="borderless" size="small" disabled={!canWrite}
        aria-label={`发布 ${row.item.name} 抵扣系数`} onClick={event => setPublication({ model: row.item, trigger: event.currentTarget })}>发布</Button>}
      <Button theme="borderless" size="small" aria-label={`查看 ${row.item.name} 修改历史`}
        onClick={() => setHistoryModel(row.item)}>修改历史</Button>
    </div>) },
  ];

  return <div className="admin-page-stack">
    <Typography.Paragraph type="secondary">可从平台的 <Typography.Text link={{ href: '#/admin-2/listing' }}>模型服务</Typography.Text> 添加未归档的模型。发布后，允许加入套餐的模型仍须在具体套餐中选入。</Typography.Paragraph>
    <Banner type="info" fullMode={false} closeIcon={null} title="抵扣系数如何计算"
      description="套餐扣减额度 = 各计费项实际用量 × 对应抵扣系数，再将结果相加。例如，输入 1,000 Token，输入系数为 1.5，则输入部分扣减 1,500 套餐 Token。分档时按本次请求的输入 Token 数选档，整笔按命中的系数计算。"/>
    <Card>
      <div className="admin-list-toolbar">
        <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} aria-label="搜索模型" placeholder="搜索模型名称或标识" value={query}
          onChange={value => { setQuery(value); setPage(1); }}/>
        <Button ref={addButton} theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!canWrite}
          onClick={event => setEditor({ trigger: event.currentTarget })}>添加模型</Button>
      </div>
      <section aria-label="套餐模型抵扣规则">
        <Table size="small" rowKey="key" columns={columns} dataSource={pageRows} pagination={false}
          scroll={{ x: 'max(100%, 1051px)' }} empty={keyword ? '暂无符合搜索条件的模型' : '暂无模型抵扣配置，点击「添加模型」开始配置。'}/>
      </section>
      <div className="package-table-pagination">
        <AdminPagination total={rows.length} currentPage={currentPage} pageSize={size} pageSizeOpts={PAGE_SIZES}
          showSizeChanger showTotal onPageChange={setPage} onPageSizeChange={value => { setSize(value); setPage(1); }}/>
      </div>
    </Card>
    {editor && <RuleEditor model={editor.model} candidates={candidates} billingItems={state.packageBillingItems} canWrite={canWrite} dirty={dirty}
      close={() => {
        dirty.current = false;
        setEditor(null);
        focusModel(editor.trigger, editor.model?.id);
      }} save={async values => {
        await run('saveFactorDraft', values);
        Toast.success('草稿已保存，发布后生效');
      }}/>}
    {historyModel && <FactorHistory model={historyModel} billingItems={state.packageBillingItems} close={() => setHistoryModel(null)}/>}
    {publication && <Modal visible title="发布模型抵扣系数" okText="确认发布" cancelText="取消" confirmLoading={busy}
      closable={!busy} closeOnEsc={!busy} cancelButtonProps={{ disabled: busy, autoFocus: true }} okButtonProps={{ disabled: !canWrite }}
      onCancel={() => {
        setPublication(null);
        setError('');
        focusModel(publication.trigger, publication.model.id);
      }} onOk={async () => {
        if (busy || !canWrite) return;
        setBusy(true);
        setError('');
        try {
          await run('publishFactorRules', { modelId: publication.model.id });
          Toast.success('模型抵扣系数已发布');
          setPublication(null);
          focusModel(null, publication.model.id);
        } catch (cause) {
          setError(cause.message);
        } finally {
          setBusy(false);
        }
      }}>
      <Typography.Paragraph>发布后，「{publication.model.name}」的新规则将成为平台生效规则，适用于所有包含该模型的套餐。</Typography.Paragraph>
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
    </Modal>}
  </div>;
}
