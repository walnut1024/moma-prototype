import { useEffect, useRef } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

// Only formatting and safe links/images are persisted, never active HTML from pasted content.
export function cleanStatement(html) {
  const doc=new DOMParser().parseFromString(html||'','text/html');
  const allowed=new Set(['P','BR','DIV','STRONG','B','EM','I','U','S','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','A','IMG','TABLE','TBODY','TR','TD','TH']);
  for (const el of [...doc.body.querySelectorAll('*')].reverse()) {
    if (['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH'].includes(el.tagName)) {el.remove();continue;}
    if (!allowed.has(el.tagName)) {el.replaceWith(...el.childNodes);continue;}
    const href=el.getAttribute('href'),src=el.getAttribute('src'),alt=el.getAttribute('alt');
    while (el.attributes.length) el.removeAttribute(el.attributes[0].name);
    if (el.tagName==='A'&&/^(https?:\/\/|mailto:|#)/i.test(href||'')) {el.setAttribute('href',href);el.setAttribute('rel','noopener noreferrer');}
    if (el.tagName==='IMG') {if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(src||'')) {el.setAttribute('src',src);el.setAttribute('alt',alt||'声明图片');} else el.remove();}
  }
  return doc.body.innerHTML;
}
export function RichStatement({value,onChange}) {
  const editor=useRef(null),range=useRef(null),initial=useRef(value);
  useEffect(()=>{editor.current.innerHTML=cleanStatement(initial.current);},[]);
  const remember=()=>{const selection=window.getSelection();if(selection?.rangeCount&&editor.current.contains(selection.anchorNode))range.current=selection.getRangeAt(0).cloneRange();};
  const emit=()=>{remember();onChange(cleanStatement(editor.current.innerHTML));};
  const format=(command,arg)=>{editor.current.focus();if(range.current){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range.current);}document.execCommand(command,false,arg);emit();};
  const image=async file=>{if(!file)return;if(!['image/png','image/jpeg'].includes(file.type))throw new Error('请选择PNG或JPEG图片');const bitmap=await createImageBitmap(file);bitmap.close();const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsDataURL(file);});format('insertImage',data);};
  return <div className="cc-rich-text"><div className="cc-rich-tools" role="toolbar" aria-label="使用声明格式">{[['bold','加粗','B'],['italic','斜体','I'],['underline','下划线','U'],['insertUnorderedList','无序列表','• 列表'],['insertOrderedList','有序列表','1. 列表'],['removeFormat','清除格式','清除格式']].map(([command,label,text])=><Button type="button" variant="ghost" size="sm" key={command} aria-label={label} onMouseDown={e=>e.preventDefault()} onClick={()=>format(command)}>{text}</Button>)}{[['p','正文'],['h2','标题'],['blockquote','引用']].map(([tag,label])=><Button type="button" variant="ghost" size="sm" key={tag} onMouseDown={e=>e.preventDefault()} onClick={()=>format('formatBlock',tag)}>{label}</Button>)}</div><div ref={editor} className="cc-rich-content" contentEditable suppressContentEditableWarning role="textbox" aria-label="模型使用声明" aria-multiline="true" onInput={emit} onKeyUp={remember} onMouseUp={remember} onPaste={e=>{e.preventDefault();format('insertText',e.clipboardData.getData('text/plain'));}}/><div className="cc-rich-tools"><Input aria-label="声明链接地址" placeholder="https://" type="url" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(/^https?:\/\//i.test(e.currentTarget.value))format('createLink',e.currentTarget.value);}}}/><Button type="button" size="sm" variant="outline" onClick={e=>{const input=e.currentTarget.previousElementSibling;if(input.checkValidity()&&/^https?:\/\//i.test(input.value))format('createLink',input.value);}}>插入链接</Button><Input type="file" accept="image/png,image/jpeg" aria-label="插入声明图片" onChange={e=>{const input=e.target;input.setCustomValidity('');image(input.files[0]).catch(error=>{input.setCustomValidity(error.message);input.reportValidity();});}}/></div></div>;
}
