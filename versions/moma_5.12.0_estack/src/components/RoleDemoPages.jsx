import { Button, Card } from '@douyinfe/semi-ui';
import { AudioLines, FileText, Image, Video } from 'lucide-react';
import { DemoBusinessPage } from './RoleDemoBusiness';
import FrontPageHeader from './FrontPageHeader';
import { roleDemoLabels } from '../role-demo-navigation.mjs';
import './role-demo-pages.css';

const ASSETS = '/moma_5.12.0_estack/assets/';
const EXPERIENCES = {
  text: {
    title: '文本生成', model: 'Qwen3.8 Max', icon: FileText, tags: '文本 → 文本',
    description: '处理文本问答、长文摘要和结构化提取。',
    prompt: '整理一份客服工单升级规范，包含紧急级别、响应时限和交接事项。',
    result: '紧急工单应在 15 分钟内确认，优先通知值班负责人。交接时记录影响范围、已采取的措施和下一次进展更新时间。',
  },
  image: {
    title: '图片生成', model: 'Wan2.7 Image Pro', icon: Image, tags: '文本 → 图片',
    description: '根据文字描述生成图片，适用于素材设计和商品展示。',
    prompt: '生成滨海骑行宣传图。用清晨自然光，保留远处海面，画面主体是一位沿海岸骑行的骑手。',
    media: 'mm-coastal-cyclist.jpg', alt: '海岸边的骑行画面',
  },
  video: {
    title: '视频生成', model: 'Seedance-2.0', icon: Video, tags: '文本 → 视频',
    description: '按提示词和镜头要求生成短视频。',
    prompt: '5 秒城市交通短片。镜头从站台视角平移，电车驶入画面，保持自然日光和稳定运动。',
    media: 'mm-city-transit.jpg', alt: '城市交通短片的示例封面',
    result: '00:00–00:02　站台全景，镜头开始平移\n00:02–00:05　电车入镜，镜头跟随驶入站台',
  },
  voice: {
    title: '语音识别', model: 'SenseVoice Small', icon: AudioLines, tags: '音频 → 文本',
    description: '将语音转为可检索文本，适用于会议和工单归档。',
    prompt: '工单交接录音 · 00:12 · 普通话',
    result: '00:00–00:05　客户已确认账单与实际用量一致。\n00:05–00:12　请将项目负责人和核对记录补充到工单中。',
  },
};

function Details({ facts }) {
  return <dl className="role-demo-page-details">{facts.map(([label, value]) => <div key={label}>
    <dt>{label}</dt><dd>{value ?? '—'}</dd>
  </div>)}</dl>;
}

function DemoExperience({ page, onPage }) {
  const item = EXPERIENCES[page];
  return <div className="role-demo-page-pair">
    <Card className="role-demo-page-panel" title={page === 'voice' ? '输入音频' : '输入提示词'}>
      <Details facts={[[ '模型', item.model ], [ '输入 / 输出', item.tags ]]} />
      <p className="role-demo-page-preview">{item.prompt}</p>
      <Button theme="borderless" onClick={() => onPage('model-market')}>返回模型广场</Button>
    </Card>
    <Card className="role-demo-page-panel" title={page === 'video' ? '示例分镜' : '示例结果'}>
      {item.media && <img className="role-demo-page-media" src={ASSETS + item.media} alt={item.alt} />}
      {item.result && <p className="role-demo-page-preview">{item.result}</p>}
    </Card>
  </div>;
}

export function RoleDemoPage({ page, workspace, onPage, requestId, tab, english }) {
  const experience = EXPERIENCES[page];
  if (!experience) {
    return <DemoBusinessPage page={page} workspace={workspace} onPage={onPage}
      requestId={requestId} tab={tab} experiences={EXPERIENCES} />;
  }
  return <section className="role-demo-page"><FrontPageHeader title={english ? roleDemoLabels[page][1] : experience.title}
    description={workspace.project?.name} /><DemoExperience page={page} onPage={onPage} /></section>;
}
