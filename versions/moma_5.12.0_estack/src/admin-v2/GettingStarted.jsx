import { BookOpen, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import './getting-started.css';

export default function GettingStarted() {
  return <div className="getting-started">
    <header className="gs-heading"><h1><BookOpen aria-hidden="true"/>运营入门</h1><p>从接入一个模型开始，完成对外上架，再了解日常维护。</p></header>
    <div className="gs-overview" aria-label="模型管理流程">
      <a href="#/admin-2/providers"><strong>供应管理</strong><span>先接入并启用模型</span></a><ArrowRight aria-hidden="true"/>
      <a href="#/admin-2/model-templates"><strong>资料管理</strong><span>上架前补齐模型资料</span></a><ArrowRight aria-hidden="true"/>
      <a href="#/admin-2/listing"><strong>服务管理</strong><span>配置对外服务并上架</span></a>
    </div>
    <div className="gs-workflows">
      <section className="gs-panel" aria-labelledby="gs-connect"><header><h2 id="gs-connect">1. 接入模型</h2><Button asChild variant="outline" size="sm"><a href="#/admin-2/providers">去供应管理<ArrowRight aria-hidden="true"/></a></Button></header>
        <p className="gs-preparation">准备账号密钥、API 地址和模型 ID。常用项目可从参考目录选择；目录外供应商和模型可在当前表单直接输入。采购价可以后补。</p>
        <ol>
          <li><h3>填写供应商、地址和密钥</h3><p>进入供应管理，点击“添加渠道”。选择已有或内置供应商；目录外选择“新供应商”并填写名称。核对接口与 API 地址，复用可用密钥组或输入新 Key；渠道名称可用建议值。</p></li>
          <li><h3>选择模型，或输入新模型 ID</h3><p>已有资料直接选择；目录外点击模型选择框中的“输入新模型 ID”，填写上游 ID 并核对类型。新供应商的空模型行可直接输入。参考目录不代表账号已开通该模型，采购价可以后补。</p></li>
          <li><h3>保存接入，再测试连接</h3><p>点击“保存接入”，需要的供应商、模型和渠道一起保存。核对范围后点击“测试连接（产生用量）”；图片、语音、视频及专项测试按页面选择任务并确认。测试通过后仍需启用。</p></li>
          <li><h3>启用模型，再完善对外服务</h3><p>新接入的单模型通过检查后，可直接明确点击启用。目录外资料未填写的能力保持待完善；补齐正式服务资料与采购价后，才能配置对外服务。多模型和历史恢复按页面核对范围与影响。</p></li>
        </ol>
        <p className="gs-result"><strong>完成后：</strong>在“模型”目录可查看同一模型的全部供应商与渠道，再进入服务管理上架。接入成功不会自动对外开放。</p>
        <p className="gs-tip">仅登记主体时使用“添加供应商”；仅登记供应关系时使用“添加模型”。新增技术接入可直接使用“添加渠道”，无需先走这两个入口。</p>
        <p className="gs-tip">暂时填不完可点“保存草稿”，下次在添加渠道中点击“继续草稿”→“继续编辑”。供应商和模型未完成的输入会保留，API Key 需重新输入。</p>
      </section>
      <section className="gs-panel" aria-labelledby="gs-publish"><header><h2 id="gs-publish">2. 上架模型</h2><Button asChild variant="outline" size="sm"><a href="#/admin-2/listing">去服务管理<ArrowRight aria-hidden="true"/></a></Button></header>
        <p className="gs-preparation">先启用接入模型，补齐待完善的资料与采购价。已有完整资料直接复用；采购价与面向用户的平台售价分别维护。</p>
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
          ['追加一个模型接入', '供应管理 → 渠道行更多操作 → 添加关联模型', '选择模型或输入新模型 ID，点击“保存接入”，测试后点击“启用模型”。只启用本次新增项，已有模型保持当前状态。', 'providers'],
          ['修改渠道地址', '供应管理 → 渠道行更多操作 → API 地址', '输入新地址并核对影响范围，点击“测试新配置（产生用量）”，通过后点击“应用配置”；失败保留当前地址。', 'providers'],
          ['轮换一个渠道的 Key', '供应管理 → 渠道行更多操作 → API 密钥', '核对仅当前渠道的范围，输入新 Key，点击“测试新密钥（产生用量）”，通过后点击“应用新密钥”。其他渠道及共享组主要 Key 保持不变。', 'providers'],
          ['轮换共享组主要 Key', '供应商详情 → API 密钥 → 主要 Key 的替换', '核对全部引用渠道，输入新 Key，点击“测试新密钥（产生用量）”一次测试全部引用；全部通过后应用。专属绑定和旧 Key 保留。', 'providers'],
          ['调整渠道采购报价', '供应管理 → 渠道操作 → 配置采购价', '核对计费项、单位、生效时间并发布采购报价；不会自动替代面向客户的平台售价。', 'providers'],
          ['调整平台售价或增加供应渠道', '服务管理 → 选择模型 → 服务内容 / 渠道与路由', '核对计费项、单位与售价；新增渠道后配置并发布路由，再检查上架条件。', 'listing'],
          ['下架与重新上架', '服务管理 → 选择模型 → 下架 / 重新上架', '下架停止新增订购并保留历史资料；已有订购调用沿用平台权限规则。重新上架前完成校验。', 'listing'],
          ['移除渠道或供应关系', '供应管理 → 渠道删除 / 移除供应模型', '先解除服务引用；仅无渠道时可移除供应模型，模型资料及其他供应商的关系保留。', 'providers'],
        ].map(([task, location, check, page]) => <tr key={task}><th scope="row">{task}</th><td><a href={`#/admin-2/${page}`}>{location}<ArrowRight aria-hidden="true"/></a></td><td>{check}</td></tr>)}
      </tbody></table></div>
    </section>
    <section className="gs-panel gs-questions" aria-labelledby="gs-questions"><header><h2 id="gs-questions">遇到问题时</h2></header>
      <details><summary>目录里没有供应商或模型，必须先登记吗？</summary><p>可直接在“添加渠道”中选择“新供应商”、填写名称，再输入新模型 ID 并核对类型。保存接入时一起登记，无需先分别添加供应商和模型。</p></details>
      <details><summary>模型资料待完善，还能继续接入吗？</summary><p>可以先完成连接测试和技术启用；未填写的能力仍是待完善。正式服务前需补齐资料、采购价和所需能力验证，再配置售价、路由与上架。</p></details>
      <details><summary>资料已经创建，为什么还没有可用服务？</summary><p>资料管理只保存模型资料。还需在供应管理接入并启用渠道，再到服务管理配置售价、路由并上架。</p></details>
      <details><summary>测试通过，为什么还不能对外调用？</summary><p>新接入模型需点击“启用模型”；修改地址或 Key 需明确应用新配置。对外服务还需在服务管理完成平台试调用、发布配置和上架，测试通过不会自动完成这些操作。</p></details>
      <details><summary>连接测试失败，先检查哪里？</summary><p>检查 API 地址是否与模型类型匹配、上游模型 ID 是否正确、所选密钥组是否有可用密钥，再按测试结果修正。</p></details>
      <details><summary>修改地址或 Key 的测试失败，当前配置会被替换吗？</summary><p>不会。测试只检查候选配置，通过后仍需点击应用。失败时当前地址和 Key 保持；若模型或服务引用在测试前后变化，按提示重新核对范围并测试。</p></details>
      <details><summary>同一 Key 同时用于专属渠道和共享组，替换时怎么选？</summary><p>从供应商 API 密钥页点击替换后，选择“替换指定渠道专属密钥”或“轮换共享组主要密钥”，再核对目标渠道。每次只应用所选范围；正常轮换不会自动撤销旧 Key。</p></details>
      <details><summary>上架按钮不可用，或切换服务模式后需要重配？</summary><p>按“校验并上架”的未通过项逐一处理。切换服务模式会触发下架并清除原路由映射，关联渠道、Provider 与售价需重新配置；操作前先确认影响。</p></details>
    </section>
  </div>;
}
