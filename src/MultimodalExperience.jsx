import { useRef, useState } from 'react';
import { ArrowUp, CirclePlus } from 'lucide-react';
import './experience.css';
import './experience-refinements.css';

const examples = [
  { title: '图片内容描述', desc: '捕捉图片细节，总结图片核心视觉内容', image: '/assets/mm-city-transit.jpg', prompt: '请详细描述这张图片的主体、场景、人物或物体、动作、色彩、光线与构图；先给出一句话概述，再按要点列出关键视觉细节，并明确标注无法从图片确认的信息。' },
  { title: '图片标签分类', desc: '分析图片内容，提取清晰可解释的标签信息', image: '/assets/mm-creative-workbench.jpg', prompt: '请分析这张图片并完成标签分类：输出场景、主体、动作、环境、视觉风格和安全属性六类标签，每类给出 3—5 个标签及置信度，最后补充一段分类依据。' },
  { title: '短视频主题概述', desc: '识别视频中客观存在且频繁出现的核心主题', image: '/assets/mm-coastal-cyclist.jpg', prompt: '请概述这段短视频的核心主题：按时间顺序梳理主要画面和事件，提取关键人物、物体、动作与场景变化，标注重要时间点，并用三条结论总结视频传达的信息。' },
  { title: '影视分镜分析', desc: '拆解视频分镜，并描述分镜的具体信息', image: '/assets/mm-pastry-chef.jpg', prompt: '请对这段视频进行影视分镜分析：逐镜头说明景别、机位、构图、镜头运动、时长、人物动作、光线与声音，分析镜头衔接和叙事作用，最后给出可执行的优化建议。' },
];

export default function MultimodalExperience() {
  const editor = useRef();
  const input = useRef();
  const files = useRef(new Map());
  const [count, setCount] = useState(0);
  const [hasContent, setHasContent] = useState(false);
  const [result, setResult] = useState('');

  function sync() {
    const text = editor.current?.innerText.replace(/\u00a0/g, ' ').trim() || '';
    setCount(text.length);
    setHasContent(Boolean(text || files.current.size));
  }
  function clear() {
    editor.current?.replaceChildren();
    files.current.forEach(item => item.url?.startsWith('blob:') && URL.revokeObjectURL(item.url));
    files.current.clear();
    setCount(0); setHasContent(false); setResult('');
  }
  function attachmentNode(item) {
    const chip = document.createElement('span');
    chip.className = 'mm-inline-attachment';
    chip.contentEditable = 'false';
    chip.dataset.attachmentId = item.id;
    const image = document.createElement('img');
    image.src = item.url; image.alt = '';
    const name = document.createElement('span');
    name.textContent = item.name;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.ariaLabel = `移除 ${item.name}`; remove.textContent = '×';
    chip.append(image, name, remove);
    return chip;
  }
  function insert(item, atStart = false) {
    files.current.set(item.id, item);
    const chip = attachmentNode(item);
    const space = document.createTextNode('\u00a0');
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const inEditor = range && editor.current.contains(range.commonAncestorContainer);
    if (atStart) editor.current.prepend(chip, space);
    else if (inEditor) {
      range.deleteContents(); range.insertNode(space); range.insertNode(chip);
      range.setStartAfter(space); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
    } else editor.current.append(chip, space);
    sync();
  }
  function attach(list) {
    [...list].filter(value => /^(image|video)\//.test(value.type)).forEach(value => insert({ id: crypto.randomUUID(), name: value.name, url: URL.createObjectURL(value) }));
    setResult('');
  }
  function choose(item) {
    clear();
    editor.current.textContent = item.prompt;
    insert({ id: crypto.randomUUID(), name: `${item.title}.jpg`, url: item.image }, true);
    editor.current.focus();
  }
  function submit(event) { event.preventDefault(); if (!hasContent) return; setResult('已完成本地多模态理解演示。正式接入模型后，这里将展示素材描述、标签、时间点或分镜分析结果。'); }

  return <section className="playground tx-page mm-page">
    <div className="pg-heading"><div><h1>多模态理解</h1><p>上传图片或视频，让模型识别内容、提取信息并完成分析。</p></div><button type="button" onClick={clear}>新建对话</button></div>
    <div className="pg-workspace">
      <div className="pg-welcome"><h2>看见更多，理解更深</h2><p>输入问题并添加图片或视频，体验多模态内容理解。</p></div>
      <form className="pg-composer mm-composer" onSubmit={submit} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); attach(event.dataTransfer.files); }}>
        <div ref={editor} className="mm-rich-input" contentEditable role="textbox" aria-label="多模态理解输入" aria-multiline="true" data-placeholder="输入问题，并添加图片或视频进行理解" suppressContentEditableWarning onInput={sync} onClick={event => { const button = event.target.closest('.mm-inline-attachment button'); if (!button) return; const chip = button.closest('.mm-inline-attachment'); const item = files.current.get(chip.dataset.attachmentId); if (item?.url.startsWith('blob:')) URL.revokeObjectURL(item.url); files.current.delete(chip.dataset.attachmentId); chip.remove(); sync(); }}/>
        <input ref={input} hidden multiple type="file" accept="image/*,video/*" onChange={event => { attach(event.target.files); event.target.value = ''; }}/>
        <div className="pg-toolbar"><button className="pg-add pg-add-icon" type="button" aria-label="添加图片或视频" onClick={() => input.current.click()}><CirclePlus size={24}/></button><div className="pg-primary-actions"><span className="pg-count">{count}/6000</span><label className="mm-model"><span className="sr-only">选择模型</span><select aria-label="选择模型"><option>Qwen/Qwen3.5-VL</option><option>ZHIPU/GLM-4.6V</option></select></label><button className="pg-send" type="submit" aria-label="开始理解" disabled={!hasContent}><ArrowUp size={20}/></button></div></div>
      </form>
      <p className="pg-quota-note">AI 回复可能存在偏差，使用前请自行核实。使用本服务会消耗已订购额度，具体以用量记录为准。</p>
      {!result && <div className="mm-examples" aria-label="多模态理解推荐提示词">{examples.map(item => <button type="button" key={item.title} onClick={() => choose(item)}><strong>{item.title}</strong><small>{item.desc}</small><img src={item.image} alt="" loading="lazy"/></button>)}</div>}
      {result && <div className="mm-result" role="status"><strong>模型分析结果</strong><p>{result}</p></div>}
    </div>
  </section>;
}
