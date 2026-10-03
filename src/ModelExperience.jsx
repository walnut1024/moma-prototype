import { useEffect, useRef, useState } from "react";
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
import ModelSelectDialog from "./ModelSelectDialog";
import SpeechRecorder from "./SpeechRecorder";
import "./experience.css";
import "./experience-refinements.css";

const modelCatalog = {
  text: [
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
  ],
  image: [
    {
      name: "Qwen/Qwen-Image-3.0-Pro",
      icon: 4,
      type: "image",
      subscribed: true,
      billing: "Token Plan",
    },
    {
      name: "ByteDance/Seedream-5.0",
      icon: 5,
      type: "image",
      subscribed: true,
      billing: "按量计费",
    },
    {
      name: "Wan/Wan2.6-Image",
      icon: 2,
      type: "image",
      subscribed: false,
      billing: "按量计费",
    },
  ],
  video: [
    {
      name: "Qwen/Wan2.7-R2V",
      icon: 4,
      type: "video",
      subscribed: true,
      billing: "Token Plan",
      desc: "最多 5 个图片或视频参考，支持音色参考与多主体一致性。",
    },
    {
      name: "Qwen/Wan3.0-Video-Prime",
      icon: 4,
      type: "video",
      subscribed: true,
      billing: "按量计费",
      desc: "支持文生、首尾帧及全能参考，兼顾速度与画面表现。",
    },
    {
      name: "MiniMax/MiniMax-Hailuo-2.3",
      icon: 5,
      type: "video",
      subscribed: false,
      billing: "按量计费",
      desc: "支持文生视频、首帧图生视频和首尾帧控制。",
    },
  ],
  asr: [
    {
      name: "Alibaba/SenseVoice",
      icon: 6,
      type: "voice",
      subscribed: true,
      billing: "按量计费",
    },
  ],
  tts: [
    {
      name: "Alibaba/CosyVoice",
      icon: 6,
      type: "voice",
      subscribed: true,
      billing: "Token Plan",
    },
  ],
};

const voiceCatalog = [
  { id: "longxiaochun_v2", name: "龙小淳", desc: "温柔知性女声", icon: 1 },
  { id: "longcheng_v2", name: "龙橙", desc: "沉稳磁性男声", icon: 2 },
  { id: "longhua_v2", name: "龙华", desc: "新闻主播音色", icon: 3 },
  { id: "longshu_v2", name: "龙书", desc: "自然叙事男声", icon: 4 },
  { id: "longxiaobai_v2", name: "龙小白", desc: "活泼元气女声", icon: 5 },
  { id: "longan_v2", name: "龙安", desc: "专业客服女声", icon: 6 },
  { id: "longyue_v2", name: "龙悦", desc: "清新甜美女声", icon: 1 },
  { id: "longlao_v2", name: "龙老", desc: "浑厚评书男声", icon: 2 },
];

const videoProfiles = {
  "Qwen/Wan2.7-R2V": {
    modes: ["参考生视频"],
    resolutions: ["1080P", "720P"],
    aspects: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    durations: ["5秒", "10秒"],
    accept: "image/*,video/*,audio/*",
    add: "添加图片、视频或音频参考",
    sound: true,
  },
  "Qwen/Wan3.0-Video-Prime": {
    modes: ["全能参考", "文生视频", "首尾帧"],
    resolutions: ["1080P", "720P", "480P"],
    aspects: ["智能比例", "16:9", "9:16", "1:1"],
    durations: ["5秒", "10秒", "15秒", "30秒"],
    accept: "image/*,video/*,audio/*",
    add: "添加参考素材",
    sound: true,
  },
  "MiniMax/MiniMax-Hailuo-2.3": {
    modes: ["文生视频", "首帧图生视频", "首尾帧生视频"],
    resolutions: ["1080P", "768P"],
    aspects: ["16:9", "9:16"],
    durations: ["6秒", "10秒"],
    accept: "image/*",
    add: "添加首帧或尾帧图片",
    sound: false,
  },
};

const promptCatalog = {
  text: [
    {
      label: "项目总结报告",
      prompt:
        "请帮我撰写一份专业的项目总结报告。报告需包含项目背景与目标、实施范围、关键里程碑、主要成果与量化数据、团队协作情况、遇到的问题及解决方案、经验复盘和下一阶段计划；语言正式、逻辑清晰，使用分级标题和要点列表，适合向管理层汇报。",
    },
    {
      label: "分析图片信息",
      prompt:
        "请全面分析我上传的图片：先概括画面主题与主要内容，再识别人物、物体、场景、文字、数据和关键细节，说明各元素之间的关系；如包含图表，请提取核心指标、趋势与异常；最后给出基于画面证据的结论，并明确标注无法确认的信息。",
    },
    {
      label: "总结视频内容",
      prompt:
        "请总结我上传的视频内容：按时间顺序梳理主要情节或观点，提取关键人物、事件、数据和结论，标注重要时间点；区分事实、观点和推测，并用一段摘要加分点列表呈现，最后给出适合快速阅读的三条核心要点。",
    },
  ],
  image: [
    {
      label: "未来都市",
      prompt:
        "生成一张未来城市夜景海报：雨后的高空视角，玻璃摩天楼与空中轨道层层延伸，霓虹蓝紫灯光倒映在湿润街道，远处有飞行器穿过薄雾，电影级广角构图，体积光，自然景深，画面层次丰富，细节清晰，8K 商业海报质感。",
    },
    {
      label: "科技主视觉",
      prompt:
        "设计一张极简科技产品主视觉：银白色智能终端悬浮在纯净渐变空间中，柔和侧光勾勒金属边缘，少量蓝色光带表现数据流动，大面积留白，居中构图，高端发布会视觉风格，真实材质、精细阴影和清晰产品轮廓。",
    },
    {
      label: "水墨山水",
      prompt:
        "绘制一幅水墨风格山水插画：层叠远山隐入晨雾，一叶木舟划过平静江面，岸边松树与古亭若隐若现，传统宣纸肌理，浓淡墨色自然晕染，局部淡青设色，构图疏密有致，留白克制，呈现宋代山水画的宁静意境。",
    },
    {
      label: "美食广告",
      prompt:
        "创作一张高端中式餐饮广告：深色石材桌面上摆放一碗热气升腾的牛肉面，汤汁油亮，牛肉纹理和香菜细节清晰，暖金色侧逆光穿过蒸汽，背景虚化并保留标题留白，近景商业摄影，真实食物质感，诱人但不过度饱和。",
    },
    {
      label: "角色设定",
      prompt:
        "绘制一张东方幻想角色设定图：年轻女性游侠身穿深青与银灰相间的轻甲，腰间佩剑，衣料、金属和皮革材质清晰；画面同时展示正面全身、侧面轮廓和面部特写，浅灰纯色背景，专业游戏概念设计稿，比例准确，细节统一。",
    },
  ],
  video: [
    {
      label: "云海日出",
      prompt:
        "清晨云海之上，镜头从贴近云层的低空缓慢抬升，金色日光穿透薄雾照亮连绵山峰，云层随风流动，远处飞鸟掠过画面，电影级航拍，体积光，自然景深，色彩由冷蓝渐变为暖金，镜头运动平稳连贯。",
    },
    {
      label: "产品环绕",
      prompt:
        "极简黑色智能终端置于深色展台中央，镜头沿顺时针方向缓慢环绕一周，冷白轮廓光扫过金属边缘，屏幕逐渐点亮并出现蓝色数据流，背景保持干净，商业广告质感，材质真实，动作稳定，产品始终位于画面视觉中心。",
    },
    {
      label: "城市延时",
      prompt:
        "雨后城市夜景延时摄影，高楼灯光依次亮起，车流在湿润街道形成红蓝光轨，云层快速掠过天空，镜头固定在高处广角机位，画面从蓝调时刻自然过渡到深夜，曝光平滑，建筑结构稳定，呈现真实电影摄影质感。",
    },
    {
      label: "人物漫步",
      prompt:
        "一名穿米色风衣的年轻人沿秋日林荫道向镜头缓慢走来，微风吹动衣摆与落叶，镜头以中景稳定后退跟拍，午后柔光从树隙洒下，肤色自然，背景有浅景深和轻微散景，动作连贯真实，电影叙事感。",
    },
    {
      label: "微距花开",
      prompt:
        "一朵白色百合从花苞缓慢绽放的微距延时镜头，露珠沿花瓣滑落，清晨阳光从侧后方逐渐增强，背景为柔和绿色散景，镜头固定且焦点稳定，花瓣运动自然连续，细节锐利，真实生态纪录片质感。",
    },
  ],
};

function ModelPicker({ model, options, onChange, speech = false }) {
  const [open, setOpen] = useState(false);
  const selected =
    options.find((option) => option.name === model) || options[0];
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
        {speech && <Volume2 size={18} aria-hidden="true" />}
        <span>{speech ? selected.name.split("/").reverse().join(" · ") : selected.name}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <ModelSelectDialog
        open={open}
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
  onCompare,
}) {
  const [mode, setMode] = useState("语音识别");
  const [model, setModel] = useState(
    kind === "text"
      ? "DeepSeek/DeepSeek-V4-Pro"
      : kind === "image"
        ? "Qwen/Qwen-Image-3.0-Pro"
        : kind === "video"
          ? "Qwen/Wan2.7-R2V"
          : "Alibaba/SenseVoice",
  );
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [temperature, setTemperature] = useState("0.7");
  const [topP, setTopP] = useState(kind === "text" ? "0.8" : "0.9");
  const [systemPrompt, setSystemPrompt] = useState("");
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
  const [voice, setVoice] = useState("longxiaochun_v2");
  const [format, setFormat] = useState("mp3");
  const [language, setLanguage] = useState("auto");
  const [removeFillers, setRemoveFillers] = useState(false);
  const [imageSize, setImageSize] = useState("1024 × 1024");
  const [imageCount, setImageCount] = useState("1");
  const [videoMode, setVideoMode] = useState("全能模式");
  const [resolution, setResolution] = useState("1080P");
  const [aspect, setAspect] = useState("16:9");
  const [duration, setDuration] = useState("5秒");
  const [sound, setSound] = useState(true);
  const [previewing, setPreviewing] = useState(-1);
  const [newDialog, setNewDialog] = useState(false);
  const [notice, setNotice] = useState("");
  const [ratings, setRatings] = useState({});
  const timer = useRef();
  const end = useRef();
  const input = useRef();
  const dialog = useRef();
  const settingsDialog = useRef();
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
  const models = modelCatalog[kind === "voice" ? (asr ? "asr" : "tts") : kind];
  const videoProfile = videoProfiles[model];
  const prompts = promptCatalog[kind] || [];
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
      clearTimeout(timer.current);
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
  useEffect(() => {
    if (newDialog) dialog.current?.showModal();
    else dialog.current?.close();
  }, [newDialog]);
  useEffect(() => {
    if (settingsOpen && !settingsDialog.current?.open)
      settingsDialog.current?.showModal();
    else if (!settingsOpen && settingsDialog.current?.open)
      settingsDialog.current.close();
  }, [settingsOpen]);
  function reset() {
    clearTimeout(timer.current);
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
      const profile = videoProfiles[value];
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
    setNotice(`已切换至 ${value}，并应用推荐参数`);
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
    if (busy || !model || (asr && !file) || (!asr && !text.trim() && !file))
      return;
    setError("");
    setNotice("");
    setBusy(true);
    const message = {
      text: text.trim() || (kind === "text" && file ? "请分析这个文件" : ""),
      file: file?.name,
      model,
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
    // ponytail: local mock response only; replace with model API when integration is requested.
    timer.current = setTimeout(() => {
      setMessages((items) => [
        ...items,
        {
          ...message,
          answer: visualGeneration
            ? ""
            : asr
              ? "这是一段语音转写的示例结果。正式接入模型后，这里将显示所录音频的实际识别内容。"
              : tts
                ? message.text
                : "已收到你的体验请求。",
          points:
            visualGeneration || asr || tts
              ? null
              : [
                  {
                    title: "明确任务目标",
                    body: "说明希望解决的问题、使用场景，以及最终要获得的结果。",
                  },
                  {
                    title: "补充必要背景",
                    body: "提供相关上下文、已有材料和限制条件，回答会更贴合实际需求。",
                  },
                  {
                    title: "约定输出格式",
                    body: "注明篇幅、语气或结构要求，可以减少后续修改成本。",
                  },
                ],
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
          message.answer,
          "",
          "### 建议从以下三个方面着手",
          "",
          ...message.points.map(
            (point, index) =>
              `${index + 1}. **${point.title}**\n   ${point.body}`,
          ),
          "",
          "> 本页面为本地原型演示，不代表真实模型输出。",
        ].join("\n")
      : message.answer;
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
    const utterance = new SpeechSynthesisUtterance(message.answer);
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
        ? "文本生成模型用于理解和生成文字；多模态模型还可以理解图片、视频等内容。"
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
      <div className="pg-heading">
        <div>
          <h1>{label}</h1>
          <p>{headingCopy}</p>
        </div>
        <div className="pg-heading-actions">
          {kind === "text" && (
            <button
              type="button"
              className="pg-compare-entry"
              onClick={onCompare}
            >
              模型对比
            </button>
          )}
          <button type="button" onClick={createConversation}>
            新建对话
          </button>
        </div>
      </div>
      {onKindChange && (
        <div className="pg-tabs" aria-label="视觉体验模式">
          {[
            ["image", "图片生成"],
            ["video", "视频生成"],
          ].map(([value, text]) => (
            <button
              type="button"
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
            </button>
          ))}
        </div>
      )}
      {kind === "voice" && (
        <div className="pg-tabs" aria-label="语音体验模式">
          {["语音识别", "语音合成"].map((value) => (
            <button
              type="button"
              aria-pressed={mode === value}
              key={value}
              onClick={() => {
                reset();
                setMode(value);
                setModel(
                  value === "语音识别"
                    ? "Alibaba/SenseVoice"
                    : "Alibaba/CosyVoice",
                );
              }}
            >
              {value === "语音识别" ? (
                <Mic size={16} aria-hidden="true" />
              ) : (
                <Volume2 size={16} aria-hidden="true" />
              )}
              {value}
            </button>
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
                          演示结果
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
                      {Array.from(
                        {
                          length:
                            kind === "image" ? Number(message.imageCount) : 1,
                        },
                        (_, resultIndex) => (
                          <figure key={resultIndex}>
                            <img
                              src={
                                kind === "image"
                                  ? "/assets/forthBg-982e3d97.png"
                                  : "/assets/secondBg-c502c3d3.png"
                              }
                              alt={
                                kind === "image"
                                  ? `生成图片 ${resultIndex + 1}`
                                  : "生成视频封面"
                              }
                            />
                            {kind === "video" && (
                              <button
                                type="button"
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
                              </button>
                            )}
                            <figcaption>
                              <span>
                                {kind === "image"
                                  ? `${message.imageSize} · 图片 ${resultIndex + 1}`
                                  : `${message.videoMode} · ${message.sound ? "包含声音" : "静音"}`}
                              </span>
                              <a
                                href={
                                  kind === "image"
                                    ? "/assets/forthBg-982e3d97.png"
                                    : "/assets/secondBg-c502c3d3.png"
                                }
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
                        <p>{message.answer}</p>
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
                            <p className="pg-answer-note">
                              本页面为本地原型演示，不代表真实模型输出。
                            </p>
                          </>
                        )}
                      </div>
                      <div className="pg-answer-actions" aria-label="回答操作">
                        <button
                          type="button"
                          title="复制为 Markdown"
                          onClick={() => copyResponse(message, true)}
                        >
                          复制 MD
                        </button>
                        <button
                          type="button"
                          title="复制纯文本"
                          onClick={() => copyResponse(message)}
                        >
                          复制
                        </button>
                        <button
                          type="button"
                          aria-pressed={ratings[index] === "up"}
                          onClick={() =>
                            setRatings((values) => ({
                              ...values,
                              [index]: values[index] === "up" ? "" : "up",
                            }))
                          }
                        >
                          有帮助
                        </button>
                        <button
                          type="button"
                          aria-pressed={ratings[index] === "down"}
                          onClick={() =>
                            setRatings((values) => ({
                              ...values,
                              [index]: values[index] === "down" ? "" : "down",
                            }))
                          }
                        >
                          没帮助
                        </button>
                        <button
                          type="button"
                          aria-label="试听（浏览器语音）"
                          onClick={() => speak(message)}
                        >
                          朗读
                        </button>
                        {message.mode === "语音合成" && kind === "voice" && (
                          <button
                            type="button"
                            onClick={() => window.speechSynthesis?.cancel()}
                          >
                            停止播放
                          </button>
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
          <div className="pg-prompts" aria-label="快捷示例">
            <div>
              {prompts.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  onClick={() => setText(item.prompt)}
                >
                  <span>{item.label}</span>
                  <ArrowDownRight size={14} aria-hidden="true" />
                </button>
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
              <button type="button" onClick={() => setFile(null)}>
                移除
              </button>
            </div>
          )}
          {!asr && (
            <textarea
              aria-label="体验输入"
              maxLength={6000}
              value={text}
              onChange={(e) => setText(e.target.value)}
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
              <button
                className="pg-settings-trigger"
                type="button"
                aria-label="参数设置"
                title={`${topP} · ${temperature} · ${thinkingBudget}`}
                onClick={openModelSettings}
              >
                <SlidersHorizontal size={20} aria-hidden="true" />
              </button>
            ) : (
              <details className="pg-settings">
                <summary aria-label="参数设置" title="参数设置">
                  <SlidersHorizontal size={20} aria-hidden="true" />
                  {asr && <span>参数设置</span>}
                </summary>
                <div className="pg-settings-panel">
                  <header>
                    <div>
                      <strong>生成参数</strong>
                      <small>
                        {kind === "image"
                          ? "对应图片生成接口"
                          : kind === "video"
                            ? "对应视频生成接口"
                            : tts
                              ? "对应 CosyVoice 合成接口"
                              : asr
                                ? "对应 SenseVoice 识别接口"
                                : "调整模型的输出风格"}
                      </small>
                    </div>
                  </header>
                  {kind === "image" ? (
                    <>
                      <div className="pg-api-grid">
                        <label>
                          <span>图片尺寸</span>
                          <select
                            aria-label="图片尺寸"
                            value={imageSize}
                            onChange={(e) => setImageSize(e.target.value)}
                          >
                            <option>1024 × 1024</option>
                            <option>1280 × 720</option>
                            <option>720 × 1280</option>
                          </select>
                          <small>size</small>
                        </label>
                        <label>
                          <span>生成数量</span>
                          <select
                            aria-label="生成数量"
                            value={imageCount}
                            onChange={(e) => setImageCount(e.target.value)}
                          >
                            <option value="1">1 张</option>
                            <option value="2">2 张</option>
                            <option value="4">4 张</option>
                          </select>
                          <small>n</small>
                        </label>
                      </div>
                    </>
                  ) : kind === "video" ? (
                    <>
                      <div className="pg-api-grid">
                        <label>
                          <span>生成模式</span>
                          <select
                            aria-label="生成模式"
                            value={videoMode}
                            onChange={(e) => setVideoMode(e.target.value)}
                          >
                            <option>全能模式</option>
                            <option>首帧生视频</option>
                            <option>参考生视频</option>
                          </select>
                          <small>mode</small>
                        </label>
                        <label>
                          <span>分辨率</span>
                          <select
                            aria-label="视频分辨率"
                            value={resolution}
                            onChange={(e) => setResolution(e.target.value)}
                          >
                            <option>1080P</option>
                            <option>720P</option>
                          </select>
                          <small>resolution</small>
                        </label>
                        <label>
                          <span>画面比例</span>
                          <select
                            aria-label="视频比例"
                            value={aspect}
                            onChange={(e) => setAspect(e.target.value)}
                          >
                            <option>16:9</option>
                            <option>9:16</option>
                            <option>1:1</option>
                          </select>
                          <small>ratio</small>
                        </label>
                        <label>
                          <span>视频时长</span>
                          <select
                            aria-label="视频时长"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                          >
                            <option>5秒</option>
                            <option>10秒</option>
                          </select>
                          <small>duration</small>
                        </label>
                      </div>
                      <label className="pg-check">
                        <input
                          aria-label="生成声音"
                          type="checkbox"
                          checked={sound}
                          onChange={(e) => setSound(e.target.checked)}
                        />
                        <span>
                          <b>生成声音</b>
                          <small>audio_enabled</small>
                        </span>
                      </label>
                      <p className="pg-param-tip">
                        可添加一张参考图；本地原型不会调用线上模型。
                      </p>
                    </>
                  ) : tts ? (
                    <>
                      <div className="pg-api-grid">
                        <label>
                          <span>发音人</span>
                          <select
                            aria-label="发音人"
                            value={voice}
                            onChange={(e) => setVoice(e.target.value)}
                          >
                            <option value="longxiaochun_v2">龙小淳</option>
                            <option value="longcheng_v2">龙橙</option>
                            <option value="longhua_v2">龙华</option>
                            <option value="longshu_v2">龙书</option>
                          </select>
                          <small>voice</small>
                        </label>
                        <label>
                          <span>输出格式</span>
                          <select
                            aria-label="输出格式"
                            value={format}
                            onChange={(e) => setFormat(e.target.value)}
                          >
                            <option value="mp3">MP3</option>
                            <option value="wav">WAV</option>
                            <option value="pcm">PCM</option>
                          </select>
                          <small>format</small>
                        </label>
                      </div>
                      <label className="pg-param">
                        <span>
                          <b>语速</b>
                          <output>{speed} 倍</output>
                        </span>
                        <small>rate · 0.5–2.0</small>
                        <input
                          aria-label="语速"
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.1"
                          value={speed}
                          onChange={(e) => setSpeed(e.target.value)}
                        />
                      </label>
                      <label className="pg-param">
                        <span>
                          <b>音调</b>
                          <output>{pitch} 倍</output>
                        </span>
                        <small>pitch · 0.5–2.0</small>
                        <input
                          aria-label="音调"
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.1"
                          value={pitch}
                          onChange={(e) => setPitch(e.target.value)}
                        />
                      </label>
                      <label className="pg-param">
                        <span>
                          <b>音量</b>
                          <output>{volume}</output>
                        </span>
                        <small>volume · 0–100</small>
                        <input
                          aria-label="音量"
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={volume}
                          onChange={(e) => setVolume(e.target.value)}
                        />
                      </label>
                    </>
                  ) : asr ? (
                    <>
                      <div className="pg-api-grid pg-api-grid-single">
                        <label>
                          <span>识别语种</span>
                          <select
                            aria-label="识别语种"
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                          >
                            <option value="auto">自动检测</option>
                            <option value="zh">中文</option>
                            <option value="en">英语</option>
                            <option value="yue">粤语</option>
                            <option value="ja">日语</option>
                            <option value="ko">韩语</option>
                          </select>
                          <small>language_hints</small>
                        </label>
                      </div>
                      <label className="pg-check">
                        <input
                          aria-label="过滤语气词"
                          type="checkbox"
                          checked={removeFillers}
                          onChange={(e) => setRemoveFillers(e.target.checked)}
                        />
                        <span>
                          <b>过滤语气词</b>
                          <small>disfluency_removal_enabled</small>
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
                        <input
                          aria-label="Temperature"
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={temperature}
                          onChange={(e) => setTemperature(e.target.value)}
                        />
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
                        <input
                          aria-label="Top P"
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={topP}
                          onChange={(e) => setTopP(e.target.value)}
                        />
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
              </details>
            )}
            {kind === "text" && (
              <div className="pg-text-tools">
                <button
                  type="button"
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
                </button>
              </div>
            )}
            {kind === "video" && (
              <div className="pg-video-options" aria-label="视频生成选项">
                <label>
                  <span>模式</span>
                  <select
                    aria-label="生成模式"
                    value={videoMode}
                    onChange={(e) => setVideoMode(e.target.value)}
                  >
                    {videoProfile.modes.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>清晰度</span>
                  <select
                    aria-label="视频分辨率"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                  >
                    {videoProfile.resolutions.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>比例</span>
                  <select
                    aria-label="视频比例"
                    value={aspect}
                    onChange={(e) => setAspect(e.target.value)}
                  >
                    {videoProfile.aspects.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>时长</span>
                  <select
                    aria-label="视频时长"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  >
                    {videoProfile.durations.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                {videoProfile.sound && (
                  <button
                    type="button"
                    aria-pressed={sound}
                    onClick={() => setSound((value) => !value)}
                  >
                    <Volume2 size={16} aria-hidden="true" />
                    声音
                  </button>
                )}
              </div>
            )}
            {upload && !asr && (
              <button
                className="pg-add pg-add-icon"
                type="button"
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
              </button>
            )}
            <div className="pg-primary-actions">
              <span className="pg-count">
                {asr ? "" : `${text.length}/6000`}
              </span>
              <ModelPicker
                model={model}
                speech={asr}
                options={models}
                onChange={changeModel}
              />
              <button
                className="pg-send"
                type="submit"
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
                  busy || (asr && !file) || (!asr && !text.trim() && !file)
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
              </button>
            </div>
          </div>
        </form>
        <p className="pg-quota-note">
          {visualGeneration
            ? "AI 生成内容可能存在偏差，使用前请自行核实。使用本服务会消耗已订购额度，具体以用量记录为准。"
            : asr
              ? "识别结果为演示内容。"
              : "体验产生的用量将从您已订购的模型额度中扣除，具体以用量记录为准。"}
        </p>
        {tts && !messages.length && (
          <section
            className="pg-voice-library"
            aria-labelledby="voice-library-title"
          >
            <header>
              <h3 id="voice-library-title">音色库</h3>
              <button type="button">
                查看更多 <ArrowRight size={17} aria-hidden="true" />
              </button>
            </header>
            <div>
              {voiceCatalog.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={voice === item.id}
                  onClick={() => previewVoice(item)}
                >
                  <img src={`/assets/model-${item.icon}.jpg`} alt="" />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.desc}</small>
                  </span>
                  <Play size={15} aria-hidden="true" />
                </button>
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
            内容为本地演示，请注意甄别。Enter 发送，Shift + Enter 换行。
          </p>
        )}
      </div>
      {kind === "text" && (
        <dialog
          ref={settingsDialog}
          className="pg-settings-dialog"
          aria-label="模型设置"
          onCancel={(event) => {
            event.preventDefault();
            setSettingsOpen(false);
          }}
        >
          <form onSubmit={saveModelSettings}>
            <header>
              <strong>{model} 模型设置</strong>
              <button
                type="button"
                aria-label="关闭模型设置"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <label className="pg-system-field">
              <span>
                system <CircleHelp size={14} aria-hidden="true" />
              </span>
              <textarea
                aria-label="System Prompt"
                value={settingsDraft.systemPrompt}
                onChange={(e) =>
                  setSettingsDraft((value) => ({
                    ...value,
                    systemPrompt: e.target.value,
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
                <input
                  aria-label="Top P"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settingsDraft.topP}
                  onChange={(e) =>
                    setSettingsDraft((value) => ({
                      ...value,
                      topP: e.target.value,
                    }))
                  }
                />
                <output>{settingsDraft.topP}</output>
              </div>
            </label>
            <div className="pg-stop-setting">
              <div>
                <span>
                  stop <CircleHelp size={14} aria-hidden="true" />
                </span>
                <button
                  type="button"
                  aria-label="添加停止词"
                  onClick={() =>
                    setSettingsDraft((value) => ({ ...value, showStop: true }))
                  }
                >
                  <Plus size={17} aria-hidden="true" />
                </button>
              </div>
              {settingsDraft.showStop && (
                <div>
                  <input
                    aria-label="停止词"
                    value={settingsDraft.stop}
                    onChange={(e) =>
                      setSettingsDraft((value) => ({
                        ...value,
                        stop: e.target.value,
                      }))
                    }
                    placeholder="输入停止序列"
                  />
                  <button
                    type="button"
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
                  </button>
                </div>
              )}
            </div>
            <label className="pg-setting-range">
              <span>
                temperature <CircleHelp size={14} aria-hidden="true" />
              </span>
              <div>
                <input
                  aria-label="Temperature"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settingsDraft.temperature}
                  onChange={(e) =>
                    setSettingsDraft((value) => ({
                      ...value,
                      temperature: e.target.value,
                    }))
                  }
                />
                <output>{settingsDraft.temperature}</output>
              </div>
            </label>
            <label className="pg-setting-range">
              <span>
                thinking_budget <CircleHelp size={14} aria-hidden="true" />
              </span>
              <div>
                <input
                  aria-label="Thinking Budget"
                  type="range"
                  min="0"
                  max="32000"
                  step="1000"
                  value={settingsDraft.thinkingBudget}
                  onChange={(e) =>
                    setSettingsDraft((value) => ({
                      ...value,
                      thinkingBudget: e.target.value,
                    }))
                  }
                />
                <output>{settingsDraft.thinkingBudget}</output>
              </div>
            </label>
            <footer>
              <button type="button" onClick={() => setSettingsOpen(false)}>
                取消
              </button>
              <button type="submit">保存</button>
            </footer>
          </form>
        </dialog>
      )}
      <dialog
        ref={dialog}
        className="pg-new-dialog"
        onCancel={(event) => {
          event.preventDefault();
          setNewDialog(false);
        }}
      >
        <h2>开始新对话？</h2>
        <p>
          {busy
            ? "当前回复仍在生成。新建后将停止生成并清空当前内容。"
            : "新建后将清空当前对话和未发送的内容。"}
        </p>
        <div>
          <button type="button" onClick={() => setNewDialog(false)}>
            取消
          </button>
          <button type="button" onClick={confirmConversation}>
            确认新建
          </button>
        </div>
      </dialog>
    </section>
  );
}
