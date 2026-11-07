import { prepareLinkedAccounts, LINKED_USERS, LINKED_ADMINS } from '../linked-accounts.mjs';
import { directorySnapshot } from '../service-directory.mjs';
import { loadAdminState, prepareModelServiceShowcase, completeModelServiceShowcase } from './CloudModelOperations';
import { useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { isServiceShowcase } from './service-showcase';
import { Modal } from './ModelOperationsUI';
import './development-notes.css';

export default function DevelopmentNotes() {
  const [open, setOpen] = useState(false), trigger = useRef(null);
  const [area, setArea] = useState('前台与服务');
  const [notice, setNotice] = useState(''), [mockNotice, setMockNotice] = useState('');
  const [mockBusy, setMockBusy] = useState(false);
  const service = area === '前台与服务';
  let currentIdentity; if (open && service) { try { currentIdentity = directorySnapshot().identity; } catch {} }
  const supply = area === '渠道接入';
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  const showModels = catalogue => {
    const [path,query]=location.hash.split('?');
    const params=new URLSearchParams(path==='#/admin-2/listing'?query:'');
    params.set('perspective','models');
    if(catalogue==='all')params.set('catalogue','all');else{
      params.delete('catalogue');
      const model=loadAdminState(localStorage).models.find(row=>row.id===params.get('model'));
      if(model && !isServiceShowcase(model))params.delete('model');
    }
    params.delete('view');
    setOpen(false);
    location.hash=`#/admin-2/listing?${params}`;
  };
  return <><Button ref={trigger} type="button" variant="outline" size="sm" className="development-notes-trigger" aria-label="研发人员注意：功能说明（非产品功能）" title="研发说明 · 非产品功能" onClick={() => setOpen(true)}>研发人员注意</Button>
    {open && <Modal wide title="研发人员注意" description="研发专用 · 非产品功能" onClose={close} footer={<Button variant="outline" onClick={close}>关闭说明</Button>}><div className="development-notes">
      <p className="development-notes-label">此入口仅用于原型评审与研发对齐，不纳入正式产品功能。</p>
      <Tabs value={area} onValueChange={setArea}>
        <TabsList variant="line" className="development-notes-tabs" aria-label="研发说明分类">
          {['前台与服务', '渠道接入', '模型资料'].map(label => <TabsTrigger key={label} value={label}>{label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value={area}>
      {service ? <>
      <h3>模型服务案例</h3><div className="development-model-scope"><span>目录演示范围</span><Button variant="outline" onClick={()=>showModels('showcase')}>演示模型</Button><Button variant="outline" onClick={()=>showModels('all')}>全部模型</Button></div><p>目录主入口为新增模型服务，接入与资料批量导入分别在所属模块；演示范围仅在本说明切换，模型资料展示有效统一主档；渠道接入的模型视图只汇总已有服务商登记，点击模型展示服务商和渠道列表；服务商通过搜索多选登记引用，模型服务演示范围独立，新增服务选择器读取同一批主档，用户新增和修改的资源仍可见。默认展示两个模型：DeepSeek-V4-Flash-0731 为统一模型服务模式，GLM-5.3 为渠道直选模式，通过 glm-5.3-moma 指定 MoMA 自营渠道，通过 glm-5.3-zhipu 指定智谱原厂渠道。MoMA 提供自营和转售。历史内置案例保留在全部模型中；未标记来源的旧存档按用户数据保留，不自动清理。能力、采购价、售价及凭证为演示值，不代表真实规格或报价。配置补齐后保持下架，平台试调用并发布后再明确上架。</p><Button disabled={mockBusy} onClick={async () => { try { setMockNotice(await prepareModelServiceShowcase() ? '两个案例已准备，请刷新页面查看。原有记录和历史保留。' : '案例已存在，保留后续编辑。'); } catch (error) { setMockNotice(error.message); } }}>准备两个模型服务案例</Button><Button disabled={mockBusy} variant="outline" onClick={async()=>{setMockBusy(true);try {await completeModelServiceShowcase(setMockNotice);}catch(error){setMockNotice(error.message);}finally{setMockBusy(false);}}}>验证并上架两个案例</Button><p role="status">{mockNotice}</p>
      <h3>五模块管理流程</h3><p>渠道接入维护协议、地址、上游标识及凭证；模型服务依次为服务概览、渠道与路由、调用授权、验证与调用、操作记录。模型资料是唯一主档，概览只读引用。模型成本按服务商、渠道与模型关联维护采购版本；模型售价按稳定统一／服务商服务维护售价、销售设置与变更记录。内部服务可无价格完成后台技术验证和启用，缺成本保持待核算，销售费用不适用；经营服务另检查成本、售价及销售对象后上架。调用范围仍为模型级有效客户集合，销售范围独立保存。价格变更不清技术证据，不追改历史；连接、路由或能力变化要求重验。跨页保留来源对象与筛选，旧接入记录只定位现有资源，不再编辑第二套资料或价格。服务操作仅提供灰度上架、正式上架、下架及可见性配置；服务状态和可见性在模型名下展示，试调用在验证与调用。灰度指定客户独立保存，与调用授权取交集，正式上架结束灰度限制。关联服务商可原地新建，点击对应服务的路由策略单元格打开路由编辑，包含尚未配置状态；主表操作列直接提供编辑路由、编辑调用标识、模型映射及停用/恢复路由；路由抽屉仅维护路由配置。路由编辑只选择已有合格渠道，不提供接入新渠道；模型登记、渠道配置、检测与明确启用统一在渠道接入模块完成后，再返回配置映射。服务商页签为 API 密钥池，名称在前、短 ID 在后，按组上移或下移；改变引用中的首位密钥先完整检测再明确应用，备用排序不触碰当前配置。此轮不新增租户身份、用户 Key、多层授权或用户端 D1 接口。</p>
      <h3>两面身份与样例</h3><p>后台账号代表平台管理人员；前台政企用户与个人用户代表服务使用者。两面的登录状态独立。用户通过稳定 ID 关联后台用户、组织或个人客户及成员记录，不按名称、手机号或页面自报的客户 ID 猜测授权。</p>
      <ul>{LINKED_ADMINS.map(row => <li key={row.id}>{row.name}：{row.account}，在后台顶部选择账号进入。</li>)}{LINKED_USERS.map(row => <li key={row.id}>{row.name}：{row.phone}，{row.userType === 'enterprise' ? '选择企业用户登录，使用所属组织的权限' : '选择个人用户登录，直接使用自己的权限'}。也可从前台顶部“Mock 账号”直接切换，无需验证码。</li>)}</ul>
      <Button onClick={() => { try { const changed = prepareLinkedAccounts(); setNotice(changed ? '六个账号已准备，请载入后台新版本；前台可用顶部 Mock 账号菜单直接切换。' : '六个账号已存在，保留当前启停状态。'); } catch (error) { setNotice(error.message); } }}>准备联动账号</Button><p role="status">{notice}</p>
      <p>准备操作可重复执行；已有 ID 或手机号冲突时停止，不覆盖现有记录，不自动登录、创建订购、凭证、模型授权或发布回执。基础客户缺失时先核对后台数据。</p>
      <p>当前前台身份：{currentIdentity ? `${currentIdentity.name} → ${currentIdentity.tenantName}（${currentIdentity.tenantId}）` : '尚无有效身份映射'}</p>
      <p>快速切换仅限已准备的三个前台样例账号，保留启停、成员和映射检查；不会切换后台管理员、创建授权或恢复旧任务。正常验证码登录继续保留。正式产品移除快速切换入口。</p>
      <h3>目录与调用逻辑</h3><p>模型资料、后台服务、当前客户授权与实际 mock 发布配置共同决定目录。模型广场、详情、选择器及体验入口使用稳定服务 ID；统一模型服务模式和各服务商独立服务分别判断。不复制一份已订购名单，不暴露采购价和密钥。未知能力保持未知；没有相应任务页面时显示不可体验。</p>
      <p>两模型案例默认一模型一卡，全部模型保留历史服务。点击卡片进入独立详情页，服务商报价逐行展开，API 调用区切换提供方后同步调用 ID、代码示例与体验入口；URL 保留模型和服务身份，支持刷新和返回。价格取平台发布快照，未提交输入不影响前台；不根据可调用状态推断已订购。API Key 由原管理页维护。模型选择器与新回复保留提供方，避免同名服务混淆。</p>
      <p>模型广场可见性只控制列表展示，隐藏时已有订购、API 调用及在途请求继续有效；切回可见不自动上架或发布。真正下架仍会隐藏并拒绝新请求，包括已创建的 Key 和旧成功请求的重放。发送及结果交付前重新读取最新状态，新请求核对用户、成员、客户、上架、公开性、调用开关、范围、实际发布、有效价格及供给；交付前继续核对身份和安全撤销边界。平台 trial 是独立测试身份，前台体验不能借用。</p>
      <p>在途任务冻结身份、请求代次及原凭证。普通下架阻止新请求，已合法开始的原请求按原配置完成；主动取消、身份变化、撤权及原密钥撤销仍阻断交付。已取消任务不会因重新上架自动重启。上架检查中的 24 小时验证窗口不作为运行时自动下架条件。</p>
      <p>渠道直选模式路由组头分别控制上下架和停服：下架隐藏前台提供方但保留已有 API 权限；停服拒绝该服务商调用。上架与恢复服务互不联动，下架后可确认解绑，仅停用自身路由与渠道关联，供应资源和历史保留。操作复用权限、修订冲突与原子持久化，不改变其他服务商或整个模型的请求代次。路由不展示版本管理，内部历史与并发校验保留。</p>
      <h3>全站配置与数据</h3><p>初始资源在 src/mock 配置，系统内置来源与用户新增、修改、删除分开记录。前台 Key、订单、组织成员、智能路由和后台使用同一份版本业务数据；客户智能路由与供应渠道路由分开。统计从共享请求和显式登录事件派生。旧无归属存档保留，不自动归给当前客户；已有工作区不因刷新或配置更新补回默认资源。配置随静态产物打包，运行数据仅同源同浏览器共享，不支持跨浏览器云同步。本轮不提供新套餐销售。</p><h3>本地同步与历史</h3><p>成功保存后通知同页；同源标签页通过 storage 更新，重新聚焦时复查。后台未保存表单继续使用修订冲突保护。存储损坏或写入失败时停止，不恢复默认全开放目录。前台会话与草稿按用户及客户隔离；旧无归属记录保留但不自动认领。文字及参数可刷新恢复；本地图片和录音仅在当前标签页内保留，刷新后需重新添加。</p>
      <h3>研发实现边界</h3><p>以上为本地 mock 交互，未接真实认证、模型网关、计费或消息系统。前台结果使用集中配置的本地模板，完成后向共享请求集合写入 Mock 调用事实，前台日志、用量和后台观测读取同一 Request ID；未返回的 Tokens、费用保持待确认，不产生真实扣费。直接 mock 客户请求沿用既有模拟计量。真实研发必须在服务端执行同一准入逻辑，撤销缓存权限，并在异步任务交付前再次检查；浏览器隐藏按钮不能代替服务端授权。仅配置发布不等于可体验，不补造成功回执。</p>
      <p>前台 Key、组织和客户路由编辑在打开时冻结修订，其他标签页修改后拒绝旧表单覆盖并保留输入；账号切换清除临时表单及明文 Key，筛选视图按身份隔离。Key 不限额度与 TPM/QPM 输入实际保存，不限 Key 额度仍校验客户额度及权限。统计按实际模型类型、服务和调用 ID 聚合，不显示固定套餐额度。接入流程区分采购条件已填写和采购价已发布，备用准备完成不自动投入路由。</p>
      </> : <>
      <h3>模块职责</h3><p>{supply ? '管理模型的供应来源、接入配置与渠道价格。页头仅提供添加服务商，模型和渠道从服务商详情分别添加。供应模型是模型资料 → 模型中已有供应关系的子集，不是另一套模型资料。' : '模型资料保留模型、计费项、计价单位、货币四个页签；成本和售价的计量配置共用这里的字典。模型资料描述模型身份与能力，不代表已接入、可调用或已上架。'}</p>
      <h3>字段与概念口径</h3><p>内部稳定关联标识称“资料 ID”；资料和服务的业务 modelId 字段称“模型编码”，各表单格式以实际校验为准，不凭编码或名称合并身份。服务商请求参数称“上游模型标识”，客户请求参数称“对外调用标识”。模型作者与采购服务商分开；供应成本列称“采购价”，客户销售价格称“平台售价”；完整任务 URL 称“请求地址”，与服务根地址区别。API 密钥列表的“当前绑定渠道”统计配置绑定，包含未启用渠道，不代表调用次数。</p><h3>统一关联</h3><p>一份模型资料对应多个服务商，每家服务商可以提供多个渠道。以稳定的模型资料 ID 关联，不按显示名称或相似版本自动合并；上游模型标识 属于渠道调用配置。</p>
      <h3>{supply ? '添加与移除' : '维护与引用'}</h3><ul>{supply ? <><li>“添加模型”搜索多选“模型资料 → 模型”中的主档，建立当前服务商引用；模型视图只展示至少已有一家服务商登记的模型，同一主档聚合去重；服务商与模型视图共用有效登记和主档分组，数量同步去重；已归档资料的旧登记和渠道保留历史，不混入当前列表。无渠道也显示已登记服务商，未登记资料不进入模型视图。</li><li>“添加渠道”仅选当前服务商已有模型，必填渠道名称、模型标识、API地址及密钥。默认首个共享密钥组，也可输入只属于当前渠道的独立密钥；成本在模型成本维护，接入时可暂缺；明确零价与缺价分开。</li><li>批量模型与供应关系、渠道与映射/采购/独立密钥分别原子提交；失败不留下部分登记。明文密钥不进入草稿、审计、D1或共享组；保存不自动测试、启用或上架。</li><li>已有资料按稳定 ID 复用，不按相似名称、域名或旧内部 ID 猜测合并。明确独立保存的资源保留，取消渠道不会删除它们。</li><li>删除渠道须先解除模型服务服务商/渠道及当前路由/草稿关联，下架、停服或供给停用不等于解绑；未完成接入/检测任务也阻断。共用渠道仅删除当前模型关联，最后一个关联删除后原子归档资源。全部渠道删除后才能移除当前服务商的模型登记，保留模型资料、其他服务商及历史。</li></> : <><li>从资料管理独立新建资料，只进入模型资料 → 模型，不自动增加服务商、渠道或服务。</li><li>快速接入可创建最低身份资料，标为待完善；未填写的任务、模态和能力保持未知，正式服务继续要求完整资料与有效验证。</li><li>名称等模型资料统一展示；能力变更遵循影响确认与重新验证规则，不能静默修改渠道地址、密钥、价格和路由。</li><li>被供应关系、服务或活动配置引用的资料不能删除。供应侧移除关系不删除模型资料。</li></>}</ul>
      {supply && <><h3>模型渠道</h3><p>表格按模型合并名称，按渠道和计费项分行，采购价来自当前采购配置及折扣，与刊例价、客户售价分开。编辑按渠道维护名称和当前模型标识；被服务引用的标识须先解除映射，检测不自动启用或上架。共享API密钥仍按原服务商、密钥组及渠道引用管理。</p><h3>最低身份与参考目录</h3><p>目录外模型的任务、输入／输出模态、上下文和工具能力不按类型补造，资料标为待完善；技术测试和明确启用允许最低身份资料，正式服务仍校验资料、能力、采购计量与发布证据。参考目录只辅助填写，不代表账号已授权、真实调用成功或采购报价。</p><h3>密钥与轮换范围</h3><p>可复用服务商可用密钥组，或内联输入新 Key 随接入保存。明文只留在当前输入会话；事务仅接收掩码、指纹及受控元数据，输入恢复需重新输入。渠道专属 Key 按目标渠道轮换，组主要 Key 按全部组引用验证；混合引用先明确范围，不遗漏专属绑定，也不误改共享主要 Key。列表按真实绑定显示当前绑定渠道；未使用的备用 Key 替换不触碰在线渠道，删除和撤销仍检查完整引用。正常轮换不自动撤销旧 Key，应用后保留成功结果与版本。</p><h3>测试与明确应用</h3><p>保存接入不自动测试或启用。普通基础测试点击标明产生用量的按钮即授权本次操作；图片、语音、视频及专项检查继续明确任务和用量。地址或 Key 的“测试新配置／密钥”合并保存候选与测试，失败不改当前值；通过后再一次明确点击应用。影响范围前置展示，测试派发与应用前都核对冻结的候选、模型与服务引用、凭证、配置版本和权限；范围变化先拒绝派发，不自动应用或重试。</p><h3>新增映射与历史恢复</h3><p>新渠道单模型或向已有渠道新追加的一条映射，在从未启停、没有服务影响且当前验证有效时，可直接明确点击启用。历史恢复、多项选择或存在服务影响时，列表和测试入口共用固定选择与完整预检，不保留旧结果直达启用的旁路；其他映射保持当前状态。</p><h3>简化验收口径</h3><p>目录内首次接入上一轮实测为新 Key 6 项、已有 Key 5 项；本轮 mock 浏览器实测目录外新服务商＋新模型＋新 Key 9 项，已有渠道追加单模型 6 项，修改地址、正常专属 Key 或组主要 Key 轮换各 5 项。共享轮换实测 2 条引用一次启动全部测试；混合引用需另计范围选择。起点为已打开的添加表单或目标可见列表，终点为技术启用或明确应用。字段填写、独立选择和必要提交分别计数，不能把多个字段合为一步，也不把业务动作称为鼠标点击数。正式服务上架另计。</p></>}
      <h3>与服务管理的边界</h3><p>采购价为空仍可后台技术验证和内部启用，缺成本待核算。模型服务维护身份、供给、路由、调用范围及技术启停；模型售价独立负责售价、销售对象、展示与上架；接入成功不自动对外开放。接入动作数只计算到技术启用，不表示客户服务已完成上架。</p>
      <h3>Mock 验收</h3><p>新建演示数据包含仅有资料、待配置渠道、同模型多服务商、同服务商多渠道等状态；两种供应视图读取相同关系。已有浏览器数据保留，不自动重置或补造渠道。内置 mock API 覆盖模型发现、异步任务、候选切换、平台试调用与费用试算；模型运营通过 Workers 与 D1 保存配置及模拟任务，图表样例保留静态 JSON；检测与试调用不访问真实模型上游，不构成生产接入证明。</p>
      </>}
        </TabsContent>
      </Tabs>
    </div></Modal>}
  </>;
}
