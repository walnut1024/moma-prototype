import { BookOpen, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import './getting-started.css';

export default function GettingStarted() {
  return <div className="getting-started">
    <header className="gs-heading"><h1><BookOpen aria-hidden="true"/>运营入门</h1><p>从接入一个模型开始，完成对外上架，再了解日常维护。</p></header>
    <div className="gs-overview" aria-label="模型管理流程">
      <a href="#/admin-2/model-templates"><strong>资料管理</strong><span>维护模型身份与能力资料</span></a><ArrowRight aria-hidden="true"/>
      <a href="#/admin-2/providers"><strong>供应管理</strong><span>接入供应商与渠道</span></a><ArrowRight aria-hidden="true"/>
      <a href="#/admin-2/listing"><strong>服务管理</strong><span>配置对外服务并上架</span></a>
    </div>
    <div className="gs-workflows">
      <section className="gs-panel" aria-labelledby="gs-connect"><header><h2 id="gs-connect">1. 接入模型</h2><Button asChild variant="outline" size="sm"><a href="#/admin-2/providers">去供应管理<ArrowRight aria-hidden="true"/></a></Button></header>
        <p className="gs-preparation">准备账号密钥或可复用的密钥组；常用供应商和模型可从参考目录选择，保存前核对地址与上游模型 ID。采购价可以后补。</p>
        <ol>
          <li><h3>打开添加渠道并选择供应商和模型</h3><p>在同一表单选择已有记录或常用参考项，再核对渠道名称、接口地址和上游模型 ID。缺少的供应关系在保存时补齐；目录外项目可手动新增。</p></li>
          <li><h3>复用密钥组或直接输入新 Key</h3><p>已有可用密钥组时可以直接复用；没有可用密钥时，在当前表单输入新 Key，随接入一起保存。参考目录不代表当前账号已开通模型，也不代表采购价格。</p></li>
          <li><h3>保存接入，再明确发起测试</h3><p>点击“保存接入”后，核对模型范围并点击标明产生用量的基础测试按钮。图片、语音、视频及专项测试按页面选择任务并确认；测试通过不会自动启用。</p></li>
          <li><h3>启用模型，再配置对外服务</h3><p>单模型首次接入通过检查后，可直接点击启用。多模型和停用恢复需选择范围并确认影响；共享配置变更仍先检查和测试。采购价未配置的模型可技术启用，补齐采购价后才能用于正式服务。</p></li>
        </ol>
        <p className="gs-result"><strong>完成后：</strong>在“模型”目录可查看同一模型的全部供应商与渠道，再进入服务管理上架。接入成功不会自动对外开放。</p>
        <p className="gs-tip">仅登记主体时使用“添加供应商”；仅登记供应关系时使用“添加模型”。参考目录以外的资料可手动维护。</p>
      </section>
      <section className="gs-panel" aria-labelledby="gs-publish"><header><h2 id="gs-publish">2. 上架模型</h2><Button asChild variant="outline" size="sm"><a href="#/admin-2/listing">去服务管理<ArrowRight aria-hidden="true"/></a></Button></header>
        <p className="gs-preparation">先完成渠道接入并补齐采购价；采购价与面向用户的平台售价分别维护。</p>
        <ol>
          <li><h3>选择或新增模型服务</h3><p>先在平台模型目录查找。没有对应服务时点击“新增模型服务”，可从资料管理引入资料，补全必填信息后保存草稿。</p></li>
          <li><h3>选择服务模式并配置售价</h3><p>“统一服务”使用统一调用 ID 和售价；“分供应商”为各供应商配置独立调用 ID 和售价。在“服务内容”中选择模式、配置计费项与平台售价并关联渠道。</p></li>
          <li><h3>配置并发布渠道路由</h3><p>在“渠道与路由”中配置可用渠道及调度规则，按页面操作保存、校验并发布路由。关联渠道本身不代表路由已生效。</p></li>
          <li><h3>校验并确认上架</h3><p>先在“平台试调用”中明确客户与允许供给，完成专项检查、调用及费用试算，发布验证后的配置。再点击“上架”或“校验并上架”，检查资料、售价、渠道路由和开放范围。未通过的项目可点“前往配置”；全部通过后确认上架。</p></li>
        </ol>
        <p className="gs-result"><strong>完成后：</strong>状态变为“已上架”，开放范围内的用户可订购。在“调用指南”查看调用方式，在“操作记录”查看变更。</p>
        <p className="gs-tip">已有服务直接完善配置，无需再次新增模型服务。</p>
      </section>
    </div>
    <section className="gs-panel" aria-labelledby="gs-maintain"><header><h2 id="gs-maintain">3. 修改与日常维护</h2></header>
      <div className="gs-table-scroll"><table><thead><tr><th>要做什么</th><th>在哪里操作</th><th>修改后检查什么</th></tr></thead><tbody>
        {[
          ['维护模型资料', '资料管理 → 模型资料库 → 编辑', '核对名称和能力资料；模型类型与输入、输出能力变更需确认影响。', 'model-templates'],
          ['修改对外模型信息', '服务管理 → 选择模型 → 模型信息 → 编辑资料', '服务资料与资料库分别维护。修改类型或输入、输出能力会使已上架模型下架，需重新验证渠道并上架。', 'listing'],
          ['修改地址、密钥或渠道报价', '供应管理 → 选择模型或供应商 → 渠道操作', '地址或密钥变更先保存候选，检查引用并测试后明确应用。采购报价按版本发布；不会自动替代平台售价。', 'providers'],
          ['调整平台售价或增加供应渠道', '服务管理 → 选择模型 → 服务内容 / 渠道与路由', '核对计费项、单位与售价；新增渠道后配置并发布路由，再检查上架条件。', 'listing'],
          ['下架与重新上架', '服务管理 → 选择模型 → 下架 / 重新上架', '下架停止新增订购并保留历史资料；已有订购调用沿用平台权限规则。重新上架前完成校验。', 'listing'],
          ['移除渠道或供应关系', '供应管理 → 渠道删除 / 移除供应模型', '先解除服务引用；仅无渠道时可移除供应模型，模型资料及其他供应商的关系保留。', 'providers'],
        ].map(([task, location, check, page]) => <tr key={task}><th scope="row">{task}</th><td><a href={`#/admin-2/${page}`}>{location}<ArrowRight aria-hidden="true"/></a></td><td>{check}</td></tr>)}
      </tbody></table></div>
    </section>
    <section className="gs-panel gs-questions" aria-labelledby="gs-questions"><header><h2 id="gs-questions">遇到问题时</h2></header>
      <details><summary>资料已经创建，为什么还没有可用服务？</summary><p>资料管理只保存模型资料。还需在供应管理接入并启用渠道，再到服务管理配置售价、路由并上架。</p></details>
      <details><summary>连接测试失败，先检查哪里？</summary><p>检查 API 地址是否与模型类型匹配、上游模型 ID 是否正确、所选密钥组是否有可用密钥，再按测试结果修正。</p></details>
      <details><summary>上架按钮不可用，或切换服务模式后需要重配？</summary><p>按“校验并上架”的未通过项逐一处理。切换服务模式会触发下架并清除原路由映射，关联渠道、Provider 与售价需重新配置；操作前先确认影响。</p></details>
    </section>
  </div>;
}
