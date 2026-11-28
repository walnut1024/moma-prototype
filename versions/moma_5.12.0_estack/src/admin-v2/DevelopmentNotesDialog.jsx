import { useChannelText } from './channel-language';
import { loadAdminState, prepareModelServiceShowcase, completeModelServiceShowcase } from './CloudModelOperations';
import { useState } from 'react';
import { Banner as SemiBanner, Button as SemiButton, Tabs as SemiTabs, Typography as SemiTypography } from '@douyinfe/semi-ui';
import { Modal as FrontNotesModal } from './ServiceUI';
import { XaBanner, XaButton, XaOperationDialog, XaTabs, XaTypography } from './xa24/HaloComponents.jsx';

const noteAreas = ['前台与服务', '模型接入', '模型资料'];

export default function DevelopmentNotesDialog({ admin, open, close }) {
  const translateLabel = useChannelText();
  const Control = admin ? XaButton : SemiButton;
  const Typography = admin ? XaTypography : SemiTypography;
  const Banner = admin ? XaBanner : SemiBanner;
  const Tabs = admin ? XaTabs : SemiTabs;
  const Modal = admin ? XaOperationDialog : FrontNotesModal;
  const Button = ({ variant, ...props }) => <Control theme={variant === 'outline' ? 'light' : 'solid'}
    type={variant === 'outline' ? 'tertiary' : 'primary'} {...props}/>;
  const Heading = ({ children }) => <Typography.Title heading={5} component="h3">{children}</Typography.Title>;
  const Paragraph = Typography.Paragraph;
  const [area, setArea] = useState('前台与服务');
  const [mockNotice, setMockNotice] = useState('');
  const [mockBusy, setMockBusy] = useState(false);
  if (!open) return null;
  const fresh = loadAdminState().modelData?.sourceScope === 'reference-only-v2';
  const service = area === '前台与服务';
  const supply = area === '模型接入';
  const content = (service ? <>
      {admin && <Paragraph>「租户管理」在企业内用时直接打开默认企业。系统管理员可从「模型授权」批量授权服务中的模型服务。内用项目可在管理工作台查看，由租户管理员在用户控制台建立项目、配置成员并开通模型。对外运营时，系统管理员可在后台新建外营企业项目并配置成员、预算和限流。租户详情的「查看项目」筛选本租户，个人租户可打开默认项目。</Paragraph>}
      {!fresh && <><Heading>统一登录</Heading><Paragraph>个人、企业和后台共用一个登录入口。后台按角色进入运营或运维，各模块共用服务端会话；过期回统一登录并保留有权访问的原地址，无权限时显示拒绝访问。退出和账号切换撤销旧会话。</Paragraph><Heading>模型运营演示包</Heading>
      <Button disabled={mockBusy} onClick={async () => {
        setMockBusy(true);
        try { setMockNotice(await prepareModelServiceShowcase() ? '演示包已导入。' : '演示包已存在。'); }
        catch (error) { setMockNotice(error.message); }
        finally { setMockBusy(false); }
      }}>导入模型运营演示包</Button>
      <Button disabled={mockBusy} variant="outline" onClick={async()=>{setMockBusy(true);try {await completeModelServiceShowcase(setMockNotice);}catch(error){setMockNotice(error.message);}finally{setMockBusy(false);}}}>完成两模型演示流程</Button>
      <Paragraph role="status">{mockNotice}</Paragraph></>}
      {fresh && <Paragraph>在「基础资料 → 服务商」维护主体及供应登记，在「模型接入 → 连接列表」创建和维护模型连接。</Paragraph>}
      <Heading>连接接口格式、容量和密钥</Heading><Paragraph>新建第三方连接时，接口格式决定只读的接口端点，完整请求地址随接口格式和服务地址实时更新。编辑手动配置的连接时可核对和修改端点路径。新建内置模型推理服务连接时，单选一个就绪模型实例。服务商固定为「内置模型推理」。接口格式、接口端点和服务地址从对应的部署端点带出，均只读。填写连接名称，可填写简介。调用时保留服务地址的完整路径和版本前缀，忽略末尾斜杠，再追加已保存的接口端点。基本信息与列表展示生效的接口格式、接口端点和服务地址。服务商侧的上游接口格式下拉按顺序提供「OpenAI Chat」「OpenAI Responses」「Anthropic Messages」。两种 OpenAI 接口分别保存类型，并使用各自路径、请求字段及响应解析。图像、视频、语音等模型沿用对应 OpenAI 任务接口；已保存的任务端点和业务数据保留。容量只展示已配置指标：零项显示「未配置」，一至两项直接显示数值和单位，超过两项显示前两项及「更多 N 项」，浮层只列剩余指标。从连接详情的「模型列表」查看容量并打开「容量设置」。「模型成本」展示采购成本并提供「成本设置」。容量缺失值不代表零或无限。连接可选用上游 API 密钥或输入连接专属密钥。多把密钥的优先级和选择策略在当前连接维护。连接配置与测试不再内联添加共享密钥。</Paragraph>
      <Heading>模型运营管理流程</Heading><Paragraph>新建模型服务后，按接口格式和连接关联已登记的上游模型。路由策略继承全局。「模型广场」在卡片维护展示资料，运营人员从模型服务列表选择服务并确认是否同款。「商业运营 → 模型售卖」自动展示模型服务，首次成功发布刊例价时创建一条对应的售卖记录。服务配置、卡片、价目和订单由 D1 按各自 ID 保存。</Paragraph>
      <Heading>账号与空间</Heading><Paragraph>用户面按用户名及账号类型登录。政企账号进入已加入的政企空间，个人账号进入自己的个人空间。链接未指定项目时，恢复当前账号与空间最近选择的可用项目，否则选中第一个可用项目。组织邀请由成员本人确认，后台角色独立于租户空间。</Paragraph>
      <Paragraph>后台政企用户和个人用户可以按数据来源筛选已开通、已注册及可登录的内置演示账号。纯样例仍用于订单、成员及限流演示。个人用户的最近登录在成功登录后更新，缺少实际记录时显示「未记录」。</Paragraph>
      {!fresh && <ul><li>用户面：zqzh（政企账号）、grzh（个人账号）。</li><li>后台：yyg 和 admin-001（系统管理员）、admin-002（运维管理员）、admin-003（运营管理员）。</li></ul>}
      <Paragraph>本地内置账号使用统一演示密码。当前身份与可切换空间显示在顶栏账号菜单。</Paragraph>
      <Heading>目录与调用逻辑</Heading><Paragraph>模型资料、后台服务、当前租户授权与实际 mock 发布配置共同决定目录。模型广场、详情、选择器及体验入口使用稳定服务 ID；每个模型服务独立校验。不复制一份已订购名单，不暴露服务商成本价和密钥。未知能力保持未知；没有相应任务页面时显示不可体验。</Paragraph>
      <Paragraph>两模型案例默认一模型一卡，全部模型保留历史服务。点击卡片进入独立详情页，服务商报价逐行展开，API 调用区切换提供方后同步模型 ID、代码示例与体验入口；URL 保留模型和服务身份，支持刷新和返回。价格取平台发布快照，未提交输入不影响前台；不根据可调用状态推断已订购。API Key 由原管理页维护。模型选择器与新回复保留提供方，避免同名服务混淆。</Paragraph>
      <Paragraph>卡片设为不可见或预告可见时，仅改变广场展示，关联服务的售卖状态、价格和订单均保留。发送及结果交付前重新读取最新状态，新请求核对用户、成员、租户、上架、公开性、调用开关、范围、实际发布、有效价格及供给；交付前继续核对身份和安全撤销边界。平台 trial 是独立测试身份，前台体验不能借用。</Paragraph>
      <Paragraph>在途任务冻结身份、请求代次及原凭证。普通下架阻止新请求，已合法开始的原请求按原配置完成；主动取消、身份变化、撤权及原密钥撤销仍阻断交付。已取消任务不会因重新上架自动重启。上架检查中的 24 小时验证窗口不作为运行时自动下架条件。</Paragraph>
      <Paragraph>存量服务的销售状态、调用权限、路由和映射继续按原有记录处理。实际调用地址由部署配置决定。</Paragraph>
      <Heading>全站配置与数据</Heading><Paragraph>初始资源在 src/mock 配置，系统内置来源与用户新增、修改、删除分开记录。前台 Key、订单、组织成员、智能路由和后台使用同一份版本业务数据；租户智能路由与上游模型路由分开。统计从共享请求和显式登录事件派生。旧无归属存档保留，不自动归给当前租户；已有工作区不因刷新或配置更新补回默认资源。初始配置随产物打包。模型服务、订单、项目 Key、组织和智能路由由 Worker 按会话读写 D1。当前标签页的演示、筛选及未提交输入由浏览器保存。</Paragraph><Heading>本地同步与历史</Heading><Paragraph>成功保存后通知同页；同源标签页通过 storage 更新，重新聚焦时复查。后台未保存表单继续使用修订冲突保护。存储损坏或写入失败时停止，不恢复默认全开放目录。前台会话与草稿按用户及租户隔离；旧无归属记录保留但不自动认领。文字及参数可刷新恢复；本地图片和录音仅在当前标签页内保留，刷新后需重新添加。</Paragraph>
      <Heading>运维调用观测</Heading><Paragraph>「运维 → 运行分析 → 调用日志」展示租户请求的最终结果、各次上游尝试及前置错误。前置错误按首次派发前的失败证据筛选，趋势和样本来自可查询记录。请求和前置错误分别保存显示列。详情和 CSV 保留脱敏元数据。旧尝试没有独立时间时仍可在父请求详情查看。</Paragraph>
      <Paragraph>调用日志和连接健康提供独立的内存样例。平台管理员可体验完整日志、按项目留存新模拟报文，以及前置错误采样和过期清理。模拟计数、正文、设置和性能样本不写入共享请求及用量数据，实际指标按已有采集记录显示。</Paragraph>
      <Heading>研发实现边界</Heading><Paragraph>Worker 负责原型账号验证、权限校验及模拟调用，将调用事实与计价汇总写入 D1。前台日志、用量和后台观测读取同一 Request ID。未采集的用量与费用保持待确认。直接 mock 请求沿用既有模拟计量。真实研发必须在服务端执行同一准入逻辑，撤销缓存权限，并在异步任务交付前再次检查；浏览器隐藏按钮不能代替服务端授权。仅配置发布不等于可体验，不补造成功回执。</Paragraph>
      <Paragraph>前台 Key、组织和租户路由编辑在打开时冻结修订，其他标签页修改后拒绝旧表单覆盖并保留输入；账号切换清除临时表单及明文 Key，筛选视图按身份隔离。Key 不限额度与 TPM/QPM 输入实际保存，不限 Key 额度仍校验租户额度及权限。统计按实际模型类型、服务和模型 ID 聚合，不显示固定套餐额度。接入流程区分采购条件已填写和服务商成本价已发布，备用准备完成不自动投入路由。</Paragraph>
      </> : <>
      <Heading>模块职责</Heading><Paragraph>{supply ? '在连接列表维护连接及接入模型，在连接健康查看上游观测。服务商主体由基础资料维护。' : '基础资料维护模型资料、服务商、模型作者、模型系列及计量字典。模型服务、连接配置和广场卡片保存各自的字段值。'}</Paragraph>
      <Heading>字段与概念口径</Heading><Paragraph>内部稳定关联标识称“资料 ID”；模型资料的 modelId 称“模型编码”，服务记录的 modelId 或模型服务 callId 称“模型 ID”，不凭字段同名、标识相似或名称合并身份。服务商请求参数称“上游模型 ID”，请求参数称“模型 ID”。模型作者与采购服务商分开；供应成本列称“服务商成本价”，对外公布的标准单价称“模型刊例价”；完整任务 URL 称“请求地址”，与服务地址区别。API 密钥列表的“当前绑定连接”统计配置绑定，包含待验证的连接。</Paragraph><Heading>统一关联</Heading><Paragraph>一份模型资料对应多个服务商，每家服务商可以提供多个连接。以稳定的模型资料 ID 关联，不按显示名称或相似版本自动合并；上游模型 ID 属于连接调用配置。</Paragraph>
      <Heading>{supply ? '添加与移除' : '维护与引用'}</Heading><ul>{supply ? <><li>在连接详情的「模型列表」打开「手动添加」。候选读取当前服务商在「基础资料 → 服务商 → 供应模型」中的登记，接口格式和完整请求地址匹配且上游模型 ID 唯一时才列出。上游模型 ID 只读。缺少匹配资料时，点击「维护模型」，补齐供应资料后返回载入最新数据。第三方连接可通过「获取模型列表」从当前上游查询候选。</li><li>编辑地址、接口格式或凭证时核对受影响的模型，并对候选配置完成测试再应用。未提交配置不影响当前生效连接。</li><li>删除连接前核对关联服务和引用，按弹窗处理停服、下架及风险确认。保留资料、其他连接和历史业务记录。</li></> : <><li>从「基础资料 → 模型」登记模型资料。手工新建和编辑时，参数量选填，其余字段必填。模型作者由所选系列带出。上下文长度可用 K 或 M 填写。</li><li>被供应关系、服务或活动配置引用的资料受删除保护。供应侧移除关系时保留模型资料。</li></>}</ul>
      <Heading>与服务管理的边界</Heading><Paragraph>连接状态由测试结果和保护条件判定。模型服务关联可用上游模型。模型售卖维护服务的模型刊例价、销售对象和售卖状态。模型广场维护展示内容和可见范围。</Paragraph>
      <Heading>Mock 验收</Heading><Paragraph>新建演示数据包含仅有资料、待配置连接、同模型多服务商、同服务商多连接等状态；连接列表和详情读取实际登记的供给关系。已有浏览器数据保留，不自动重置或补造连接。内置 mock API 覆盖模型发现、异步任务、候选切换、平台试调用与费用试算；模型运营通过 Workers 与 D1 保存配置及模拟任务，图表样例保留静态 JSON；检测与试调用不访问真实模型上游，不构成生产接入证明。</Paragraph>
      </>);
  return <Modal wide maskClosable={!admin} title={translateLabel("研发人员注意")} description="研发专用 · 非产品功能" onClose={close} footer={<Button variant="outline" onClick={close}>关闭说明</Button>}>
      <div className={admin ? 'development-notes-xa24' : 'development-notes-semi'}>
        <Banner type="warning" closeIcon={null} description="此入口仅用于原型评审与研发对齐，不纳入正式产品功能。"/>
        <Tabs activeKey={area} onChange={setArea} className="development-notes-tabs" aria-label="研发说明分类">
            {noteAreas.map(label => <Tabs.TabPane key={label} itemKey={label} tab={label}>{label === area && <div className="development-notes-content">{content}</div>}</Tabs.TabPane>)}
        </Tabs>
      </div>
    </Modal>;
}
