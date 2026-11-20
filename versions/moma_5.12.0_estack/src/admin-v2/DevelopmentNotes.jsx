import { loadAdminState, prepareModelServiceShowcase, completeModelServiceShowcase } from './CloudModelOperations';
import { useRef, useState } from 'react';
import { Banner, Button as SemiButton, Tabs as SemiTabs, Typography } from '@douyinfe/semi-ui';
import { isServiceShowcase } from './service-showcase';
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
  const Button = AdminNotesButton;
  const Heading = AdminNotesHeading;
  const Paragraph = Typography.Paragraph;
  const [open, setOpen] = useState(false), trigger = useRef(null);
  const [area, setArea] = useState('前台与服务');
  const [mockNotice, setMockNotice] = useState('');
  const [mockBusy, setMockBusy] = useState(false);
  const fresh = loadAdminState().modelData?.sourceScope === 'reference-only-v2';
  const service = area === '前台与服务';
  const supply = area === '渠道管理';
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  const showModels = catalogue => {
    const [path,query]=location.hash.split('?');
    const params=new URLSearchParams(path==='#/admin-2/listing'?query:'');
    params.set('perspective','models');
    if(catalogue==='all')params.set('catalogue','all');else{
      params.delete('catalogue');
      const model=loadAdminState().models.find(row=>row.id===params.get('model'));
      if(model && !isServiceShowcase(model))params.delete('model');
    }
    params.delete('view');
    setOpen(false);
    location.hash=`#/admin-2/listing?${params}`;
  };
  const content = open && (service ? <>
      {admin && <Paragraph>在「访问控制 → 租户管理」统一办理开户和查阅租户资料。对内直接进入默认企业详情。租户管理员在用户控制台管理组织、成员和项目。系统管理员在后台租户详情管理组织及成员，在「项目」里直接新建项目，点开指定项目后配置或查看记录，并可在「模型开通」按模型新增授权、配置 RPM / TPM 或移除。</Paragraph>}
      {!fresh && <><Heading>统一登录</Heading><Paragraph>个人、企业和后台共用一个登录入口。后台按角色进入运营或运维，各模块共用服务端会话；过期回统一登录并保留有权访问的原地址，无权限时显示拒绝访问。退出和账号切换撤销旧会话。</Paragraph><Heading>模型运营演示包</Heading>
      <div className="development-model-scope"><span>目录演示范围</span><Button variant="outline" onClick={()=>showModels('showcase')}>演示模型</Button><Button variant="outline" onClick={()=>showModels('all')}>全部模型</Button></div>
      <Button disabled={mockBusy} onClick={async () => {
        setMockBusy(true);
        try { setMockNotice(await prepareModelServiceShowcase() ? '演示包已导入。' : '演示包已存在。'); }
        catch (error) { setMockNotice(error.message); }
        finally { setMockBusy(false); }
      }}>导入模型运营演示包</Button>
      <Button disabled={mockBusy} variant="outline" onClick={async()=>{setMockBusy(true);try {await completeModelServiceShowcase(setMockNotice);}catch(error){setMockNotice(error.message);}finally{setMockBusy(false);}}}>完成两模型演示流程</Button>
      <Paragraph role="status">{mockNotice}</Paragraph></>}
      {fresh && <Paragraph>内置服务商目录可从「渠道管理 → 服务商详情 → 批量接入 → JSON」载入，校验后提交。</Paragraph>}
      <Heading>渠道协议、容量和密钥</Heading><Paragraph>上游协议下拉按顺序提供「OpenAI 兼容 API（Chat Completions）」「OpenAI 兼容 API（Responses）」「Anthropic Messages API」。两种 OpenAI 接口分别保存类型，并使用各自路径、请求字段及响应解析。非对话模型沿用对应 OpenAI 任务接口；已保存的任务端点和业务数据保留。容量只展示已配置指标：零项显示「未配置」，一至两项直接显示数值和单位，超过两项显示前两项及「更多 N 项」，浮层只列剩余指标。「容量设置」独立放在渠道操作中。缺失值不代表零或无限。渠道配置只选择服务商密钥组并显示可用数量、主要密钥脱敏值及状态。「管理密钥池」进入服务商 API 密钥池并定位所选组，离开前沿用未保存保护，已有渠道可返回配置。渠道专属密钥随渠道提交。渠道配置与测试不再内联添加共享密钥。</Paragraph>
      <Heading>模型运营管理流程</Heading><Paragraph>渠道管理维护协议、地址、上游模型调用标识及凭证；模型服务列表直接打开「路由及映射」和「故障转移配置」宽抽屉，「更多」提供操作记录和服务操作。按永久服务 ID 定位，保持列表筛选和滚动。模型服务列表以永久服务 ID 为一行，独立展示调用标识、API 路径/协议/端点、关联渠道和服务状态，不提供查看归档及批量维护入口。新增服务从渠道管理已登记模型中搜索多选，每批最多 5 个，名称和类型自动沿用。本批共用服务模式，各选项提供差异说明；多选折叠显示首项和剩余数量，整批原子保存，可在创建后配置渠道。列表第一列固定在左侧。四模块的 JSON 按模块、服务商、模型、服务商下模型及具体模型服务分层，详情按钮位于对象信息区。v2 维护文件用 target 标明范围，rows 补齐模型登记、容量、采购、服务技术配置和当前售价，references 提供只读共享连接、密钥脱敏元数据、字典与历史版本。完整内容随页面滚动，对象和数组可逐层展开／收起或全部展开／收起；折叠不影响完整复制与当前范围批量维护，返回保留来源上下文。越界、只读字段、修订冲突及未知字段整批拒绝，连接变更预览显示受影响渠道，编辑使旧预览失效；模式、路由、密钥等变更仍走原业务流程。新建模型服务使用 model_service- 前缀，存量 ID 原样保留。模式设置后固定，在路由及映射中显示。模型调用标识在路由及映射维护。服务列表操作提供删除，确认前核对启用、路由、映射、订单、调用和套餐引用，保留模型资料、渠道及历史；服务操作仍提供启用、停用和归档。模型广场维护用户侧展示许可。模型资料提供参考内容，最终展示信息由模型广场维护；模型资料从独立资料库维护，模型服务配置不提供“查看模型资料”入口；抽屉标题显示当前操作、服务名和调用标识。渠道管理的模型总表按服务商、渠道与模型关联维护采购版本；模型售价按统一服务或渠道服务维护计费项与售价，详情仅保留售价配置和变更记录；删除关联成本、服务路由和销售设置入口，编辑金额下不显示采购成本。变更记录仅展示当前服务的计费项与售价版本，不混入其他操作；全量审计保留。同一模型已保存的销售对象不变。内部服务可无价格完成后台技术验证和启用，缺成本保持待核算，销售费用不适用；经营服务另检查成本、售价及销售对象后上架。灰度上架独立选择有效客户，已保存的销售对象范围继续参与经营检查。价格变更不清技术证据，不追改历史；连接、路由或能力变化要求重验。跨页保留来源对象与筛选，旧接入记录只定位现有资源，不再编辑第二套资料或价格。在启用或上架检查中验证服务。灰度上架、正式上架、下架及可见性配置在模型广场维护。正式上架结束灰度限制。关联服务商可原地新建。渠道直选在路由及映射按服务商分区，区块标题为「服务商：名称」。各区表格依次显示渠道、模型调用标识、对外协议/接口路径、路由策略、上游模型调用标识、上游接口地址、操作。渠道直选的路由配置在当前服务行组下方紧凑展开，每次仅编辑一个服务；主渠道与接口转发表沿用原有事务，标识及固定策略不重复展示，协议、地址和按钮能单行时不强制换行。对外地址使用部署配置 VITE_MOMA_API_BASE_URL（当前原型默认 http://xxxx）拼接完整 URL；缺少配置时显示未配置，不以变量、上游地址或当前页面域名替代。展开时收起主表重复的协议及地址列，协议与地址对齐且复制按钮不掉行；其他渠道区不重复正常主渠道。统一模式从表格上方进入同表编辑，分组和权重的修改实时反映在组内分流比例上，在当前页核对并确认生效。渠道行展示对外接口和上游地址，「查看映射」可核对转发方式，更多操作用于维护映射和路由。路由编辑只选择已有合格渠道，不提供新增接入；模型登记、渠道配置、检测与明确启用统一在渠道管理模块完成后，再返回配置映射。服务商页签为 API 密钥池，名称在前、短 ID 在后，按组上移或下移；改变引用中的首位密钥先完整检测再明确应用，备用排序不触碰当前配置。用户侧登录、目录、订购、API Key 和在线模拟调用读写 D1。图表保留样例。</Paragraph>
      <Heading>账号与空间</Heading><Paragraph>用户面按用户名及账号类型登录。政企账号进入已加入的政企空间，个人账号进入自己的个人空间。链接未指定项目时，恢复当前账号与空间最近选择的可用项目，否则选中第一个可用项目。组织邀请由成员本人确认，后台角色独立于客户空间。</Paragraph>
      <Paragraph>后台政企用户和个人用户可以按数据来源筛选已开通、已注册及可登录的内置演示账号。纯样例仍用于订单、成员及限流演示。个人用户的最近登录在成功登录后更新，缺少实际记录时显示「未记录」。</Paragraph>
      {!fresh && <ul><li>用户面：zqzh（政企账号）、grzh（个人账号）。</li><li>后台：yyg 和 admin-001（系统管理员）、admin-002（运维管理员）、admin-003（运营管理员）。</li></ul>}
      <Paragraph>本地内置账号使用统一演示密码。当前身份与可切换空间显示在顶栏账号菜单。</Paragraph>
      <Heading>目录与调用逻辑</Heading><Paragraph>模型资料、后台服务、当前客户授权与实际 mock 发布配置共同决定目录。模型广场、详情、选择器及体验入口使用稳定服务 ID；统一模型服务模式和各服务商独立服务分别判断。不复制一份已订购名单，不暴露采购价和密钥。未知能力保持未知；没有相应任务页面时显示不可体验。</Paragraph>
      <Paragraph>两模型案例默认一模型一卡，全部模型保留历史服务。点击卡片进入独立详情页，服务商报价逐行展开，API 调用区切换提供方后同步模型调用标识、代码示例与体验入口；URL 保留模型和服务身份，支持刷新和返回。价格取平台发布快照，未提交输入不影响前台；不根据可调用状态推断已订购。API Key 由原管理页维护。模型选择器与新回复保留提供方，避免同名服务混淆。</Paragraph>
      <Paragraph>模型广场可见性只控制列表展示，隐藏时已有订购、API 调用及在途请求继续有效；切回可见不自动上架或发布。真正下架仍会隐藏并拒绝新请求，包括已创建的 Key 和旧成功请求的重放。发送及结果交付前重新读取最新状态，新请求核对用户、成员、客户、上架、公开性、调用开关、范围、实际发布、有效价格及供给；交付前继续核对身份和安全撤销边界。平台 trial 是独立测试身份，前台体验不能借用。</Paragraph>
      <Paragraph>在途任务冻结身份、请求代次及原凭证。普通下架阻止新请求，已合法开始的原请求按原配置完成；主动取消、身份变化、撤权及原密钥撤销仍阻断交付。已取消任务不会因重新上架自动重启。上架检查中的 24 小时验证窗口不作为运行时自动下架条件。</Paragraph>
      <Paragraph>渠道直选模式路由组头分别控制上下架和停服：下架隐藏前台提供方但保留已有 API 权限；停服拒绝该服务商调用。上架与恢复服务互不联动，下架后可确认解绑，仅停用自身路由与渠道关联，供应资源和历史保留。操作复用权限、修订冲突与原子持久化，不改变其他服务商或整个模型的请求代次。路由不展示版本管理，内部历史与并发校验保留。</Paragraph>
      <Heading>全站配置与数据</Heading><Paragraph>初始资源在 src/mock 配置，系统内置来源与用户新增、修改、删除分开记录。前台 Key、订单、组织成员、智能路由和后台使用同一份版本业务数据；客户智能路由与供应渠道路由分开。统计从共享请求和显式登录事件派生。旧无归属存档保留，不自动归给当前客户；已有工作区不因刷新或配置更新补回默认资源。配置随静态产物打包，运行数据仅同源同浏览器共享，不支持跨浏览器云同步。本轮不提供新套餐销售。</Paragraph><Heading>本地同步与历史</Heading><Paragraph>成功保存后通知同页；同源标签页通过 storage 更新，重新聚焦时复查。后台未保存表单继续使用修订冲突保护。存储损坏或写入失败时停止，不恢复默认全开放目录。前台会话与草稿按用户及客户隔离；旧无归属记录保留但不自动认领。文字及参数可刷新恢复；本地图片和录音仅在当前标签页内保留，刷新后需重新添加。</Paragraph>
      <Heading>运维调用观测</Heading><Paragraph>调用数据统计客户最终结果，服务监控按有独立时间的派发统计上游尝试。点击监控指标在对比表下方展开明细，按父 Request ID 和原始尝试序号打开共享请求详情。调用日志中的前置错误按首次派发前的失败证据筛选，趋势和样本来自可查询记录。客户请求和前置错误分别保存显示列。详情和 CSV 保留脱敏元数据。旧尝试没有独立时间时仍可在父请求详情查看。</Paragraph>
      <Paragraph>调用日志和服务监控共用独立的内存样例。平台管理员可体验完整日志、按项目留存新模拟报文，以及前置错误采样和过期清理。模拟计数、正文、设置和性能样本不写入共享请求及用量数据，实际监控指标按已有采集记录显示。</Paragraph>
      <Heading>研发实现边界</Heading><Paragraph>Worker 负责原型账号验证、权限校验及模拟调用，将调用事实与计价汇总写入 D1。前台日志、用量和后台观测读取同一 Request ID。未采集的用量与费用保持待确认。直接 mock 客户请求沿用既有模拟计量。真实研发必须在服务端执行同一准入逻辑，撤销缓存权限，并在异步任务交付前再次检查；浏览器隐藏按钮不能代替服务端授权。仅配置发布不等于可体验，不补造成功回执。</Paragraph>
      <Paragraph>前台 Key、组织和客户路由编辑在打开时冻结修订，其他标签页修改后拒绝旧表单覆盖并保留输入；账号切换清除临时表单及明文 Key，筛选视图按身份隔离。Key 不限额度与 TPM/QPM 输入实际保存，不限 Key 额度仍校验客户额度及权限。统计按实际模型类型、服务和模型调用标识 聚合，不显示固定套餐额度。接入流程区分采购条件已填写和采购价已发布，备用准备完成不自动投入路由。</Paragraph>
      </> : <>
      <Heading>模块职责</Heading><Paragraph>{supply ? '管理模型的供应来源、接入配置与渠道价格。总表页头仅保留「录入服务商」，表单维护名称、不可变编码、供给类型、多地址、多密钥、图标、官网及300字描述。服务商详情可分别登记模型和接入渠道。供应模型按模型主档关联。' : '模型资料包含模型、计费项、计费单位和货币四个页签；成本和售价的计量配置共用这里的字典。模型资料描述模型身份与能力，不代表已接入、可调用或已上架。'}</Paragraph>
      <Heading>字段与概念口径</Heading><Paragraph>内部稳定关联标识称“资料 ID”；模型资料的 modelId 称“模型编码”，服务记录的 modelId 或渠道服务 callId 称“模型调用标识”，不凭字段同名、标识相似或名称合并身份。服务商请求参数称“上游模型调用标识”，客户请求参数称“模型调用标识”。模型作者与采购服务商分开；供应成本列称“采购价”，客户销售价格称“平台售价”；完整任务 URL 称“请求地址”，与服务根地址区别。API 密钥列表的“当前绑定渠道”统计配置绑定，包含未启用渠道，不代表调用次数。</Paragraph><Heading>统一关联</Heading><Paragraph>一份模型资料对应多个服务商，每家服务商可以提供多个渠道。以稳定的模型资料 ID 关联，不按显示名称或相似版本自动合并；上游模型调用标识 属于渠道调用配置。</Paragraph>
      <Heading>{supply ? '添加与移除' : '维护与引用'}</Heading><ul>{supply ? <><li>“添加模型”搜索多选“模型资料 → 模型”中的主档，建立当前服务商引用；模型视图只展示至少已有一家服务商登记的模型，同一主档聚合去重；服务商与模型视图共用有效登记和主档分组，数量同步去重；已归档资料的旧登记和渠道保留历史，不混入当前列表。无渠道也显示已登记服务商，未登记资料不进入模型视图。</li><li>“添加渠道”仅选当前服务商已有模型，必填渠道名称、上游模型调用标识、API地址及密钥。默认首个共享密钥组，也可输入只属于当前渠道的独立密钥；成本在渠道管理的模型总表维护，接入时可暂缺；明确零价与缺价分开。</li><li>批量模型与供应关系、渠道与映射/采购/独立密钥分别原子提交；失败不留下部分登记。明文密钥不进入草稿、审计、D1或共享组；保存不自动测试、启用或上架。</li><li>已有资料按稳定 ID 复用，不按相似名称、域名或旧内部 ID 猜测合并。明确独立保存的资源保留，取消渠道不会删除它们。</li><li>删除渠道须先解除模型服务服务商/渠道及当前路由/草稿关联，下架、停服或供给停用不等于解绑；未完成接入/检测任务也阻断。共用渠道仅删除当前模型关联，最后一个关联删除后原子归档资源。全部渠道删除后才能移除当前服务商的模型登记，保留模型资料、其他服务商及历史。</li></> : <><li>从资料管理独立新建资料，只进入模型资料 → 模型，不自动增加服务商、渠道或服务。</li><li>快速接入可创建最低身份资料，标为待完善；未填写的任务、模态和能力保持未知，正式服务继续要求完整资料与有效验证。</li><li>模型资料维护参考内容，模型广场维护最终运营展示内容；能力变更遵循影响确认与重新验证规则，不能静默修改渠道地址、密钥、价格和路由。</li><li>被供应关系、服务或活动配置引用的资料不能删除。供应侧移除关系不删除模型资料。</li></>}</ul>
      {supply && <><Heading>模型渠道</Heading><Paragraph>「服务商」和「模型」页签均从总表进入详情。在服务商详情点击模型，定位该模型对应的服务商；在模型详情点击服务商，定位该服务商的对应模型。服务商详情的「模型渠道」一条渠道一行，不再展开；模型信息按渠道重复展示，状态、容量、成本与操作只对应当前渠道。不展示待配置模型按钮，零渠道登记保留，可从「新增」选择已有模型继续配置。渠道行的更多菜单移除当前渠道，沿用关联检查与风险确认；保留主档、其他服务商、历史及全部存量 ID。</Paragraph><Paragraph>服务商详情直接查看渠道和计费；模型详情仍可按服务商展开。官方参考地址单独展示，已配置地址在「上游 API 地址」列查看。「详情」与首列定位一致。「配置」维护当前模型渠道；「渠道名称」只修改当前关联的来源名称，列表、重新打开和 JSON 保持一致，不改共享连接及其他模型渠道名称；不提供独立连接页面；共享配置统一在「模型渠道 → 编辑」维护，「高级配置与历史」保留影响范围、候选验证、历史配置及回滚。协议、地址或密钥发生变化时才显示提醒。通过「测试连接」验证，成功后点击「保存」使配置生效。仅修改渠道名称或上游模型调用标识 可直接保存。采购价在渠道管理的模型总表查看及维护。共享API密钥仍按原服务商、密钥组及渠道引用管理。</Paragraph><Heading>渠道批量操作</Heading><Paragraph>服务商详情的批量模式按原渠道 ID 勾选。名称只改所选来源名称；地址按共享连接去重，预览全部关联并确认未选中的影响。候选测试通过前旧地址保持有效，全部必要验证通过后整批保存。当前连接和候选地址测试分开，沿用既有任务、回执、查询恢复与高成本任务授权；不自动启用、修改路由或上架。批量启停列出关联服务及共享连接影响并明确确认，只变更所选渠道；批量移除按所选并集沿用引用处理和风险确认，不连带删除服务商、模型资料及其他渠道。新增支持展示名与编码联动选择或新建，地址取服务商 Base URL 下拉首项，编辑保留原值。</Paragraph><Heading>最低身份与参考目录</Heading><Paragraph>目录外模型的任务、输入／输出模态、上下文和工具能力不按类型补造，资料标为待完善；技术测试和明确启用允许最低身份资料，正式服务仍校验资料、能力、采购计量与发布证据。参考目录供查看和填写，不代表账号已授权、真实调用成功或采购报价。</Paragraph><Heading>密钥与轮换范围</Heading><Paragraph>可复用服务商可用密钥组，或内联输入新 Key 随接入保存。明文只留在当前输入会话；事务仅接收掩码、指纹及受控元数据，输入恢复需重新输入。渠道专属 Key 按目标渠道轮换，组主要 Key 按全部组引用验证；混合引用先明确范围，不遗漏专属绑定，也不误改共享主要 Key。列表按真实绑定显示当前绑定渠道；未使用的备用 Key 替换不触碰在线渠道，删除和撤销仍检查完整引用。正常轮换不自动撤销旧 Key，应用后保留成功结果与版本。</Paragraph><Heading>测试与明确应用</Heading><Paragraph>保存接入不自动测试或启用。普通基础测试点击标明产生用量的按钮即授权本次操作；图片、语音、视频及专项检查继续明确任务和用量。地址或 Key 的“测试新配置／密钥”合并保存候选与测试，失败不改当前值；通过后再一次明确点击应用。影响范围前置展示，测试派发与应用前都核对冻结的候选、模型与服务引用、凭证、配置版本和权限；范围变化先拒绝派发，不自动应用或重试。</Paragraph><Heading>新增映射与历史恢复</Heading><Paragraph>新渠道单模型或向已有渠道新追加的一条映射，在从未启停、没有服务影响且当前验证有效时，可直接明确点击启用。历史恢复、多项选择或存在服务影响时，列表和测试入口共用固定选择与完整预检，不保留旧结果直达启用的旁路；其他映射保持当前状态。</Paragraph><Heading>简化验收口径</Heading><Paragraph>目录内首次接入上一轮实测为新 Key 6 项、已有 Key 5 项；本轮 mock 浏览器实测目录外新服务商＋新模型＋新 Key 9 项，已有渠道追加单模型 6 项，修改地址、正常专属 Key 或组主要 Key 轮换各 5 项。共享轮换实测 2 条引用一次启动全部测试；混合引用需另计范围选择。起点为已打开的添加表单或目标可见列表，终点为技术启用或明确应用。字段填写、独立选择和必要提交分别计数，不能把多个字段合为一步，也不把业务动作称为鼠标点击数。正式服务上架另计。</Paragraph></>}
      <Heading>与服务管理的边界</Heading><Paragraph>采购价为空仍可后台技术验证和内部启用，缺成本待核算。模型服务维护身份、供给、路由、调用范围及技术启停；模型售价独立负责售价、销售对象、展示与上架；接入成功不自动对外开放。接入动作数只计算到技术启用，不表示客户服务已完成上架。</Paragraph>
      <Heading>Mock 验收</Heading><Paragraph>新建演示数据包含仅有资料、待配置渠道、同模型多服务商、同服务商多渠道等状态；两种供应视图读取相同关系。已有浏览器数据保留，不自动重置或补造渠道。内置 mock API 覆盖模型发现、异步任务、候选切换、平台试调用与费用试算；模型运营通过 Workers 与 D1 保存配置及模拟任务，图表样例保留静态 JSON；检测与试调用不访问真实模型上游，不构成生产接入证明。</Paragraph>
      </>);
  return <>
    <Button size="small" variant="outline" className={admin ? undefined : 'development-notes-trigger'}
      aria-label="研发人员注意：功能说明（非产品功能）" title="研发说明 · 非产品功能"
      onClick={event => { trigger.current = event.currentTarget; setOpen(true); }}>研发人员注意</Button>
    {open && <Modal wide maskClosable={!admin} title="研发人员注意" description="研发专用 · 非产品功能" onClose={close} footer={<Button variant="outline" onClick={close}>关闭说明</Button>}>
      <div className="development-notes-semi">
        <Banner type="warning" closeIcon={null} description="此入口仅用于原型评审与研发对齐，不纳入正式产品功能。"/>
        <SemiTabs activeKey={area} onChange={setArea} className="development-notes-tabs" aria-label="研发说明分类">
            {noteAreas.map(label => <SemiTabs.TabPane key={label} itemKey={label} tab={label}>{label === area && <div className="development-notes-content">{content}</div>}</SemiTabs.TabPane>)}
        </SemiTabs>
      </div>
    </Modal>}
  </>;
}
