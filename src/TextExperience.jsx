import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUp,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import ModelSelectDialog from "./ModelSelectDialog";
import "./experience.css";
import "./experience-refinements.css";

const STORAGE_KEY = "moma-text-conversations-v1";
const models = [
  {
    name: "DeepSeek/DeepSeek-V4-Pro",
    icon: 1,
    type: "text",
    subscribed: true,
    billing: "Token Plan",
    desc: "擅长复杂推理、代码与长文本分析。",
  },
  {
    name: "ZHIPU/GLM-5.2",
    icon: 3,
    type: "text",
    subscribed: true,
    billing: "按量计费",
    desc: "兼顾推理质量与工具调用。",
  },
  {
    name: "Qwen/Qwen3.7-Max",
    icon: 4,
    type: "text",
    subscribed: false,
    billing: "按量计费",
    desc: "覆盖办公、编程与智能体任务。",
  },
  {
    name: "Moonshot/Kimi-K3",
    icon: 2,
    type: "text",
    subscribed: true,
    billing: "Token Plan",
    desc: "适合长文本阅读与知识问答。",
  },
  {
    name: "Qwen/Qwen3.5-VL",
    icon: 4,
    type: "multimodal",
    subscribed: true,
    billing: "按量计费",
    desc: "支持理解文字、图片和视频。",
  },
  {
    name: "ZHIPU/GLM-4.6V",
    icon: 3,
    type: "multimodal",
    subscribed: false,
    billing: "按量计费",
    desc: "支持图文理解与视觉问答。",
  },
];

const recommendations = [
  [
    "十年后的信",
    "请以第一人称写一封给十年后自己的信。语气温柔、克制而真诚，回顾此刻正在坚持的事情、害怕失去的东西和仍未说出口的愿望；加入两个具体生活细节，让情绪有落点；结尾不要给出确定答案，而是留下一个开放式悬念。全文约 900 字，避免空泛鸡汤。",
  ],
  [
    "雨夜故事",
    "请写一则发生在雨夜便利店的短篇故事。设计清晰的开场钩子、人物冲突和一次合理但意外的反转；主要人物不超过三人，用动作和对话推进情节，减少旁白解释；结尾留有余味但不故弄玄虚。全文约 1200 字，现实主义风格。",
  ],
  [
    "开业推文",
    "请为一家新开的社区手作面包店写开业推文。突出当天现烤、邻里感、可见的手作过程和限时优惠，开头 20 字内抓住注意力；正文包含店铺亮点、三款主推产品、开业活动、地址与营业时间；语气亲切自然，避免夸张营销，给出一个主标题和三个备选标题。",
  ],
  [
    "咖啡烘焙",
    "请用适合咖啡入门者的方式解释浅烘和深烘咖啡豆的区别。按烘焙程度、酸度、苦味、香气、醇厚度、咖啡因误区和适合冲煮方式逐项对比；用一张简洁表格总结，并分别推荐适合喜欢果香与喜欢浓郁口感的人如何选择。",
  ],
  [
    "产品翻译",
    "请将下面的中文产品发布邮件翻译成自然、专业的英文。保留原有段落和项目符号，产品名与技术术语不翻译；语气正式但不生硬，适合发送给海外企业客户。翻译后另附一份术语对照表，并标出原文中可能存在歧义、需要确认的表达。\n\n邮件主题：MoMA 智能路由 2.0 正式发布\n\n尊敬的客户：\n\n您好！我们很高兴地宣布，MoMA 智能路由 2.0 将于 2026 年 10 月 8 日正式上线。本次升级进一步优化了多模型调度能力，帮助企业在保障生成质量的同时降低模型调用成本。\n\n本次更新包括：\n- 新增效果优先、成本优先和平衡模式三种路由策略；\n- 支持按请求内容、响应时延和模型可用性自动选择模型；\n- 新增调用链路追踪与成本分析面板；\n- 支持通过现有 API Key 直接调用，无需修改鉴权方式。\n\n现有客户可在 MoMA 控制台免费体验 30 天。若您希望获取产品演示、迁移建议或专属报价，请回复本邮件联系我们的客户成功团队。\n\n感谢您一直以来对 MoMA 的支持！\n\nMoMA 产品团队",
  ],
];

const loadHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").slice(0, 20);
  } catch {
    return [];
  }
};

function ModelPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pg-model-picker">
      <button
        className="pg-model"
        type="button"
        aria-label="选择模型"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>{value}</span>
        <ChevronDown size={15} />
      </button>
      <ModelSelectDialog
        open={open}
        models={models}
        value={value}
        onApply={(next) => {
          onChange(next);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

export default function TextExperience({ onCompare, title = "文本生成" }) {
  const [model, setModel] = useState(models[0].name);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState(loadHistory);
  const [conversationId, setConversationId] = useState("");
  const [home, setHome] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deepThinking, setDeepThinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [temperature, setTemperature] = useState("0.7");
  const [topP, setTopP] = useState("0.8");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [ratings, setRatings] = useState({});
  const [expanded, setExpanded] = useState({});
  const [menu, setMenu] = useState("");
  const [renaming, setRenaming] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [notice, setNotice] = useState("");
  const timer = useRef();
  const end = useRef();
  const newDialog = useRef();
  const textarea = useRef();

  const activeConversation = conversations.find(
    (item) => item.id === conversationId,
  );
  const conversationActive = !home && Boolean(conversationId);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(conversations.slice(0, 20)),
    );
  }, [conversations]);
  useEffect(() => {
    if (conversationActive) end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, conversationActive]);
  useLayoutEffect(() => {
    const input = textarea.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 76), 216)}px`;
    input.style.overflowY = input.scrollHeight > 216 ? "auto" : "hidden";
  }, [text, conversationActive]);

  const persist = (id, nextMessages, patch = {}) => {
    const previous = conversations.find((item) => item.id === id);
    const record = {
      id,
      title:
        previous?.title || nextMessages[0]?.question.slice(0, 22) || "新对话",
      updatedAt: Date.now(),
      messages: nextMessages,
      model,
      deepThinking,
      temperature,
      topP,
      systemPrompt,
      ...previous,
      ...patch,
    };
    setConversations((current) =>
      [record, ...current.filter((item) => item.id !== id)]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 20),
    );
  };

  const finish = (id, pendingId, question, shouldFail, pendingMessages) => {
    const result = shouldFail
      ? {
          id: pendingId,
          question,
          status: "error",
          code: "10042000",
          requestId: `a${Date.now().toString(16)}-218b-4c24-8cfd-eccd7e92201e`,
          error: "Model.AccessDenied",
          message:
            "当前账号暂无该模型的调用权限，请订购模型或切换其他可用模型。",
          raw: 'event:error\n:HTTP_STATUS/403\ndata:{"code":"Model.AccessDenied","message":"Model access denied."}',
        }
      : {
          id: pendingId,
          question,
          status: "success",
          answer: `这是基于“${question.slice(0, 32)}${question.length > 32 ? "…" : ""}”生成的示例结果。`,
          points: [
            "先明确目标、对象与使用场景，避免回答停留在泛泛描述。",
            "按关键信息、判断依据与可执行建议组织内容，便于快速阅读。",
            "对不确定的信息明确标注，并给出下一步核验方式。",
          ],
        };
    const next = pendingMessages.map((item) =>
      item.id === pendingId ? result : item,
    );
    setMessages(next);
    persist(id, next);
    setBusy(false);
  };

  const send = (prompt = text) => {
    const question = prompt.trim();
    if (!question || busy) return;
    const id = conversationId || crypto.randomUUID();
    const pendingId = crypto.randomUUID();
    const pending = { id: pendingId, question, status: "loading" };
    const next = [...(conversationId ? messages : []), pending];
    setConversationId(id);
    setHome(false);
    setMessages(next);
    setText("");
    setBusy(true);
    persist(id, next, {
      title: question.replace("模拟调用失败：", "").slice(0, 22),
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
    const next = messages.map((item, i) =>
      i === index ? { ...item, status: "loading" } : item,
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

  const selectConversation = (item) => {
    clearTimeout(timer.current);
    setBusy(false);
    setConversationId(item.id);
    setMessages(item.messages);
    setModel(item.model);
    setDeepThinking(Boolean(item.deepThinking));
    setTemperature(item.temperature || "0.7");
    setTopP(item.topP || "0.8");
    setSystemPrompt(item.systemPrompt || "");
    setHome(false);
    setMenu("");
  };

  const blank = () => {
    clearTimeout(timer.current);
    setBusy(false);
    setConversationId("");
    setMessages([]);
    setText("");
    setDeepThinking(false);
    setHome(true);
    setMenu("");
  };
  const requestBlank = () => {
    if (text.trim() || busy || messages.length) newDialog.current?.showModal();
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
  const saveRename = (id) => {
    const title = renameValue.trim();
    if (title)
      setConversations((current) =>
        current
          .map((item) =>
            item.id === id ? { ...item, title, updatedAt: Date.now() } : item,
          )
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
    setRenaming("");
  };
  const deleteConversation = (item) => {
    if (!window.confirm(`确认删除“${item.title}”吗？删除后不可恢复。`)) return;
    setConversations((current) =>
      current.filter((value) => value.id !== item.id),
    );
    if (conversationId === item.id) blank();
  };

  const historySlot = document.getElementById("text-history-slot");
  const history =
    historySlot &&
    createPortal(
      <section className="tx-history-nav" aria-label="历史记录">
        <div>
          <span>历史记录</span>
          <small>{conversations.length}/20</small>
        </div>
        {conversations.length ? (
          conversations.map((item) => (
            <div
              className={`tx-history-item ${item.id === conversationId ? "selected" : ""}`}
              key={item.id}
            >
              {renaming === item.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => saveRename(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveRename(item.id);
                    if (event.key === "Escape") setRenaming("");
                  }}
                />
              ) : (
                <button
                  title={item.title}
                  onClick={() => selectConversation(item)}
                >
                  {item.title}
                </button>
              )}
              <button
                aria-label="更多操作"
                onClick={() => setMenu(menu === item.id ? "" : item.id)}
              >
                <MoreHorizontal size={15} />
              </button>
              {menu === item.id && (
                <div className="tx-history-menu">
                  <button
                    onClick={() => {
                      setRenaming(item.id);
                      setRenameValue(item.title);
                      setMenu("");
                    }}
                  >
                    <Pencil size={13} />
                    重命名
                  </button>
                  <button onClick={() => deleteConversation(item)}>
                    <Trash2 size={13} />
                    删除
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <p>暂无对话</p>
        )}
      </section>,
      historySlot,
    );

  const answerText = (item) => [item.answer, ...(item.points || [])].join("\n");
  return (
    <section
      className={`playground tx-page ${conversationActive ? "has-messages tx-conversation" : ""}`}
    >
      {history}
      {conversationActive ? (
        <div className="tx-topbar">
          <button onClick={blank}>
            <ArrowLeft size={17} />
            返回
          </button>
          <strong>{activeConversation?.title || "新对话"}</strong>
          <button onClick={requestBlank}>新建对话</button>
        </div>
      ) : (
        <div className="pg-heading">
          <div>
            <h1>{title}</h1>
            <p>
              文本生成模型用于理解和生成文字；多模态模型还可以理解图片、视频等内容。
            </p>
          </div>
          <div className="pg-heading-actions">
            {onCompare && (
              <button className="pg-compare-entry" onClick={onCompare}>
                模型对比
              </button>
            )}
            <button onClick={requestBlank}>新建对话</button>
          </div>
        </div>
      )}
      <div className="pg-workspace">
        {conversationActive ? (
          <div className="pg-history tx-message-list">
            {messages.map((item, index) => (
              <article key={item.id}>
                <div className="pg-question">{item.question}</div>
                <div className="pg-answer">
                  <div className="pg-answer-meta">
                    <strong>{model}</strong>
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
                      <button
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
                      </button>
                      {expanded[item.id] && <pre>{item.raw}</pre>}
                    </div>
                  ) : (
                    <div className="pg-answer-body">
                      <p>{item.answer}</p>
                      {item.points && (
                        <ol>
                          {item.points.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                  {item.status !== "loading" && (
                    <div className="pg-answer-actions">
                      <button
                        aria-label="复制"
                        onClick={() => copy(answerText(item))}
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        aria-label="重新生成"
                        onClick={() => regenerate(index)}
                      >
                        <RefreshCw size={15} />
                      </button>
                      <button
                        aria-label="有帮助"
                        aria-pressed={ratings[item.id] === "up"}
                        onClick={() =>
                          setRatings((value) => ({ ...value, [item.id]: "up" }))
                        }
                      >
                        <ThumbsUp size={15} />
                      </button>
                      <button
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
                      </button>
                      <button
                        aria-label="朗读"
                        onClick={() => read(answerText(item))}
                      >
                        <Volume2 size={15} />
                      </button>
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
              <p>输入文字完成问答、创作和翻译，也可添加图片或视频进行理解。</p>
            </div>
            <div className="tx-suggestions">
              {recommendations.map(([label, prompt]) => (
                <button key={label} onClick={() => choosePrompt(prompt)}>
                  <span>{label}</span>
                  <ArrowDownRight size={14} />
                </button>
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
          <textarea
            ref={textarea}
            aria-label="输入消息"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="输入问题，或添加图片、视频进行分析"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div className="pg-toolbar">
            <button
              className="pg-add pg-add-icon"
              type="button"
              aria-label="添加附件"
              title="添加附件"
            >
              <Plus size={21} />
            </button>
            <div className="pg-text-tools">
              <button
                type="button"
                aria-label="深度思考"
                title="深度思考"
                aria-pressed={deepThinking}
                onClick={() => setDeepThinking(!deepThinking)}
              >
                <BrainCircuit size={18} />
              </button>
              <button
                type="button"
                aria-label="参数设置"
                title="参数设置"
                onClick={() => setSettingsOpen(true)}
              >
                <SlidersHorizontal size={18} />
              </button>
            </div>
            <div className="pg-primary-actions">
              <span className="pg-count">{text.length}/6000</span>
              <ModelPicker value={model} onChange={setModel} />
              {busy ? (
                <button
                  className="pg-send"
                  type="button"
                  aria-label="停止生成"
                  onClick={stopGeneration}
                >
                  <Square size={15} />
                </button>
              ) : (
                <button
                  className="pg-send"
                  type="submit"
                  aria-label="发送"
                  disabled={!text.trim()}
                >
                  <ArrowUp size={18} />
                </button>
              )}
            </div>
          </div>
        </form>
        <p className="pg-quota-note">
          AI
          回复可能存在偏差，使用前请自行核实。使用本服务会消耗免费额度，用尽后会产生费用。
        </p>
      </div>

      <dialog className="pg-new-dialog" ref={newDialog}>
        <h2>新建对话？</h2>
        <p>当前草稿、生成状态或对话内容不会删除，仍可从历史记录恢复。</p>
        <div>
          <button onClick={() => newDialog.current?.close()}>取消</button>
          <button
            onClick={() => {
              newDialog.current?.close();
              blank();
            }}
          >
            确认新建
          </button>
        </div>
      </dialog>
      {settingsOpen && (
        <div
          className="tx-settings-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setSettingsOpen(false)
          }
        >
          <section
            className="tx-settings"
            role="dialog"
            aria-modal="true"
            aria-label="参数设置"
          >
            <header>
              <strong>参数设置</strong>
              <button aria-label="关闭" onClick={() => setSettingsOpen(false)}>
                <X size={17} />
              </button>
            </header>
            <label>
              系统提示词
              <textarea
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                placeholder="设定模型角色、回答范围或输出格式"
              />
            </label>
            <label>
              Temperature <output>{temperature}</output>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
              />
              <small>创意写作可适当提高；事实问答建议保持较低。</small>
            </label>
            <label>
              Top P <output>{topP}</output>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={topP}
                onChange={(event) => setTopP(event.target.value)}
              />
              <small>通常只调整 Temperature 或 Top P 其中一个。</small>
            </label>
            <footer>
              <button
                onClick={() => {
                  setSystemPrompt("");
                  setTemperature("0.7");
                  setTopP("0.8");
                }}
              >
                恢复推荐值
              </button>
              <button onClick={() => setSettingsOpen(false)}>完成</button>
            </footer>
          </section>
        </div>
      )}
      {notice && (
        <div className="copy-toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
    </section>
  );
}
