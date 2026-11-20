import { workspaceStoragePrefix } from "./workspace-storage.mjs";
import { resourceId } from './resource-id.mjs';
import {recordTenantExperience} from './tenant-data.mjs';
import { mockTextUsage } from './project-call.mjs';
import mockConfig from './mock/catalogues.json' with { type: 'json' };
import { useServiceDirectory } from './useServiceDirectory';
import { beginExperience, validateExperience } from './service-directory.mjs';
import { readExperienceDraft, saveExperienceDraft } from './experience-drafts.mjs';
import FrontPageHeader from "./components/FrontPageHeader";
import { Languages } from "lucide-react";
import { displayBusinessCopy } from './display-copy.mjs';
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUp,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Plus,
  ImagePlus,
  Image as ImageIcon,
  RefreshCw,
  SlidersHorizontal,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  X,
} from "lucide-react";
import { Button, Modal, Select, Slider, TextArea } from '@douyinfe/semi-ui';
import ModelSelectDialog from "./ModelSelectDialog";
import { IMAGE_ACCEPT, supportsImageInput, imageInputError } from "./text-image-input.mjs";
import "./experience.css";
import "./experience-refinements.css";

const STORAGE_KEY = workspaceStoragePrefix + 'conversations';
const recommendations = mockConfig["TextExperience.jsx"]["recommendations"];

const loadHistory = (owner) => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").filter(row => owner && row.owner === owner);
  } catch {
    return [];
  }
};

function ModelPicker({ value, onChange, models, disabled }) {
  const [open, setOpen] = useState(false);
  const selected = models.find(item => item.id === value);
  return (
    <div className="pg-model-picker">
      <Button
        className="pg-model"
        type="tertiary"
        icon={<ChevronDown size={15}/>}
        iconPosition="right"
        disabled={disabled}
        aria-label="选择模型"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>{selected ? `${selected.name} · ${selected.provider}` : "请选择模型"}</span>
      </Button>
      <ModelSelectDialog
        open={open}
        models={models}
        value={value}
        onApply={(next) => {
          if (onChange(next) === false) return false;
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

export default function TextExperience({ onCompare, title = "文本生成", imageUploadEnabled = false, initialServiceId = "", owner = "", project }) {
  const directory = useServiceDirectory('text', project), models = directory.models;
  const projectId = project.id;
  const [draft] = useState(() => { try { return readExperienceDraft(owner, 'text'); } catch { return { storageError: '草稿读取失败，请核对本地存储' }; } });
  const ticket = useRef(null);
  const [model, setModel] = useState(initialServiceId || draft.model || models.find(item => item.callable)?.id || '');
  const [images, setImages] = useState(draft.images || []);
  const [readingImages, setReadingImages] = useState(false);
  const imageInput = useRef();
  const imageUrls = useRef(new Set());
  const imageReadVersion = useRef(0);
  const currentModel = useRef(model);
  const [text, setText] = useState(draft.text || "");
  const [messages, setMessages] = useState(draft.messages || []);
  const [conversations, setConversations] = useState(() => loadHistory(owner));
  const [conversationId, setConversationId] = useState(draft.conversationId || "");
  const [home, setHome] = useState(!draft.conversationId);
  const [busy, setBusy] = useState(false);
  const [deepThinking, setDeepThinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [temperature, setTemperature] = useState(draft.temperature || "0.7");
  const [topP, setTopP] = useState(draft.topP || "0.8");
  const [systemPrompt, setSystemPrompt] = useState(draft.systemPrompt || "");
  const [ratings, setRatings] = useState({});
  const [expanded, setExpanded] = useState({});
  const [notice, setNotice] = useState("");
  const timer = useRef();
  const end = useRef();
  const [newDialog, setNewDialog] = useState(false);

  currentModel.current = model;
  const selectedModel = models.find(item => item.id === model);
  const canUploadImages = imageUploadEnabled && supportsImageInput(selectedModel);
  useEffect(() => () => {
    imageReadVersion.current++;

  }, []);
  const removeImage = (image) => {
    URL.revokeObjectURL(image.url);
    imageUrls.current.delete(image.url);
    setImages(current => current.filter(item => item.url !== image.url));
  };
  const changeModel = (next) => {
    if ((images.length || readingImages) && !supportsImageInput(models.find(item => item.id === next))) {
      setNotice("请先移除已添加的图片，再切换到不支持图片输入的模型。");
      return false;
    }
    setModel(next);
    setNotice("");
  };
  const attachImages = async (files) => {
    const selected = Array.from(files);
    if (!selected.length || readingImages || busy) return;
    const error = imageInputError(selectedModel, selected, images.length);
    if (error) { setNotice(error); return; }
    setReadingImages(true);
    const readVersion = imageReadVersion.current;
    const next = [];
    try {
      for (const file of selected) {
        const url = URL.createObjectURL(file);
        next.push({ name: file.name, url });
        const preview = new window.Image();
        preview.src = url;
        await preview.decode();
      }
      if (currentModel.current !== model || imageReadVersion.current !== readVersion) throw new Error("draft changed");
      next.forEach(image => imageUrls.current.add(image.url));
      setImages(current => [...current, ...next]);
      setNotice("");
    } catch {
      next.forEach(image => URL.revokeObjectURL(image.url));
      if (imageReadVersion.current === readVersion) setNotice("图片无法读取，请重新选择图片。");
    } finally { if (imageReadVersion.current === readVersion) setReadingImages(false); }
  };

  const activeConversation = conversations.find(
    (item) => item.id === conversationId,
  );
  const conversationActive = !home && Boolean(conversationId);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!owner) return;
    try {
      const others = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').filter(row => row.owner !== owner);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...others, ...conversations], (key, value) => key === 'images' ? value.map(image => ({ name: image.name })) : value));
    } catch { setNotice('对话记录无法保存，原记录未替换。'); }
  }, [conversations, owner]);
  useEffect(() => {
    if (draft.storageError) { setNotice(draft.storageError); return; }
    try { saveExperienceDraft(owner, 'text', { model, text, images, messages: messages.map(row => row.status === 'loading' ? { ...row, status: 'stopped', answer: '任务已停止，请重新发送。' } : row), conversationId, temperature, topP, systemPrompt }); }
    catch { setNotice('草稿无法保存，请检查浏览器存储。'); }
  }, [owner, model, text, images, messages, conversationId, temperature, topP, systemPrompt]);
  useEffect(() => {
    if (!busy || !ticket.current) return;
    try { validateExperience(ticket.current); } catch (error) {
      clearTimeout(timer.current); setBusy(false); setNotice(error.message);
      const stopped = messages.map(item => item.status === 'loading' ? { ...item, status: 'stopped', answer: error.message } : item); setMessages(stopped); persist(conversationId, stopped);
    }
  }, [directory]);
  useEffect(() => {
    if (conversationActive) end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, conversationActive]);

  const persist = (id, nextMessages, patch = {}) => {
    const previous = conversations.find((item) => item.id === id);
    const record = {
      id,
      owner, serviceId: model, modelName: selectedModel?.name || model,
      title:
        previous?.title || nextMessages[0]?.question.slice(0, 22) || "新对话",
      updatedAt: Date.now(),
      model,
      deepThinking,
      temperature,
      topP,
      systemPrompt,
      ...previous,
      messages: nextMessages,
      ...patch,
    };
    setConversations((current) =>
      [record, ...current.filter((item) => item.id !== id)]
        .sort((a, b) => b.updatedAt - a.updatedAt),
    );
  };

  const mockAnswer = question => mockConfig['TextExperience.jsx'].response.answer.replace('{question}',question.slice(0,32)+(question.length>32?'…':''));
  const finish = (id, pendingId, question, shouldFail, pendingMessages) => {
    try { validateExperience(ticket.current); } catch (error) {
      const stopped = pendingMessages.map(item => item.id === pendingId ? { ...item, status: 'stopped', answer: error.message } : item);
      setMessages(stopped); persist(id, stopped); setNotice(error.message); setBusy(false); return;
    }
    const answer = shouldFail ? undefined : mockAnswer(question);
    try { recordTenantExperience(ticket.current, shouldFail ? 403 : 200, undefined, {
      input: question, output: answer && [answer, ...mockConfig['TextExperience.jsx'].response.points].join('\n'),
    }); } catch (error) {
      const stopped = pendingMessages.map(item => item.id === pendingId ? { ...item, status:'stopped', answer:error.message } : item);
      setMessages(stopped); persist(id, stopped); setNotice(error.message); setBusy(false); return;
    }
    const result = shouldFail
      ? {
          id: pendingId,
          question,
          status: "error",
          code: "10042000",
          requestId: ticket.current.requestId,
          error: "Model.AccessDenied",
          message:
            "当前账号暂无该模型的调用权限，请订购模型或切换其他可用模型。",
          raw: 'event:error\n:HTTP_STATUS/403\ndata:{"code":"Model.AccessDenied","message":"Model access denied."}',
        }
      : {
          id: pendingId,
          question,
          status: "success",
          answer,
          points: mockConfig['TextExperience.jsx'].response.points,
        };
    const next = pendingMessages.map((item) =>
      item.id === pendingId ? { ...item, ...result } : item,
    );
    setMessages(next);
    persist(id, next);
    if (!shouldFail) { setText(""); setImages([]); }
    setBusy(false);
  };

  const send = (prompt = text) => {
    const question = prompt.trim();
    if ((!question && !images.length) || busy || readingImages) return;
    if (images.length && !canUploadImages) { setNotice("当前模型不支持图片输入。"); return; }
    try {
      ticket.current = beginExperience(model, 'text', { projectId, images: images.length > 0,
        usage: mockTextUsage([systemPrompt, question].filter(Boolean).join('\n'), [mockAnswer(question), ...mockConfig['TextExperience.jsx'].response.points].join('\n')),
      });
    } catch (error) { setNotice(error.message); return; }
    const id = conversationId || resourceId('conversation');
    const pendingId = resourceId('message');
    const pending = { id: pendingId, question, images, modelName: ticket.current.modelName, provider: selectedModel.provider, callId: selectedModel.callId, status: "loading" };
    const next = [...(conversationId ? messages : []), pending];
    setConversationId(id);
    setHome(false);
    setMessages(next);
    setNotice("");
    setBusy(true);
    persist(id, next, {
      model,
      title: question.replace("模拟调用失败：", "").slice(0, 22) || images[0]?.name || "图片问答",
    });
    timer.current = setTimeout(
      () =>
        finish(
          id,
          pendingId,
          question.replace("模拟调用失败：", ""),
          question.includes("模拟调用失败"),
          next,
        ),
      700,
    );
  };

  const stopGeneration = () => {
    clearTimeout(timer.current);
    const next = messages.map((item) =>
      item.status === "loading"
        ? { ...item, status: "stopped", answer: "已停止生成。" }
        : item,
    );
    setMessages(next);
    persist(conversationId, next);
    setBusy(false);
  };

  const regenerate = (index) => {
    if (busy) return;
    const original = messages[index];
    try {
      ticket.current = beginExperience(model, 'text', { projectId, images: Boolean(original.images?.length),
        usage: mockTextUsage([systemPrompt, original.question].filter(Boolean).join('\n'), [mockAnswer(original.question), ...mockConfig['TextExperience.jsx'].response.points].join('\n')),
      });
    } catch (error) { setNotice(error.message); return; }
    const next = messages.map((item, i) =>
      i === index ? { ...item, modelName: ticket.current.modelName, provider: selectedModel.provider, callId: selectedModel.callId, status: "loading" } : item,
    );
    setMessages(next);
    setBusy(true);
    persist(conversationId, next);
    timer.current = setTimeout(
      () =>
        finish(
          conversationId,
          original.id,
          original.question,
          original.status === "error",
          next,
        ),
      700,
    );
  };

  const blank = () => {
    imageReadVersion.current++;
    setReadingImages(false);
    images.forEach(image => URL.revokeObjectURL(image.url));
    images.forEach(image => imageUrls.current.delete(image.url));
    setImages([]);
    clearTimeout(timer.current);
    setBusy(false);
    setConversationId("");
    setMessages([]);
    setText("");
    setDeepThinking(false);
    setHome(true);
  };
  const requestBlank = () => {
    if (text.trim() || images.length || readingImages || busy || messages.length) setNewDialog(true);
    else blank();
  };
  const choosePrompt = (prompt) => setText(prompt);
  const copy = (value) =>
    navigator.clipboard?.writeText(value).then(() => {
      setNotice("已复制");
      setTimeout(() => setNotice(""), 1200);
    });
  const read = (value) => {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(value));
  };
  const answerText = (item) => [displayBusinessCopy(item.answer), ...(item.points || []).map(displayBusinessCopy)].join("\n");
  return (
    <section
      className={`playground tx-page ${conversationActive ? "has-messages tx-conversation" : ""}`}
    >
      {(directory.error || directory.identityError || !selectedModel?.callable) && <p role="status">{directory.error || directory.identityError || selectedModel?.reason || "请选择可体验的模型"}</p>}
      {conversationActive ? (
        <div className="tx-topbar">
          <Button theme="borderless" type="tertiary" onClick={blank}>
            <ArrowLeft size={17} />
            返回
          </Button>
          <strong>{activeConversation?.title || "新对话"}</strong>
          <Button theme="solid" onClick={requestBlank}>新建对话</Button>
        </div>
      ) : (
        <FrontPageHeader className="pg-heading" title={title} icon={Languages} description={imageUploadEnabled ? "文本生成用于问答、创作和翻译；支持图片输入的模型还可进行图文理解。" : "文本生成模型用于理解和生成文字；多模态模型还可以理解图片、视频等内容。"} actions={<div className="pg-heading-actions"><Select aria-label="恢复历史对话" placeholder="历史对话" value={null} onChange={value => { const row = conversations.find(item => item.id === value); if (!row || busy) return; setConversationId(row.id); setMessages(row.messages); setModel(row.serviceId || ''); setHome(false); setNotice(row.serviceId ? '' : '旧会话为只读记录，请重新选择模型后发送。'); }} optionList={conversations.map(row => ({value:row.id,label:row.title}))} />{onCompare && <Button theme="borderless" className="pg-compare-entry" onClick={onCompare}>模型对比</Button>}<Button theme="solid" onClick={requestBlank}>新建对话</Button></div>} />
      )}
      <div className="pg-workspace">
        {conversationActive ? (
          <div className="pg-history tx-message-list">
            {messages.map((item, index) => (
              <article key={item.id}>
                <div className="pg-question">{item.images?.length > 0 && <div className="tx-image-list">{item.images.map((image, i) => <span key={i}>{image.url ? <img src={image.url} alt={image.name} /> : <><ImageIcon size={18} /><small>{image.name}</small></>}</span>)}</div>}{item.question}</div>
                <div className="pg-answer">
                  <div className="pg-answer-meta">
                    <strong>{item.modelName || activeConversation?.modelName || selectedModel?.name || "模型不可用"}{item.provider && ` · ${item.provider}`}</strong>
                    {item.status !== "loading" && (
                      <small>
                        {item.status === "error" ? "调用失败" : "刚刚"}
                      </small>
                    )}
                  </div>
                  {item.status === "loading" ? (
                    <div className="tx-loading">
                      <i />
                      <span>正在生成回答…</span>
                    </div>
                  ) : item.status === "error" ? (
                    <div className="tx-error">
                      <h3>模型调用出错</h3>
                      <p>{item.message}</p>
                      <dl>
                        <div>
                          <dt>错误码</dt>
                          <dd>{item.code}</dd>
                        </div>
                        <div>
                          <dt>RequestId</dt>
                          <dd>{item.requestId}</dd>
                        </div>
                      </dl>
                      <Button theme="borderless" type="tertiary"
                        onClick={() =>
                          setExpanded((value) => ({
                            ...value,
                            [item.id]: !value[item.id],
                          }))
                        }
                      >
                        {expanded[item.id] ? "收起错误详情" : "展开错误详情"}{" "}
                        {expanded[item.id] ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </Button>
                      {expanded[item.id] && <pre>{item.raw}</pre>}
                    </div>
                  ) : (
                    <div className="pg-answer-body">
                      <p>{displayBusinessCopy(item.answer)}</p>
                      {item.points && (
                        <ol>
                          {item.points.map((point) => (
                            <li key={point}>{displayBusinessCopy(point)}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                  {item.status !== "loading" && (
                    <div className="pg-answer-actions">
                      <Button theme="borderless" type="tertiary"
                        aria-label="复制"
                        onClick={() => copy(answerText(item))}
                      >
                        <Copy size={15} />
                      </Button>
                      <Button theme="borderless" type="tertiary"
                        aria-label="重新生成"
                        onClick={() => regenerate(index)}
                      >
                        <RefreshCw size={15} />
                      </Button>
                      <Button theme="borderless" type="tertiary"
                        aria-label="有帮助"
                        aria-pressed={ratings[item.id] === "up"}
                        onClick={() =>
                          setRatings((value) => ({ ...value, [item.id]: "up" }))
                        }
                      >
                        <ThumbsUp size={15} />
                      </Button>
                      <Button theme="borderless" type="tertiary"
                        aria-label="没帮助"
                        aria-pressed={ratings[item.id] === "down"}
                        onClick={() =>
                          setRatings((value) => ({
                            ...value,
                            [item.id]: "down",
                          }))
                        }
                      >
                        <ThumbsDown size={15} />
                      </Button>
                      <Button theme="borderless" type="tertiary"
                        aria-label="朗读"
                        onClick={() => read(answerText(item))}
                      >
                        <Volume2 size={15} />
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            ))}
            <div ref={end} />
          </div>
        ) : (
          <>
            <div className="pg-welcome">
              <h2>有什么可以帮你？</h2>
              <p>{imageUploadEnabled ? (canUploadImages ? "输入文字，或上传图片进行问答、创作和翻译。" : "输入文字完成问答、创作和翻译。") : "输入文字完成问答、创作和翻译，也可添加图片或视频进行理解。"}</p>
            </div>
            <div className="tx-suggestions">
              {recommendations.map(([label, prompt]) => (
                <Button theme="borderless" type="tertiary" key={label} onClick={() => choosePrompt(prompt)}>
                  <span>{label}</span>
                  <ArrowDownRight size={14} />
                </Button>
              ))}
            </div>
          </>
        )}

        <form
          className="pg-composer tx-composer"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          {images.length > 0 && <div className="tx-image-list" aria-label="已添加的图片">{images.map(image => <span key={image.url}><img src={image.url} alt={image.name} /><Button theme="borderless" type="tertiary" aria-label={`移除图片 ${image.name}`} onClick={() => removeImage(image)} disabled={readingImages}><X size={14} /></Button></span>)}</div>}
          <TextArea
            borderless
            autosize={{minRows:3,maxRows:9}}
            aria-label="输入消息"
            disabled={busy}
            value={text}
            onChange={setText}
            placeholder={imageUploadEnabled ? (canUploadImages ? "输入问题，或上传图片进行分析" : "输入问题") : "输入问题，或添加图片、视频进行分析"}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
          />
          {imageUploadEnabled && <input ref={imageInput} type="file" hidden multiple accept={IMAGE_ACCEPT} onChange={event => { attachImages(event.target.files); event.target.value = ""; }} />}
          <div className="pg-toolbar">
            {(!imageUploadEnabled || canUploadImages) && <Button theme="borderless" type="tertiary"
              className="pg-add pg-add-icon"
              aria-label={imageUploadEnabled ? "上传图片" : "添加附件"}
              title={imageUploadEnabled ? "上传图片（JPG、PNG、WebP、GIF；最多 4 张，每张 5 MB）" : "添加附件"}
              disabled={readingImages || busy}
              onClick={imageUploadEnabled ? () => imageInput.current?.click() : undefined}
            >
              {imageUploadEnabled ? <ImagePlus size={21} /> : <Plus size={21} />}
            </Button>}
            <div className="pg-text-tools">
              <Button theme="borderless" type="tertiary"
                aria-label="深度思考"
                title="深度思考"
                aria-pressed={deepThinking}
                onClick={() => setDeepThinking(!deepThinking)}
              >
                <BrainCircuit size={18} />
              </Button>
              <Button theme="borderless" type="tertiary"
                aria-label="参数设置"
                title="参数设置"
                onClick={() => setSettingsOpen(true)}
              >
                <SlidersHorizontal size={18} />
              </Button>
            </div>
            <div className="pg-primary-actions">
              <span className="pg-count">{text.length}/6000</span>
              <ModelPicker disabled={busy} models={models} value={model} onChange={changeModel} />
              {busy ? (
                <Button theme="solid"
                  className="pg-send"
                  aria-label="停止生成"
                  onClick={stopGeneration}
                >
                  <Square size={15} />
                </Button>
              ) : (
                <Button theme="solid"
                  className="pg-send"
                  htmlType="submit"
                  aria-label="发送"
                  disabled={!selectedModel?.callable || (!text.trim() && !images.length) || readingImages}
                >
                  <ArrowUp size={18} />
                </Button>
              )}
            </div>
          </div>
        </form>
        <p className="pg-quota-note">
          AI
          回复可能存在偏差，使用前请自行核实。用量与费用归属当前项目，具体以调用记录为准。
        </p>
      </div>

      <Modal visible={newDialog} title="新建对话？" okText="确认新建" cancelText="取消"
        maskClosable={false} onCancel={() => setNewDialog(false)} onOk={() => { setNewDialog(false); blank(); }}>
        <p>{images.length ? "确认后将移除未发送的图片；已发送的对话仍可从历史记录恢复。" : "当前草稿、生成状态或对话内容不会删除，仍可从历史记录恢复。"}</p>
      </Modal>
      <Modal visible={settingsOpen} title="参数设置" width="min(480px, calc(100vw - 24px))"
        onCancel={() => setSettingsOpen(false)} footer={<>
          <Button type="tertiary" onClick={() => { setSystemPrompt(""); setTemperature("0.7"); setTopP("0.8"); }}>恢复推荐值</Button>
          <Button theme="solid" onClick={() => setSettingsOpen(false)}>完成</Button>
        </>}>
        <div className="tx-parameter-fields">
          <label>系统提示词
            <TextArea value={systemPrompt} onChange={setSystemPrompt} placeholder="设定模型角色、回答范围或输出格式" />
          </label>
          <div>Temperature <output>{temperature}</output>
            <Slider aria-label="Temperature" min={0} max={2} step={0.1} value={Number(temperature)} onChange={value => setTemperature(String(value))} />
            <small>创意写作可适当提高；事实问答建议保持较低。</small>
          </div>
          <div>Top P <output>{topP}</output>
            <Slider aria-label="Top P" min={0} max={1} step={0.1} value={Number(topP)} onChange={value => setTopP(String(value))} />
            <small>通常只调整 Temperature 或 Top P 其中一个。</small>
          </div>
        </div>
      </Modal>
      {notice && (
        <div className="copy-toast" role="status">
          {notice === "已复制" && <Check size={15} />}
          {notice}
        </div>
      )}
    </section>
  );
}
