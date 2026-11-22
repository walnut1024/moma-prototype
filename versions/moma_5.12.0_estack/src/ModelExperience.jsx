import { useServiceDirectory, useExperienceSettings, beginExperience, finishExperience } from './useServiceDirectory';
import { readExperienceDraft, saveExperienceDraft } from './experience-drafts.mjs';
import FrontPageHeader from "./components/FrontPageHeader";
import { displayBusinessCopy } from './display-copy.mjs';
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  BrainCircuit,
  ChevronDown,
  CircleHelp,
  CirclePlus,
  Image,
  Mic,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { Button, Checkbox, Input, Modal, Select, Slider, TextArea } from '@douyinfe/semi-ui';
import ModelSelectDialog from "./ModelSelectDialog";
import SpeechRecorder from "./SpeechRecorder";
import "./experience.css";
import "./experience-refinements.css";

const emptyVideoProfile={modes:[],resolutions:[],aspects:[],durations:[],accept:'',add:'添加参考文件',sound:false};

function ExperienceSelect({ label, ...props }) {
  const id=useId();
  return <><span className="sr-only" id={id}>{label}</span><Select aria-labelledby={id} {...props}/></>;
}

function ModelPicker({ model, options, onChange, speech = false, task, disabled }) {
  const [open, setOpen] = useState(false);
  const selected =
    options.find((option) => option.id === model) || { name: '请选择模型' };
  return (
    <div className="pg-model-picker">
      <Button theme="borderless" type="tertiary"
        className="pg-model"

        disabled={disabled}
        aria-label="选择模型"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {speech && <Volume2 size={18} aria-hidden="true" />}
        <span>{speech ? selected.name.split("/").reverse().join(" · ") : selected.name}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </Button>
      <ModelSelectDialog
        open={open}
        task={task}
        models={options}
        value={model}
        onApply={onChange}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

export default function ModelExperience({
  kind = "text",
  groupLabel,
  onKindChange,
  onCompare, initialServiceId = "", owner = "", project,
}) {
  const mode = "语音识别";
  const directory = useServiceDirectory(kind,project), models = directory.models;
  const {settings,error:settingsError}=useExperienceSettings(kind);
  const voiceCatalog=settings?.voices || [],videoProfile=settings?.video || emptyVideoProfile;
  const [draft] = useState(() => { try { return readExperienceDraft(owner, kind); } catch { return { storageError: '草稿读取失败，请核对本地存储' }; } });
  const ticket = useRef(null);
  const [model, setModel] = useState(initialServiceId || draft.model || models.find(item => item.callable)?.id || '');
  const selectedModel = models.find(item => item.id === model);
  const defaultModel = models.find(item => item.callable)?.id;
  useEffect(() => { if (!model && defaultModel) setModel(defaultModel); }, [model,defaultModel]);
  const [text, setText] = useState(draft.text || '');
  const [file, setFile] = useState(draft.file || null);
  const [url, setUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [messages, setMessages] = useState(draft.messages || []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [temperature, setTemperature] = useState(draft.temperature || "0.7");
  const [topP, setTopP] = useState(kind === "text" ? "0.8" : "0.9");
  const [systemPrompt, setSystemPrompt] = useState(draft.systemPrompt || "");
  const [stop, setStop] = useState("");
  const [thinkingBudget, setThinkingBudget] = useState("4000");
  const [deepThinking, setDeepThinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({
    systemPrompt: "",
    stop: "",
    topP: "1",
    temperature: "1",
    thinkingBudget: "4000",
    showStop: false,
  });
  const [speed, setSpeed] = useState("1");
  const [pitch, setPitch] = useState("1");
  const [volume, setVolume] = useState("50");
  const [voice, setVoice] = useState("");
  const [format, setFormat] = useState("mp3");
  const [language, setLanguage] = useState(draft.language || "auto");
  const [removeFillers, setRemoveFillers] = useState(false);
  const [imageSize, setImageSize] = useState(draft.imageSize || "1024 × 1024");
  const [imageCount, setImageCount] = useState(draft.imageCount || "1");
  const [videoMode, setVideoMode] = useState(draft.videoMode || "");
  const [resolution, setResolution] = useState(draft.resolution || "");
  const [aspect, setAspect] = useState(draft.aspect || "");
  const [duration, setDuration] = useState(draft.duration || "");
  const [sound, setSound] = useState(true);
  const [previewing, setPreviewing] = useState(-1);
  const [newDialog, setNewDialog] = useState(false);
  const [notice, setNotice] = useState("");
  const [ratings, setRatings] = useState({});
  const timer = useRef();
  const end = useRef();
  const input = useRef();
  const recorder = useRef(null);
  const microphone = useRef(null);
  const recordTimer = useRef(null);
  const recordLimit = useRef(null);
  const recordStarted = useRef(0);
  const recordSession = useRef(0);
  const asr = kind === "voice" && mode === "语音识别";
  const tts = kind === "voice" && !asr;
  const visualGeneration = kind === "image" || kind === "video";
  const upload = kind === "text" || visualGeneration;
  const label =
    groupLabel ||
    (kind === "text"
      ? "文本生成"
      : kind === "image"
        ? "图片生成"
        : kind === "video"
          ? "视频生成"
          : "语音生成");

  useEffect(() => {
    if (draft.storageError) { setError(draft.storageError); return; }
    try { saveExperienceDraft(owner, kind, { model, text, file, messages, temperature, topP, systemPrompt, imageSize, imageCount, videoMode, resolution, aspect, duration, sound, language, removeFillers }); }
    catch { setError('草稿无法保存，请检查浏览器存储。'); }
  }, [owner, kind, model, text, file, messages, temperature, topP, systemPrompt, imageSize, imageCount, videoMode, resolution, aspect, duration, sound, language, removeFillers]);
  const prompts = settings?.prompts || [];
  useEffect(()=>{
    if(settings?.video){
      const preferred=(value,options)=>options.includes(value)?value:options[0] || '';
      setVideoMode(value=>preferred(value,settings.video.modes));
      setResolution(value=>preferred(value,settings.video.resolutions));
      setAspect(value=>preferred(value,settings.video.aspects));
      setDuration(value=>preferred(value,settings.video.durations));
      if(!settings.video.sound)setSound(false);
    }
    if(settings?.voices?.length)setVoice(value=>value || settings.voices[0].id);
  },[settings]);
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  useEffect(
    () => () => {
      clearTimeout(timer.current); ticket.current=null;
      recordSession.current += 1;
      clearInterval(recordTimer.current);
      clearTimeout(recordLimit.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      microphone.current?.getTracks().forEach((track) => track.stop());
      if (kind === "voice") window.speechSynthesis?.cancel();
    },
    [kind],
  );
  useEffect(() => {
    if (messages.length)
      end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  function reset() {
    clearTimeout(timer.current); ticket.current=null;
    recordSession.current += 1;
    clearInterval(recordTimer.current);
    clearTimeout(recordLimit.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    microphone.current?.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    microphone.current = null;
    setRecording(false);
    setRequestingMic(false);
    setRecordSeconds(0);
    window.speechSynthesis?.cancel();
    setBusy(false);
    setMessages([]);
    setRatings({});
    setPreviewing(-1);
    setText("");
    setFile(null);
    setError("");
    setSpeed("1");
    setPitch("1");
    setVolume("50");
    setVoice("longxiaochun_v2");
    setFormat("mp3");
    setLanguage("auto");
    setRemoveFillers(false);
  }
  function createConversation() {
    if (busy || recording || requestingMic || messages.length || text.trim() || file) {
      setNewDialog(true);
      return;
    }
    reset();
    setNotice("已创建新对话");
  }
  function confirmConversation() {
    setNewDialog(false);
    reset();
    setNotice("已创建新对话");
  }
  function parameterDefaults(value = model) {
    if (value.startsWith("DeepSeek/"))
      return { temperature: "0.7", topP: "0.8", thinkingBudget: "4000" };
    if (value.startsWith("Qwen/"))
      return { temperature: "0.7", topP: "0.8", thinkingBudget: "8192" };
    return { temperature: "0.7", topP: "0.9", thinkingBudget: "4000" };
  }
  function changeModel(value) {
    setModel(value);
    if (kind === "video") {
      const profile = videoProfile;
      setVideoMode(profile.modes[0]);
      setResolution(profile.resolutions[0]);
      setAspect(profile.aspects[0]);
      setDuration(profile.durations[0]);
      setSound(profile.sound);
      setFile(null);
    }
    const defaults = parameterDefaults(value);
    setTemperature(defaults.temperature);
    setTopP(defaults.topP);
    setThinkingBudget(defaults.thinkingBudget);
    setNotice(`已切换至 ${models.find(item => item.id === value)?.name || '所选模型'}`);
  }
  function openModelSettings() {
    setSettingsDraft({
      systemPrompt,
      stop,
      topP,
      temperature,
      thinkingBudget,
      showStop: Boolean(stop),
    });
    setSettingsOpen(true);
  }
  function saveModelSettings(event) {
    event.preventDefault();
    setSystemPrompt(settingsDraft.systemPrompt);
    setStop(settingsDraft.stop);
    setTopP(settingsDraft.topP);
    setTemperature(settingsDraft.temperature);
    setThinkingBudget(settingsDraft.thinkingBudget);
    setSettingsOpen(false);
    setNotice("模型参数已保存");
  }
  function attach(value) {
    if (!value) return;
    if(kind==='video' && !videoProfile.accept){setError('视频体验配置尚未加载');return;}
    const allowed = kind === "video"
        ? new RegExp(
            `^(${videoProfile.accept
              .split(",")
              .map((type) => type.split("/")[0])
              .join("|")})/`,
          )
        : visualGeneration
          ? /^image\//
          : /^(image|video)\//;
    if (!allowed.test(value.type)) {
      setError(
        kind === "video"
            ? `当前模型仅支持：${videoProfile.accept.replaceAll("/*", "").replaceAll(",", "、")}`
            : visualGeneration
              ? "请选择图片作为参考素材。"
              : "请选择图片或视频文件。",
      );
      return;
    }
    if (value.size > 60 * 1024 * 1024) {
      setError("文件不能超过 60MB。");
      return;
    }
    setFile(value);
    setError("");
  }
  async function startRecording() {
    const session = ++recordSession.current;
    setFile(null);
    setRecordSeconds(0);
    setError("");
    setNotice("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("当前浏览器不支持录音，请使用支持麦克风的浏览器。");
      return;
    }
    let stream;
    setRequestingMic(true);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== recordSession.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const chunks = [];
      const media = new MediaRecorder(stream);
      microphone.current = stream;
      recorder.current = media;
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      media.onstop = () => {
        if (session !== recordSession.current) return;
        if (!chunks.length) {
          setError("未录到声音，请重新录音。");
          return;
        }
        const type = media.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        setFile(new File(chunks, `录音.${ext}`, { type }));
      };
      media.start();
      setRequestingMic(false);
      recordStarted.current = Date.now();
      setRecording(true);
      recordTimer.current = setInterval(() => {
        setRecordSeconds(Math.min(60, Math.floor((Date.now() - recordStarted.current) / 1000)));
      }, 250);
      recordLimit.current = setTimeout(() => stopRecording(), 60_000);
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      setError(cause?.name === "NotAllowedError" ? "请允许使用麦克风后重试。" : "麦克风不可用，请检查设备后重试。");
      setRequestingMic(false);
    }
  }
  function stopRecording() {
    clearInterval(recordTimer.current);
    clearTimeout(recordLimit.current);
    setRecordSeconds(Math.min(60, Math.max(1, Math.ceil((Date.now() - recordStarted.current) / 1000))));
    setRecording(false);
    if (recorder.current?.state === "recording") recorder.current.stop();
    microphone.current?.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    microphone.current = null;
  }
  function send(event) {
    event?.preventDefault();
    if(!settings){setError(settingsError || '体验配置尚未加载');return;}
    if (busy || !model || (asr && !file) || (!asr && !text.trim() && !file))
      return;
    try { ticket.current = beginExperience(directory, model, kind, {images:Boolean(file && kind!=='voice')}); } catch (error) { setError(error.message); return; }
    setError('');
    setNotice('');
    setBusy(true);
    const message = {
      text: text.trim() || (kind === "text" && file ? "请分析这个文件" : ""),
      file: file?.name,
      model: selectedModel?.name, serviceId: model, owner,
      mode,
      temperature,
      topP,
      systemPrompt,
      stop,
      thinkingBudget,
      deepThinking,
      speed,
      pitch,
      volume,
      voice,
      format,
      language,
      removeFillers,
      imageSize,
      imageCount,
      videoMode,
      resolution,
      aspect,
      duration,
      sound,
    };
    const current=ticket.current;
    timer.current = setTimeout(async () => {
      let result;
      try {
        result=await finishExperience(current,{
          prompt:message.text,
          ...(kind==='image'?{imageCount:Number(message.imageCount)}:{}),
          ...(kind==='voice'?{speechMode:asr?'asr':'tts'}:{}),
        });
      } catch(error) {
        if(ticket.current===current){setError(error.message);setBusy(false);}
        return;
      }
      if(ticket.current!==current)return;
      setMessages((items) => [
        ...items,
        {
          ...message,
          answer: result.experience?.speakInput ? message.text : result.experience?.answer || '',
          points: result.experience?.points,
          artifacts: result.experience?.artifacts,
        },
      ]);
      setBusy(false);
      setText("");
      setFile(null);
    }, 600);
  }
  async function copyResponse(message, markdown = false) {
    const body = message.points
      ? [
          displayBusinessCopy(message.answer),
          "",
          "### 建议从以下三个方面着手",
          "",
          ...message.points.map(
            (point, index) =>
              `${index + 1}. **${point.title}**\n   ${point.body}`,
          ),
          "",
        ].join("\n")
      : displayBusinessCopy(message.answer);
    try {
      await navigator.clipboard.writeText(
        markdown ? body : body.replace(/[#>*]/g, ""),
      );
      setNotice(markdown ? "已复制 Markdown" : "已复制结果");
    } catch {
      setError("复制失败，请手动选择文本复制。");
    }
  }
  function speak(message) {
    if (!window.speechSynthesis) {
      setError("当前浏览器不支持语音试听。");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(displayBusinessCopy(message.answer));
    utterance.lang = "zh-CN";
    utterance.rate = Number(message.speed);
    window.speechSynthesis.speak(utterance);
  }
  function previewVoice(item) {
    if (!window.speechSynthesis) {
      setError("当前浏览器不支持音色试听。");
      return;
    }
    setVoice(item.id);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      `你好，我是${item.name}，欢迎体验语音合成。`,
    );
    utterance.lang = "zh-CN";
    window.speechSynthesis.speak(utterance);
  }
  const headingCopy =
    groupLabel === "视觉模型"
      ? "视觉模型支持图片与视频内容生成，可按创作目标切换模式。"
      : kind === "text"
        ? "文本生成模型用于理解和生成文字；多模态理解模型还可以分析图片、视频等内容。"
        : kind === "image"
          ? "图片生成模型是能够根据文字描述或参考图创作图片的人工智能模型。"
          : kind === "video"
            ? "视频生成模型是能够根据文字描述或参考图创作视频的人工智能模型。"
            : "语音模型可以把文字转换成声音，也可以识别和理解语音内容。";
  const welcomeTitle =
    kind === "text"
      ? "有什么可以帮你？"
      : kind === "image"
        ? "把想象，变成画面"
        : kind === "video"
          ? "让创意，动起来"
          : asr
            ? "让声音，成为文字"
            : "让文字，被听见";
  const welcomeCopy =
    kind === "text"
      ? "输入文字完成问答、创作和分析，也可添加图片或视频进行理解。"
      : kind === "image"
        ? "描述画面，或添加参考图，生成你的第一张作品。"
        : kind === "video"
          ? "描述镜头，或添加参考图，生成一段视频。"
          : asr
            ? "最长录音 60 秒，试听后开始识别。"
            : "输入一段文字，体验自然流畅的语音表达。";
  const placeholder = tts
    ? "输入需要合成的文本…"
    : kind === "text"
      ? "输入问题，或添加图片、视频进行分析"
      : kind === "image"
        ? "描述画面主体、风格、光线与构图…"
        : kind === "video"
          ? "描述镜头内容、运动方式与氛围…"
          : "输入问题";
  return (
    <section
      className={`playground pg-${kind}-experience ${asr ? "pg-asr-experience" : ""} ${messages.length ? "has-messages" : ""}`}
    >
      <FrontPageHeader className="pg-heading" title={label} description={headingCopy} icon={kind === "voice" ? Mic : Image} actions={<div className="pg-heading-actions">{kind === "text" && <Button theme="borderless" type="tertiary"  className="pg-compare-entry" onClick={onCompare}>模型对比</Button>}<Button theme="solid" onClick={createConversation}>新建对话</Button></div>} />
      {(directory.error || settingsError || directory.identityError || !selectedModel?.callable) && <p role="status">{directory.error || settingsError || directory.identityError || selectedModel?.reason || "请选择可体验的模型"}</p>}
      {onKindChange && (
        <div className="pg-tabs" aria-label="视觉体验模式">
          {[
            ["image", "图片生成"],
            ["video", "视频生成"],
          ].map(([value, text]) => (
            <Button theme="borderless" type="tertiary"

              aria-pressed={kind === value}
              key={value}
              onClick={() => onKindChange(value)}
            >
              {value === "image" ? (
                <Image size={16} aria-hidden="true" />
              ) : (
                <Video size={16} aria-hidden="true" />
              )}
              {text}
            </Button>
          ))}
        </div>
      )}
      <div
        className={`pg-workspace ${tts && !messages.length ? "pg-tts-workspace" : ""}`}
      >
        {messages.length ? (
          <div className="pg-history" aria-live="polite">
            {messages.map((message, index) => (
              <article key={index}>
                <div className="pg-question">
                  {message.file && <small>{message.file}</small>}
                  {message.text ||
                    (visualGeneration
                      ? "请基于参考图生成内容"
                      : "请将这段音频转写为文字")}
                </div>
                <div className="pg-answer">
                  <div className="pg-answer-meta">
                    <strong>{message.model}</strong>
                    <small>
                      {visualGeneration ? (
                        kind === "image" ? (
                          `图片生成 · ${message.imageSize} · ${message.imageCount} 张`
                        ) : (
                          `视频生成 · ${message.resolution} · ${message.aspect} · ${message.duration}`
                        )
                      ) : (
                        <>
                          生成结果
                          {!asr &&
                            ` · temperature ${message.temperature} · top_p ${message.topP}`}
                          {message.deepThinking && " · 深度思考"}
                        </>
                      )}
                    </small>
                  </div>
                  {visualGeneration ? (
                    <div
                      className={`pg-generation-result ${kind === "video" ? "is-video" : ""}`}
                    >
                      {(message.artifacts || []).map(
                        (artifact, resultIndex) => (
                          <figure key={resultIndex}>
                            <img
                              src={artifact.url}
                              alt={
                                kind === "image"
                                  ? `生成图片 ${resultIndex + 1}`
                                  : "生成视频封面"
                              }
                            />
                            {kind === "video" && (
                              <Button theme="borderless" type="tertiary"

                                aria-label={
                                  previewing === index
                                    ? "暂停视频预览"
                                    : "播放视频预览"
                                }
                                onClick={() =>
                                  setPreviewing((value) =>
                                    value === index ? -1 : index,
                                  )
                                }
                              >
                                {previewing === index ? (
                                  <Pause size={25} aria-hidden="true" />
                                ) : (
                                  <Play size={25} aria-hidden="true" />
                                )}
                              </Button>
                            )}
                            <figcaption>
                              <span>
                                {kind === "image"
                                  ? `${message.imageSize} · 图片 ${resultIndex + 1}`
                                  : `${message.videoMode} · ${message.sound ? "包含声音" : "静音"}`}
                              </span>
                              <a
                                href={artifact.url}
                                download
                              >
                                下载
                              </a>
                            </figcaption>
                          </figure>
                        ),
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="pg-answer-body">
                        <p>{displayBusinessCopy(message.answer)}</p>
                        {message.points && (
                          <>
                            <h3>建议从以下三个方面着手</h3>
                            <ol>
                              {message.points.map((point) => (
                                <li key={point.title}>
                                  <strong>{point.title}</strong>
                                  <p>{point.body}</p>
                                </li>
                              ))}
                            </ol>
                          </>
                        )}
                      </div>
                      <div className="pg-answer-actions" aria-label="回答操作">
                        <Button theme="borderless" type="tertiary"

                          title="复制为 Markdown"
                          onClick={() => copyResponse(message, true)}
                        >
                          复制 MD
                        </Button>
                        <Button theme="borderless" type="tertiary"

                          title="复制纯文本"
                          onClick={() => copyResponse(message)}
                        >
                          复制
                        </Button>
                        <Button theme="borderless" type="tertiary"

                          aria-pressed={ratings[index] === "up"}
                          onClick={() =>
                            setRatings((values) => ({
                              ...values,
                              [index]: values[index] === "up" ? "" : "up",
                            }))
                          }
                        >
                          有帮助
                        </Button>
                        <Button theme="borderless" type="tertiary"

                          aria-pressed={ratings[index] === "down"}
                          onClick={() =>
                            setRatings((values) => ({
                              ...values,
                              [index]: values[index] === "down" ? "" : "down",
                            }))
                          }
                        >
                          没帮助
                        </Button>
                        <Button theme="borderless" type="tertiary"

                          aria-label="试听"
                          onClick={() => speak(message)}
                        >
                          朗读
                        </Button>
                        {message.mode === "语音合成" && kind === "voice" && (
                          <Button theme="borderless" type="tertiary"

                            onClick={() => window.speechSynthesis?.cancel()}
                          >
                            停止播放
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </article>
            ))}
            <div ref={end} />
          </div>
        ) : (
          <div className="pg-welcome">
            <h2>{welcomeTitle}</h2>
            <p>{welcomeCopy}</p>
          </div>
        )}
        {!messages.length && !asr && !tts && (
          <div className="pg-prompts" aria-label="快捷提示">
            <div>
              {prompts.map((item) => (
                <Button theme="borderless" type="tertiary"

                  key={item.label}
                  onClick={() => setText(item.prompt)}
                >
                  <span>{item.label}</span>
                  <ArrowDownRight size={14} aria-hidden="true" />
                </Button>
              ))}
            </div>
          </div>
        )}
        <form
          className="pg-composer"
          onSubmit={send}
          onDragOver={(e) => {
            if (upload) e.preventDefault();
          }}
          onDrop={(e) => {
            if (upload) {
              e.preventDefault();
              attach(e.dataTransfer.files[0]);
            }
          }}
        >
          {upload && (
            <input
              ref={input}
              hidden
              type="file"
              accept={
                kind === "video"
                    ? videoProfile.accept
                    : visualGeneration
                      ? "image/*"
                      : "image/*,video/*"
              }
              onChange={(e) => {
                attach(e.target.files[0]);
                e.target.value = "";
              }}
            />
          )}
          {asr && <SpeechRecorder
            file={file} url={url} recording={recording} requesting={requestingMic}
            seconds={recordSeconds} stream={microphone.current} disabled={busy}
            onStart={startRecording} onStop={stopRecording} onRemove={() => setFile(null)}
          />}
          {!asr && upload && file && (
            <div className="pg-attachment">
              <div>
                {file.type.startsWith("image/") ? (
                  <img
                    src={url || undefined}
                    alt={visualGeneration ? "参考图预览" : "待分析图片预览"}
                  />
                ) : (
                  <video src={url || undefined} controls />
                )}
                <span>
                  {file.name}
                  <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
                </span>
              </div>
              <Button theme="borderless" type="tertiary"  onClick={() => setFile(null)}>
                移除
              </Button>
            </div>
          )}
          {!asr && (
            <TextArea borderless autosize={{minRows:3,maxRows:9}}
              aria-label="体验输入"
              disabled={busy}
              maxLength={6000}
              value={text}
              onChange={(next) => setText(next)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                )
                  send(e);
              }}
              placeholder={placeholder}
            />
          )}
          <div className="pg-toolbar">
            {kind === "text" ? (
              <Button theme="borderless" type="tertiary"
                className="pg-settings-trigger"

                aria-label="参数设置"
                title={`${topP} · ${temperature} · ${thinkingBudget}`}
                onClick={openModelSettings}
              >
                <SlidersHorizontal size={20} aria-hidden="true" />
              </Button>
            ) : (
              <div className="pg-settings">
                <Button type="tertiary" theme="borderless" aria-label="参数设置" title="参数设置"
                  icon={<SlidersHorizontal size={18}/>} onClick={() => setSettingsOpen(true)}>
                  {asr && <span>参数设置</span>}
                </Button>
                <Modal visible={settingsOpen} title="生成参数" width="min(500px, calc(100vw - 24px))"
                  onCancel={() => setSettingsOpen(false)}
                  footer={<Button theme="solid" onClick={() => setSettingsOpen(false)}>完成</Button>}>
                <div className="pg-semi-settings">
                  {kind === "image" ? (
                    <>
                      <div className="pg-api-grid">
                        <label>
                          <span>图片尺寸</span>
                          <ExperienceSelect label="图片尺寸" value={imageSize} onChange={next => setImageSize(next)} optionList={[{"value":"1024 × 1024","label":"1024 × 1024"},{"value":"1280 × 720","label":"1280 × 720"},{"value":"720 × 1280","label":"720 × 1280"}]} />
                        </label>
                        <label>
                          <span>生成数量</span>
                          <ExperienceSelect label="生成数量" value={imageCount} onChange={next => setImageCount(next)} optionList={[{"value":"1","label":"1 张"},{"value":"2","label":"2 张"},{"value":"4","label":"4 张"}]} />
                        </label>
                      </div>
                    </>
                  ) : kind === "video" ? (
                    <>
                      <div className="pg-api-grid">
                        <label>
                          <span>生成模式</span>
                          <ExperienceSelect label="生成模式" value={videoMode} onChange={next => setVideoMode(next)} optionList={[{"value":"全能模式","label":"全能模式"},{"value":"首帧生视频","label":"首帧生视频"},{"value":"参考生视频","label":"参考生视频"}]} />
                        </label>
                        <label>
                          <span>分辨率</span>
                          <ExperienceSelect label="视频分辨率" value={resolution} onChange={next => setResolution(next)} optionList={[{"value":"1080P","label":"1080P"},{"value":"720P","label":"720P"}]} />
                        </label>
                        <label>
                          <span>画面比例</span>
                          <ExperienceSelect label="视频比例" value={aspect} onChange={next => setAspect(next)} optionList={[{"value":"16:9","label":"16:9"},{"value":"9:16","label":"9:16"},{"value":"1:1","label":"1:1"}]} />
                        </label>
                        <label>
                          <span>视频时长</span>
                          <ExperienceSelect label="视频时长" value={duration} onChange={next => setDuration(next)} optionList={[{"value":"5秒","label":"5秒"},{"value":"10秒","label":"10秒"}]} />
                        </label>
                      </div>
                      <label className="pg-check">
                        <Checkbox aria-label="生成声音" checked={sound} onChange={(e) => setSound(e.target.checked)} />
                        <span>
                          <b>生成声音</b>
                        </span>
                      </label>
                      <p className="pg-param-tip">
                        可添加一张参考图，帮助模型理解画面内容与风格。
                      </p>
                    </>
                  ) : tts ? (
                    <>
                      <div className="pg-api-grid">
                        <label>
                          <span>发音人</span>
                          <ExperienceSelect label="发音人" value={voice} onChange={next => setVoice(next)} optionList={[{"value":"longxiaochun_v2","label":"龙小淳"},{"value":"longcheng_v2","label":"龙橙"},{"value":"longhua_v2","label":"龙华"},{"value":"longshu_v2","label":"龙书"}]} />
                        </label>
                        <label>
                          <span>输出格式</span>
                          <ExperienceSelect label="输出格式" value={format} onChange={next => setFormat(next)} optionList={[{"value":"mp3","label":"MP3"},{"value":"wav","label":"WAV"},{"value":"pcm","label":"PCM"}]} />
                        </label>
                      </div>
                      <label className="pg-param">
                        <span>
                          <b>语速</b>
                          <output>{speed} 倍</output>
                        </span>
                        <small>0.5–2.0 倍</small>
                        <Slider aria-label="语速" min={0.5} max={2} step={0.1} value={Number(speed)} onChange={next => setSpeed(String(next))} />
                      </label>
                      <label className="pg-param">
                        <span>
                          <b>音调</b>
                          <output>{pitch} 倍</output>
                        </span>
                        <small>0.5–2.0 倍</small>
                        <Slider aria-label="音调" min={0.5} max={2} step={0.1} value={Number(pitch)} onChange={next => setPitch(String(next))} />
                      </label>
                      <label className="pg-param">
                        <span>
                          <b>音量</b>
                          <output>{volume}</output>
                        </span>
                        <small>0–100</small>
                        <Slider aria-label="音量" min={0} max={100} step={1} value={Number(volume)} onChange={next => setVolume(String(next))} />
                      </label>
                    </>
                  ) : asr ? (
                    <>
                      <div className="pg-api-grid pg-api-grid-single">
                        <label>
                          <span>识别语种</span>
                          <ExperienceSelect label="识别语种" value={language} onChange={next => setLanguage(next)} optionList={[{"value":"auto","label":"自动检测"},{"value":"zh","label":"中文"},{"value":"en","label":"英语"},{"value":"yue","label":"粤语"},{"value":"ja","label":"日语"},{"value":"ko","label":"韩语"}]} />
                        </label>
                      </div>
                      <label className="pg-check">
                        <Checkbox aria-label="过滤语气词" checked={removeFillers} onChange={(e) => setRemoveFillers(e.target.checked)} />
                        <span>
                          <b>过滤语气词</b>
                        </span>
                      </label>
                      <p className="pg-param-tip">
                        SenseVoice 单次仅支持指定一个语种；默认自动检测。
                      </p>
                    </>
                  ) : (
                    <>
                      <label className="pg-param">
                        <span>
                          <b>Temperature</b>
                          <output>{temperature}</output>
                        </span>
                        <small>值越高，回答越有创造性</small>
                        <Slider aria-label="Temperature" min={0} max={2} step={0.1} value={Number(temperature)} onChange={next => setTemperature(String(next))} />
                        <i>
                          <span>精准 0</span>
                          <span>创意 2</span>
                        </i>
                      </label>
                      <label className="pg-param">
                        <span>
                          <b>Top P</b>
                          <output>{topP}</output>
                        </span>
                        <small>控制模型考虑的候选词范围</small>
                        <Slider aria-label="Top P" min={0} max={1} step={0.05} value={Number(topP)} onChange={next => setTopP(String(next))} />
                        <i>
                          <span>收敛 0</span>
                          <span>丰富 1</span>
                        </i>
                      </label>
                      <p className="pg-param-tip">
                        通常建议只调整 Temperature 或 Top P 其中一项。
                      </p>
                    </>
                  )}
                </div>
                </Modal>
              </div>
            )}
            {kind === "text" && (
              <div className="pg-text-tools">
                <Button theme="borderless" type="tertiary"

                  aria-label={deepThinking ? "关闭深度思考" : "开启深度思考"}
                  title={deepThinking ? "深度思考已开启" : "开启深度思考"}
                  aria-pressed={deepThinking}
                  onClick={() => {
                    setDeepThinking((value) => !value);
                    setNotice(
                      deepThinking ? "已关闭深度思考" : "已开启深度思考",
                    );
                  }}
                >
                  <BrainCircuit size={19} aria-hidden="true" />
                </Button>
              </div>
            )}
            {kind === "video" && (
              <div className="pg-video-options" aria-label="视频生成选项">
                <label>
                  <span>模式</span>
                  <ExperienceSelect label="生成模式" value={videoMode} onChange={next => setVideoMode(next)} optionList={videoProfile.modes.map(value => ({value,label:value}))} />
                </label>
                <label>
                  <span>清晰度</span>
                  <ExperienceSelect label="视频分辨率" value={resolution} onChange={next => setResolution(next)} optionList={videoProfile.resolutions.map(value => ({value,label:value}))} />
                </label>
                <label>
                  <span>比例</span>
                  <ExperienceSelect label="视频比例" value={aspect} onChange={next => setAspect(next)} optionList={videoProfile.aspects.map(value => ({value,label:value}))} />
                </label>
                <label>
                  <span>时长</span>
                  <ExperienceSelect label="视频时长" value={duration} onChange={next => setDuration(next)} optionList={videoProfile.durations.map(value => ({value,label:value}))} />
                </label>
                {videoProfile.sound && (
                  <Button theme="borderless" type="tertiary"

                    aria-pressed={sound}
                    onClick={() => setSound((value) => !value)}
                  >
                    <Volume2 size={16} aria-hidden="true" />
                    声音
                  </Button>
                )}
              </div>
            )}
            {upload && !asr && (
              <Button theme="borderless" type="tertiary"
                className="pg-add pg-add-icon"

                aria-label={
                  kind === "video"
                    ? file
                      ? "替换参考素材"
                      : videoProfile.add
                    : visualGeneration
                      ? file
                        ? "替换参考图"
                        : "添加参考图"
                      : file
                        ? "替换图片或视频"
                        : "添加图片或视频"
                }
                title={kind === "video" ? videoProfile.add : undefined}
                onClick={() => input.current.click()}
              >
                <CirclePlus size={24} aria-hidden="true" />
              </Button>
            )}
            <div className="pg-primary-actions">
              <span className="pg-count">
                {asr ? "" : `${text.length}/6000`}
              </span>
              <ModelPicker
                model={model}
                task={kind}
                disabled={busy}
                speech={asr}
                options={models}
                onChange={changeModel}
              />
              <Button htmlType="submit" theme="solid"
                className="pg-send"

                aria-label={
                  asr
                    ? "开始识别"
                    : tts
                      ? "生成语音"
                      : kind === "image"
                        ? "生成图片"
                        : kind === "video"
                          ? "生成视频"
                          : undefined
                }
                title={asr ? "开始识别" : undefined}
                disabled={
                  busy || !selectedModel?.callable || (asr && !file) || (!asr && !text.trim() && !file)
                }
              >
                {busy ? (
                  (asr ? "识别中…" : "生成中…")
                ) : asr ? "开始识别" : visualGeneration || (tts && !messages.length) ? (
                  <ArrowUp size={20} aria-hidden="true" />
                ) : tts ? (
                  "生成语音"
                ) : (
                  "发送"
                )}
              </Button>
            </div>
          </div>
        </form>
        <p className="pg-quota-note">
          {visualGeneration
            ? "AI 生成内容可能存在偏差，使用前请自行核实。用量以当前项目的调用记录为准。"
            : asr
              ? "识别结果可能存在偏差，请结合录音核对。"
              : "体验产生的用量将从您已订购的模型额度中扣除，具体以用量记录为准。"}
        </p>
        {tts && !messages.length && (
          <section
            className="pg-voice-library"
            aria-labelledby="voice-library-title"
          >
            <header>
              <h3 id="voice-library-title">音色库</h3>
              <Button theme="borderless" type="tertiary" >
                查看更多 <ArrowRight size={17} aria-hidden="true" />
              </Button>
            </header>
            <div>
              {voiceCatalog.map((item) => (
                <Button theme="borderless" type="tertiary"

                  key={item.id}
                  aria-pressed={voice === item.id}
                  onClick={() => previewVoice(item)}
                >
                  <img src={`/moma_5.12.0_estack/assets/model-${item.icon}.jpg`} alt="" />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.desc}</small>
                  </span>
                  <Play size={15} aria-hidden="true" />
                </Button>
              ))}
            </div>
          </section>
        )}
        {error && (
          <p role="status" className="pg-feedback">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="pg-notice">
            {notice}
          </p>
        )}
        {messages.length > 0 && (
          <p className="pg-disclaimer">
            AI 生成内容仅供参考。Enter 发送，Shift + Enter 换行。
          </p>
        )}
      </div>
      {kind === "text" && (
        <Modal visible={settingsOpen} title={model+' 模型设置'} width="min(520px, calc(100vw - 24px))"
          onCancel={() => setSettingsOpen(false)} footer={null}>
          <form className="pg-semi-settings" onSubmit={saveModelSettings}>
            <label className="pg-system-field">
              <span>
                system <CircleHelp size={14} aria-hidden="true" />
              </span>
              <TextArea
                aria-label="System Prompt"
                value={settingsDraft.systemPrompt}
                onChange={(next) =>
                  setSettingsDraft((value) => ({
                    ...value,
                    systemPrompt: next,
                  }))
                }
                placeholder="系统人设，例如‘你是一个 AI 助手’。"
              />
            </label>
            <label className="pg-setting-range">
              <span>
                top_p <CircleHelp size={14} aria-hidden="true" />
              </span>
              <div>
                <Slider aria-label="Top P" min={0} max={1} step={0.05} value={Number(settingsDraft.topP)} onChange={next =>
                    setSettingsDraft((value) => ({
                      ...value,
                      topP: String(next),
                    }))} />
                <output>{settingsDraft.topP}</output>
              </div>
            </label>
            <div className="pg-stop-setting">
              <div>
                <span>
                  stop <CircleHelp size={14} aria-hidden="true" />
                </span>
                <Button theme="borderless" type="tertiary"

                  aria-label="添加停止词"
                  onClick={() =>
                    setSettingsDraft((value) => ({ ...value, showStop: true }))
                  }
                >
                  <Plus size={17} aria-hidden="true" />
                </Button>
              </div>
              {settingsDraft.showStop && (
                <div>
                  <Input
                    aria-label="停止词"
                    value={settingsDraft.stop}
                    onChange={(next) =>
                      setSettingsDraft((value) => ({
                        ...value,
                        stop: next,
                      }))
                    }
                    placeholder="输入停止序列"
                  />
                  <Button theme="borderless" type="tertiary"

                    aria-label="移除停止词"
                    onClick={() =>
                      setSettingsDraft((value) => ({
                        ...value,
                        stop: "",
                        showStop: false,
                      }))
                    }
                  >
                    <X size={16} aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
            <label className="pg-setting-range">
              <span>
                temperature <CircleHelp size={14} aria-hidden="true" />
              </span>
              <div>
                <Slider aria-label="Temperature" min={0} max={2} step={0.1} value={Number(settingsDraft.temperature)} onChange={next =>
                    setSettingsDraft((value) => ({
                      ...value,
                      temperature: String(next),
                    }))} />
                <output>{settingsDraft.temperature}</output>
              </div>
            </label>
            <label className="pg-setting-range">
              <span>
                thinking_budget <CircleHelp size={14} aria-hidden="true" />
              </span>
              <div>
                <Slider aria-label="Thinking Budget" min={0} max={32000} step={1000} value={Number(settingsDraft.thinkingBudget)} onChange={next =>
                    setSettingsDraft((value) => ({
                      ...value,
                      thinkingBudget: String(next),
                    }))} />
                <output>{settingsDraft.thinkingBudget}</output>
              </div>
            </label>
            <footer>
              <Button theme="borderless" type="tertiary"  onClick={() => setSettingsOpen(false)}>
                取消
              </Button>
              <Button htmlType="submit" theme="solid" >保存</Button>
            </footer>
          </form>
        </Modal>
      )}
      <Modal visible={newDialog} title="开始新对话？" width="min(440px, calc(100vw - 24px))"
        okText="确认新建" cancelText="取消" onCancel={() => setNewDialog(false)} onOk={confirmConversation}>
        <p>{busy ? "当前回复仍在生成。新建后将停止生成并清空当前内容。" : "新建后将清空当前对话和未发送的内容。"}</p>
      </Modal>
    </section>
  );
}
