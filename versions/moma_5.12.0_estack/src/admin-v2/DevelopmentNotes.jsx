import { directorySnapshot } from '../service-directory.mjs';
import { useRef, useState } from 'react';
import { Button as LegacyButton } from '../components/ui/button';
import { Banner, Button as SemiButton, Tabs as SemiTabs, Typography } from '@douyinfe/semi-ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Modal } from './ServiceUI';
import './development-notes.css';

function AdminNotesButton({ variant, ...props }) {
  return <SemiButton theme={variant === 'outline' ? 'light' : 'solid'} type={variant === 'outline' ? 'tertiary' : 'primary'} {...props}/>;
}

function AdminNotesHeading({ children }) {
  return <Typography.Title heading={5} component="h3">{children}</Typography.Title>;
}

const noteAreas = ['前台与服务', '渠道管理', '模型资料'];

export default function DevelopmentNotes({ admin = false }) {
  const Button = admin ? AdminNotesButton : LegacyButton;
  const Heading = admin ? AdminNotesHeading : 'h3';
  const Paragraph = admin ? Typography.Paragraph : 'p';
  const [open, setOpen] = useState(false), trigger = useRef(null);
  const [area, setArea] = useState('前台与服务');
  const service = area === '前台与服务';
  let currentIdentity; if (open && service) { try { currentIdentity = directorySnapshot().identity; } catch {} }
  const supply = area === '渠道管理';
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  const content = open && (service ? <>
      <Heading>内置服务商目录</Heading>
      <Paragraph>在「基础资料 → 服务商」维护主体及供应登记，在「渠道管理 → 渠道列表」创建和维护接入渠道。</Paragraph>
      <Heading>渠道协议、容量和密钥</Heading><Paragraph>渠道接入按模型协议选择端点，并使用渠道 Base URL 访问上游。OpenAI Chat Completions 与 OpenAI Responses 分别保存接口类型。容量从渠道的模型列表维护。页面仅展示脱敏凭证，已有凭证引用随业务数据保留。</Paragraph>
      <Heading>模型运营管理流程</Heading><Paragraph>「模型服务」列表进入服务详情，包含「基本信息」和「渠道模型」。服务通过「添加渠道模型」关联已登记且通过验证的渠道，按优先级和权重配置。当前服务页面使用版本独立的浏览器存储。模型广场和模型销售继续使用原有 D1 服务、价格和展示记录。资源导入与存量服务继续使用原有模型映射和路由数据。</Paragraph>
      <Heading>访问控制</Heading><Paragraph>运营侧栏并列展示「商业运营」和「组织运营」。纯内用站点的商业入口显示为未授权。组织运营通过本组织查看内部成员，商业运营通过客户管理查看政企与个人客户。在客户详情里查看该客户的项目；从「组织运营 → 项目管理」查看本组织项目。用户管理按登录账号查看所属空间、成员角色和项目归属。</Paragraph><Heading>两面身份与样例</Heading><Paragraph>后台账号代表平台管理人员；前台政企用户与个人用户代表服务使用者。两面的登录状态独立。用户通过稳定 ID 关联后台用户、组织或个人客户及成员记录，不按名称、手机号或页面自报的客户 ID 猜测授权。</Paragraph>
      <Heading>空间与项目</Heading><Paragraph>账号菜单在有多个可访问空间时提供切换。我的项目按账号展示已获授权的企业项目，企业管理员从企业管理查看本企业全部项目。点击项目进入共用详情，项目选择器联动模型体验、Key 和调用观测。个人开户原子创建唯一默认项目，调用和 Key 自动归属该项目。前后台通过客户、项目、订单和 Key 的稳定 ID 对齐。</Paragraph>
      <Paragraph>当前前台身份：{currentIdentity ? `${currentIdentity.name} → ${currentIdentity.tenantName}（${currentIdentity.tenantId}）` : '尚无有效身份映射'}</Paragraph>
      <Paragraph>快速切换仅限已准备的三个前台样例账号，保留启停、成员和映射检查；不会切换后台管理员、创建授权或恢复旧任务。正常验证码登录继续保留。正式产品移除快速切换入口。</Paragraph>
      <Heading>统一登录</Heading><Paragraph>个人、企业和后台共用一个登录入口。个人与企业按有效空间进入，后台按账号角色进入运营或运维工作区。后台直达、重新聚焦及各模块请求校验同一服务端会话；失效回统一登录，无权限保留权限提示。原地址仅在登录身份有权访问时恢复。首次访问不自动登录管理员，退出及账号切换撤销旧会话。</Paragraph>
      <Heading>目录与调用逻辑</Heading><Paragraph>模型资料、后台服务、当前客户授权与实际 mock 发布配置共同决定目录。模型广场、详情、选择器及体验入口使用稳定服务 ID；统一模型服务模式和各服务商独立服务分别判断。不复制一份已订购名单，不暴露采购价和密钥。未知能力保持未知；没有相应任务页面时显示不可体验。</Paragraph>
      <Paragraph>两模型案例默认一模型一卡，全部模型保留历史服务。点击卡片进入独立详情页，服务商报价逐行展开，API 调用区切换提供方后同步模型调用标识、代码示例与体验入口；URL 保留模型和服务身份，支持刷新和返回。价格取平台发布快照，未提交输入不影响前台；不根据可调用状态推断已订购。API Key 由原管理页维护。模型选择器与新回复保留提供方，避免同名服务混淆。</Paragraph>
      <Paragraph>模型广场可见性只控制列表展示，隐藏时已有订购、API 调用及在途请求继续有效；切回可见不自动上架或发布。真正下架仍会隐藏并拒绝新请求，包括已创建的 Key 和旧成功请求的重放。发送及结果交付前重新读取最新状态，新请求核对用户、成员、客户、上架、公开性、调用开关、范围、实际发布、有效价格及供给；交付前继续核对身份和安全撤销边界。平台 trial 是独立测试身份，前台体验不能借用。</Paragraph>
      <Paragraph>在途任务冻结身份、请求代次及原凭证。普通下架阻止新请求，已合法开始的原请求按原配置完成；主动取消、身份变化、撤权及原密钥撤销仍阻断交付。已取消任务不会因重新上架自动重启。上架检查中的 24 小时验证窗口不作为运行时自动下架条件。</Paragraph>
      <Paragraph>存量服务的销售状态、调用权限、路由和映射继续按原有记录处理。实际调用地址由部署配置决定。</Paragraph>
      <Heading>全站配置与数据</Heading><Paragraph>初始资源在 src/mock 配置，系统内置来源与用户新增、修改、删除分开记录。前台 Key、订单、组织成员、智能路由和后台使用同一份版本业务数据；客户智能路由与供应渠道路由分开。统计从共享请求和显式登录事件派生。旧无归属存档保留，不自动归给当前客户；已有工作区不因刷新或配置更新补回默认资源。配置随静态产物打包，运行数据仅同源同浏览器共享，不支持跨浏览器云同步。本轮不提供新套餐销售。</Paragraph><Heading>本地同步与历史</Heading><Paragraph>成功保存后通知同页；同源标签页通过 storage 更新，重新聚焦时复查。后台未保存表单继续使用修订冲突保护。存储损坏或写入失败时停止，不恢复默认全开放目录。前台会话与草稿按用户及客户隔离；旧无归属记录保留但不自动认领。文字及参数可刷新恢复；本地图片和录音仅在当前标签页内保留，刷新后需重新添加。</Paragraph>
      <Heading>运维调用观测</Heading><Paragraph>调用数据统计客户最终结果，服务监控统计已派发且有独立时间的上游尝试。服务监控在对比表下方展开明细，按父 Request ID 和原始尝试序号打开共享请求详情。前置错误按明确的首次派发前失败证据筛选，趋势与样本来自可查询记录。客户请求和前置错误分别保存显示列，表头排序作用于全部筛选结果。详情和 CSV 保留脱敏元数据。旧尝试没有独立时间时仍可在父请求详情查看。</Paragraph>
      <Heading>运营统计补齐</Heading><Paragraph>本轮仅补充调用、Token 和身份行为指标，所有与金额相关的统计及消费用户指标暂缓。用户 Token 用量排行按明确调用用户归属，未采集用户不反推。调用数据增加失败影响用户/模型、截止时间和失败原因聚合，未知故障归属不补造。服务商启用数量不等于在线数量。模型详情只展示当前空间近七天观测，不代表平台公开性能或 SLA；登录留存、容量和健康度中心仍处方案阶段。</Paragraph>
      <Paragraph>调用日志和服务监控共用独立的内存样例。平台管理员可体验完整日志、按项目留存新模拟报文，以及前置错误采样和过期清理。模拟计数、正文、设置和性能样本不写入共享请求及用量数据，实际监控指标按已有采集记录显示。</Paragraph>
      <Heading>研发实现边界</Heading><Paragraph>以上为本地 mock 交互，未接真实认证、模型网关、计费或消息系统。前台结果使用集中配置的本地模板，完成后向共享请求集合写入 Mock 调用事实，前台日志、用量和后台观测读取同一 Request ID；未返回的 Tokens、费用保持待确认，不产生真实扣费。直接 mock 客户请求沿用既有模拟计量。真实研发必须在服务端执行同一准入逻辑，撤销缓存权限，并在异步任务交付前再次检查；浏览器隐藏按钮不能代替服务端授权。仅配置发布不等于可体验，不补造成功回执。</Paragraph>
      <Paragraph>前台 Key、组织和客户路由编辑在打开时冻结修订，其他标签页修改后拒绝旧表单覆盖并保留输入；账号切换清除临时表单及明文 Key，筛选视图按身份隔离。Key 不限额度与 TPM/QPM 输入实际保存，不限 Key 额度仍校验客户额度及权限。统计按实际模型类型、服务和模型调用标识 聚合，不显示固定套餐额度。接入流程区分采购条件已填写和采购价已发布，备用准备完成不自动投入路由。</Paragraph>
      </> : <>
      <Heading>模块职责</Heading><Paragraph>{supply ? '在渠道列表维护连接及接入模型，在渠道健康查看上游观测。服务商主体由基础资料维护。' : '基础资料维护模型、服务商、模型作者、模型系列及计量字典。模型资料记录身份与能力。'}</Paragraph>
      <Heading>字段与概念口径</Heading><Paragraph>模型的内部稳定关联标识称“模型 ID”；模型资料的 modelId 称“模型编码”，服务记录的 modelId 或渠道服务 callId 称“模型调用标识”，不凭字段同名、标识相似或名称合并身份。服务商请求参数称“上游模型调用标识”，客户请求参数称“模型调用标识”。模型作者与采购服务商分开；供应成本列称“采购价”，客户销售价格称“平台售价”；完整任务 URL 称“请求地址”，与服务根地址区别。API 密钥列表的“当前绑定渠道”统计配置绑定，包含未启用渠道，不代表调用次数。</Paragraph><Heading>统一关联</Heading><Paragraph>一份模型资料对应多个服务商，每家服务商可以提供多个渠道。以稳定的模型资料 ID 关联，不按显示名称或相似版本自动合并；上游模型调用标识 属于渠道调用配置。</Paragraph>
      <Heading>{supply ? '添加与移除' : '维护与引用'}</Heading><ul>{supply ? <><li>在「渠道列表」点「添加新的渠道」。进入详情的「模型列表」后使用「获取模型列表」或「自定义添加模型」。</li><li>编辑地址、协议或凭证时核对受影响的模型，并对候选配置完成测试再应用。未提交配置不影响当前生效渠道。</li><li>删除渠道前核对关联服务和引用，按弹窗处理停服、下架及风险确认。保留资料、其他渠道和历史业务记录。</li></> : <><li>从「基础资料 → 模型」维护参考内容。模型广场维护对客展示内容。</li><li>被供应关系、服务或活动配置引用的资料受删除保护。供应侧移除关系时保留模型资料。</li></>}</ul>

      <Heading>与服务管理的边界</Heading><Paragraph>渠道测试和启用属于接入配置。模型服务关联可用渠道。模型销售管理存量服务的售价和销售状态，模型广场管理展示内容和可见范围。</Paragraph>
      <Heading>Mock 验收</Heading><Paragraph>新建演示数据包含仅有资料、待配置渠道、同模型多服务商、同服务商多渠道等状态；渠道列表和详情读取实际登记的供给关系。已有浏览器数据保留，不自动重置或补造渠道。内置 mock API 覆盖模型发现、异步任务、候选切换、平台试调用与费用试算；模型运营通过 Workers 与 D1 保存配置及模拟任务，图表样例保留静态 JSON；检测与试调用不访问真实模型上游，不构成生产接入证明。</Paragraph>
      </>);
  return <>
    <Button {...(admin ? { size: 'small', variant: 'outline' } : { size: 'sm', variant: 'outline', className: 'development-notes-trigger' })}
      aria-label="研发人员注意：功能说明（非产品功能）" title="研发说明 · 非产品功能"
      onClick={event => { trigger.current = event.currentTarget; setOpen(true); }}>研发人员注意</Button>
    {open && <Modal wide maskClosable={!admin} title="研发人员注意" description="研发专用 · 非产品功能" onClose={close} footer={<Button variant="outline" onClick={close}>关闭说明</Button>}>
      <div className={admin ? 'development-notes-semi' : 'development-notes'}>
        {admin ? <Banner type="warning" closeIcon={null} description="此入口仅用于原型评审与研发对齐，不纳入正式产品功能。"/>
          : <p className="development-notes-label">此入口仅用于原型评审与研发对齐，不纳入正式产品功能。</p>}
        {admin ? (
          <SemiTabs activeKey={area} onChange={setArea} className="development-notes-tabs" aria-label="研发说明分类">
            {noteAreas.map(label => <SemiTabs.TabPane key={label} itemKey={label} tab={label}>{label === area && <div className="development-notes-content">{content}</div>}</SemiTabs.TabPane>)}
          </SemiTabs>
        ) : (
          <Tabs value={area} onValueChange={setArea}>
            <TabsList variant="line" className="development-notes-tabs" aria-label="研发说明分类">
              {noteAreas.map(label => <TabsTrigger key={label} value={label}>{label}</TabsTrigger>)}
            </TabsList>
            <TabsContent value={area}>{content}</TabsContent>
          </Tabs>
        )}
      </div>
    </Modal>}
  </>;
}
