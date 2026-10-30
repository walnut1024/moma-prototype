import { useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Modal } from './ModelOperationsUI';
import './development-notes.css';

export default function DevelopmentNotes({ area }) {
  const [open, setOpen] = useState(false), trigger = useRef(null);
  const supply = area === '供应管理';
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  return <><Button ref={trigger} type="button" variant="outline" size="sm" className="development-notes-trigger" aria-label={`研发人员注意：${area}功能说明（非产品功能）`} title="研发说明 · 非产品功能" onClick={() => setOpen(true)}>研发人员注意</Button>
    {open && <Modal wide title={`${area}功能说明`} description="研发专用 · 非产品功能" onClose={close}><div className="development-notes">
      <p className="development-notes-label">此入口仅用于原型评审与研发对齐，不纳入正式产品功能。</p>
      <h3>模块职责</h3><p>{supply ? '管理模型的供应来源、接入配置与渠道价格。供应模型是模型资料库中已有供应关系的子集，不是另一套模型资料。' : '集中维护模型资料库、计费项、计价单位和货币。模型资料描述模型身份与能力，不代表已接入、可调用或已上架。'}</p>
      <h3>统一关联</h3><p>一份模型资料对应多个供应商，每家供应商可以提供多个渠道。以稳定的模型资料 ID 关联，不按显示名称或相似版本自动合并；上游模型 ID 属于渠道调用配置。</p>
      <h3>{supply ? '添加与移除' : '维护与引用'}</h3><ul>{supply ? <><li>添加供应商只登记主体；添加模型登记供应商与模型资料的关系，可以暂不配置渠道。</li><li>添加渠道按连接、模型、测试启用三步配置；一个渠道可关联多个模型，缺少供应关系时原子补齐。已有渠道通过添加关联模型扩充。模型资料可原地新增。</li><li>仅无渠道的供应模型可移除；只移除当前供应商的关系，保留模型资料及其他供应商。服务引用须先解除。</li></> : <><li>新建资料只进入模型资料库，不自动增加供应商、渠道或服务。</li><li>名称等基础资料统一展示；能力变更遵循影响确认与重新验证规则，不能静默修改渠道地址、密钥、价格和路由。</li><li>被供应关系、服务或配置草稿引用的资料不能删除。供应侧移除关系不删除模型资料。</li></>}</ul>
      <h3>与服务管理的边界</h3><p>采购价为空仍可测试和技术启用，但不能用作正式服务供给。测试通过后明确选择并确认启用。服务管理负责对外调用标识、售价、路由与上架；接入成功不自动对外上架。</p>
      <h3>Mock 验收</h3><p>新建演示数据包含仅有资料、待配置渠道、同模型多供应商、同供应商多渠道等状态；两种供应视图读取相同关系。已有浏览器数据保留，不自动重置或补造渠道。连接测试为本地模拟，不验证真实上游。</p>
      <div className="mo-footer"><Button variant="outline" onClick={close}>关闭说明</Button></div>
    </div></Modal>}
  </>;
}
