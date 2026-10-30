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
        <p className="gs-preparation">准备好供应商名称、API 地址、上游模型 ID、API 密钥及渠道报价。</p>
        <ol>
          <li><h3>找到模型资料与供应商</h3><p>先检查是否已存在，避免重复创建。缺少模型资料可到资料管理新增，也可在添加渠道时就地新增；缺少供应商则点击“添加供应商”。</p></li>
          <li><h3>添加渠道并填写接入配置</h3><p>点击“添加渠道”，选择模型和供应商，填写渠道名称、上游模型 ID、API 地址和计费项。渠道 ID 自动生成。</p></li>
          <li><h3>选择 API 密钥组</h3><p>使用供应商默认组或独立密钥组；没有可用密钥时先添加。组内第一位是主要密钥，可在供应商的“API 密钥”页维护。</p></li>
          <li><h3>保存、测试并启用渠道</h3><p>保存后进入连接测试，按提示处理缺失配置或连接问题，测试通过后单独启用。临时切换测试密钥组不会修改渠道的正式配置。</p></li>
        </ol>
        <p className="gs-result"><strong>完成后：</strong>在“模型”目录可查看同一模型的全部供应商与渠道，再进入服务管理上架。接入成功不会自动对外开放。</p>
        <p className="gs-tip">仅登记供应商的模型清单时使用“添加模型”，可稍后再配置渠道。</p>
      </section>
      <section className="gs-panel" aria-labelledby="gs-publish"><header><h2 id="gs-publish">2. 上架模型</h2><Button asChild variant="outline" size="sm"><a href="#/admin-2/listing">去服务管理<ArrowRight aria-hidden="true"/></a></Button></header>
        <p className="gs-preparation">先完成渠道接入；渠道的供应报价和面向用户的平台售价分别维护。</p>
        <ol>
          <li><h3>选择或新增模型服务</h3><p>先在平台模型目录查找。没有对应服务时点击“新增模型服务”，可从资料管理引入资料，补全必填信息后保存草稿。</p></li>
          <li><h3>选择服务模式并配置售价</h3><p>“统一服务”使用统一调用 ID 和售价；“分供应商”为各供应商配置独立调用 ID 和售价。在“服务内容”中选择模式、配置计费项与平台售价并关联渠道。</p></li>
          <li><h3>配置并发布渠道路由</h3><p>在“渠道与路由”中配置可用渠道及调度规则，按页面操作保存、校验并发布路由。关联渠道本身不代表路由已生效。</p></li>
          <li><h3>校验并确认上架</h3><p>点击“上架”或“校验并上架”，检查资料、售价、渠道路由和开放范围。未通过的项目可点“前往配置”；全部通过后确认上架。</p></li>
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
          ['修改地址、密钥或渠道报价', '供应管理 → 选择模型或供应商 → 渠道操作', '地址、上游模型 ID 或密钥变更后重新测试；渠道报价不会自动替代平台售价。', 'providers'],
          ['调整平台售价或增加供应渠道', '服务管理 → 选择模型 → 服务内容 / 渠道与路由', '核对计费项、单位与售价；新增渠道后配置并发布路由，再检查上架条件。', 'listing'],
          ['下架与重新上架', '服务管理 → 选择模型 → 下架 / 重新上架', '下架停止新增订购并保留历史资料；已有订购调用沿用平台权限规则。重新上架前完成校验。', 'listing'],
          ['移除渠道或供应关系', '供应管理 → 渠道删除 / 移除供应模型', '先解除服务引用；仅无渠道时可移除供应模型，模型资料及其他供应商的关系保留。', 'providers'],
        ].map(([task, location, check, page]) => <tr key={task}><th scope="row">{task}</th><td><a href={`#/admin-2/${page}`}>{location}<ArrowRight aria-hidden="true"/></a></td><td>{check}</td></tr>)}
      </tbody></table></div>
    </section>
    <section className="gs-panel gs-questions" aria-labelledby="gs-questions"><header><h2 id="gs-questions">遇到问题时</h2></header>
      <details><summary>资料已经创建，为什么还没有可用服务？</summary><p>资料管理只保存模型资料。还需在供应管理接入并启用渠道，再到服务管理配置售价、路由并上架。</p></details>
      <details><summary>连接测试失败，先检查哪里？</summary><p>检查 API 地址是否与模型类型匹配、上游模型 ID 是否正确、所选密钥组是否有可用密钥，再按测试结果修正。本原型的连接测试为本地模拟，不验证真实上游。</p></details>
      <details><summary>上架按钮不可用，或切换服务模式后需要重配？</summary><p>按“校验并上架”的未通过项逐一处理。切换服务模式会触发下架并清除原路由映射，关联渠道、Provider 与售价需重新配置；操作前先确认影响。</p></details>
    </section>
  </div>;
}
