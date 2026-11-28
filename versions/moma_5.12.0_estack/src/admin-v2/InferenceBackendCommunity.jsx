import { useId, useRef, useState } from 'react';
import { Banner, Button, Empty, Input, Radio, RadioGroup, Tag, Typography } from './xa24/HaloUI.jsx';
import { IconSearch, IconServerStroked } from './xa24/HaloIcons.jsx';
import { AdminSideSheet } from './AdminOverlay';
import AdminStatus from './AdminStatus';
import { useChannelText } from './channel-language';
import { communityProjectUrl, parseCommunityMarkdown } from './inference-backend-community-markdown';
import './inference-backend-community.css';

function ProjectLink({ href, children }) {
  return <Typography.Text link={{ href, target: '_blank', rel: 'noopener noreferrer' }}>{children}</Typography.Text>;
}

function DescriptionContent({ tokens }) {
  return tokens.map(({ type, text, href }, index) => {
    if (type === 'code') return <code key={index}>{text}</code>;
    if (type === 'link') return <ProjectLink key={index} href={href}>{text}</ProjectLink>;
    return text;
  });
}

function CommunityDescription({ candidate }) {
  const t = useChannelText();
  const blocks = candidate.markdownDescription ? parseCommunityMarkdown(candidate.markdownDescription) : [];
  const href = communityProjectUrl(candidate.repository);
  const alreadyLinked = blocks.some(block => (block.items?.flat() ?? block.content).some(token => token.href === href && token.type === 'link'));
  if (!blocks.length && !candidate.description && !href) return null;
  return <section>
    <Typography.Title heading={5} component="h3">{t('描述')}</Typography.Title>
    {blocks.length > 0 ? <div className="inference-backend-community-description">
      {blocks.map((block, index) => block.type === 'list' ? <ul key={index}>
        {block.items.map((item, itemIndex) => <li key={itemIndex}><DescriptionContent tokens={item}/></li>)}
      </ul> : <Typography.Paragraph key={index}><DescriptionContent tokens={block.content}/></Typography.Paragraph>)}
    </div> : candidate.description && <Typography.Paragraph className="inference-backend-community-description inference-backend-community-plain-description">
      {candidate.description}
    </Typography.Paragraph>}
    {href && !alreadyLinked && <ProjectLink href={href}>{t('项目链接')}</ProjectLink>}
  </section>;
}

export default function InferenceBackendCommunity({ records, busy, onClose, onSetEnabled }) {
  const t = useChannelText();
  const detailId = useId();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [failure, setFailure] = useState(null);
  const submitting = useRef(false);
  const searchedName = query.trim().toLowerCase();
  const candidates = records.filter(row => `${row.name} ${row.description || ''}`.toLowerCase().includes(searchedName));
  const selected = records.find(row => row.id === selectedId) ?? records[0];
  const waiting = pendingId !== null;
  const close = () => {
    if (!busy && !submitting.current) onClose();
  };

  const enable = async () => {
    if (!selected || selected.enabled || busy || submitting.current) return;
    submitting.current = true;
    setPendingId(selected.id);
    setFailure(null);
    try {
      await onSetEnabled(selected, true);
    } catch (error) {
      setFailure({ id: selected.id, message: error?.message || '社区后端启用失败，请重试。' });
    } finally {
      setPendingId(null);
      submitting.current = false;
    }
  };

  return <AdminSideSheet title={t('社区后端市场')} visible width="min(100vw, max(50vw, 900px))"
    closeOnEsc={!busy && !waiting} onCancel={close}>
    <div className="inference-backend-community">
      <section className="inference-backend-community-catalog" aria-label={t('社区后端')}>
        <div className="inference-backend-community-search">
          <Input aria-label={t('搜索社区后端')} placeholder={t('搜索社区后端')} value={query}
            onChange={setQuery} prefix={<IconSearch aria-hidden="true"/>} showClear/>
        </div>
        {candidates.length ? <RadioGroup type="card" direction="vertical" name={`${detailId}-backend`}
          aria-label={t('选择社区后端')} value={selected?.id} onChange={event => setSelectedId(event.target.value)}>
          {candidates.map(row => <Radio key={row.id} value={row.id} addonClassName="inference-backend-community-card">
            <span className="inference-backend-community-heading">
              <Typography.Text strong>{row.name}</Typography.Text>
              {row.enabled && <AdminStatus value="已启用"/>}
            </span>
            {row.frameworks.length > 0 && <span className="inference-backend-community-frameworks">
              {row.frameworks.map(framework => <span key={framework} title={row.frameworkVersions?.[framework]?.join('、')}>
                <Tag size="small">{framework}</Tag>
              </span>)}
            </span>}
          </Radio>)}
        </RadioGroup> : <Empty description={t('未找到匹配的推理后端')}/>}
      </section>
      {selected && <section key={selected.id} className="inference-backend-community-detail" aria-labelledby={detailId}>
        <div className="inference-backend-community-heading inference-backend-community-detail-header">
          <Typography.Title heading={4} id={detailId}>
            <IconServerStroked aria-hidden="true"/> {selected.name}
          </Typography.Title>
          {selected.enabled ? <AdminStatus value="已启用"/> : <Button type="primary" theme="solid"
            loading={pendingId === selected.id} disabled={(busy || waiting) && pendingId !== selected.id}
            onClick={enable}>{t('启用')}</Button>}
        </div>
        {failure?.id === selected.id && <Banner fullMode={false} type="danger" closeIcon={null} description={t(failure.message)}/>}
        {selected.frameworks.length > 0 && <section>
          <Typography.Title heading={5} component="h3">{t('支持框架')}</Typography.Title>
          <ul>{selected.frameworks.map(framework => <li key={framework}>{framework}</li>)}</ul>
        </section>}
        <CommunityDescription candidate={selected}/>
      </section>}
    </div>
  </AdminSideSheet>;
}
