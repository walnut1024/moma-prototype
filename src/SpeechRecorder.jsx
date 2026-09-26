import { useEffect, useRef, useState } from "react";
import { Check, Mic, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";

const clock = (value) => {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

export default function SpeechRecorder({ file, url, recording, requesting, seconds, stream, onStart, onStop, onRemove, disabled }) {
  const audio = useRef(null);
  const canvas = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(seconds);
  const [peaks, setPeaks] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setDuration(seconds);
    setPeaks([]);
    setError("");
    if (!file) return;
    let cancelled = false;
    const context = new AudioContext();
    file.arrayBuffer().then((data) => context.decodeAudioData(data)).then((buffer) => {
      if (cancelled) return;
      setDuration(buffer.duration);
      const samples = buffer.getChannelData(0);
      const step = Math.max(1, Math.floor(samples.length / 64));
      const values = Array.from({ length: 64 }, (_, index) => {
        let peak = 0;
        for (let i = index * step; i < Math.min((index + 1) * step, samples.length); i++) peak = Math.max(peak, Math.abs(samples[i]));
        return peak;
      });
      const maximum = Math.max(0.01, ...values);
      setPeaks(values.map((value) => value / maximum));
    }).catch(() => {
      if (!cancelled) setError("暂时无法绘制声波，仍可尝试试听。");
    }).finally(() => { if (context.state !== "closed") context.close(); });
    return () => { cancelled = true; if (context.state !== "closed") context.close(); };
  }, [file]);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element.getContext("2d");
    let frame;
    let context;
    let analyser;
    if (recording && stream) {
      context = new AudioContext();
      analyser = context.createAnalyser();
      analyser.fftSize = 128;
      context.createMediaStreamSource(stream).connect(analyser);
    }
    const live = new Uint8Array(64);
    const draw = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      element.width = width * ratio;
      element.height = height * ratio;
      ctx.scale(ratio, ratio);
      if (analyser) analyser.getByteTimeDomainData(live);
      const values = analyser ? Array.from(live, (value) => Math.min(1, Math.abs(value - 128) / 40)) : peaks;
      const count = values.length || 64;
      const gap = width / count;
      for (let i = 0; i < count; i++) {
        const bar = Math.max(3, (values[i] || 0) * (height - 8));
        ctx.strokeStyle = recording ? "#ef6672" : i / count < position / (duration || 1) ? "#2f64ff" : file ? "#9bb3ff" : "#d9e1ef";
        ctx.lineWidth = Math.max(2, Math.min(4, gap * 0.48));
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(i * gap + gap / 2, (height - bar) / 2);
        ctx.lineTo(i * gap + gap / 2, (height + bar) / 2);
        ctx.stroke();
      }
    };
    draw();
    const animate = () => { draw(); frame = requestAnimationFrame(animate); };
    if (analyser) frame = requestAnimationFrame(animate);
    const resize = new ResizeObserver(draw);
    resize.observe(element);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); context?.close(); };
  }, [peaks, position, duration, recording, stream, file]);

  async function togglePlayback() {
    if (playing) audio.current.pause();
    else {
      try { await audio.current.play(); setError(""); }
      catch { setError("音频无法播放，请重新录音。"); }
    }
  }

  const status = requesting ? "正在请求麦克风权限" : recording ? "正在录音" : file ? "录音完成" : "点击开始录音";
  return (
    <div className={`sr-recorder${recording ? " is-recording" : ""}`}>
      <div className="sr-status" role="status">{file && <Check size={15} aria-hidden="true" />}{status}</div>
      <div className="sr-player">
        <button type="button" className="sr-play" disabled={disabled || requesting} onClick={recording ? onStop : file ? togglePlayback : onStart} aria-label={recording ? "停止录音" : file ? playing ? "暂停试听" : "播放录音" : "开始录音"}>
          {recording ? <Square size={25} fill="currentColor" /> : file ? playing ? <Pause size={29} fill="currentColor" /> : <Play size={29} fill="currentColor" /> : <Mic size={31} />}
        </button>
        <div className="sr-track">
          <canvas ref={canvas} aria-hidden="true" />
          {file && <input className="sr-seek" type="range" aria-label="试听进度" min="0" max={duration || 1} step="0.1" value={position} onChange={(event) => { const next = Number(event.target.value); audio.current.currentTime = next; setPosition(next); }} />}
          <div className="sr-time">{file ? `${clock(position)} / ${clock(duration)}` : `${clock(recording ? seconds : 0)} / 01:00`}</div>
        </div>
      </div>
      <div className="sr-actions">
        {file ? <><button type="button" disabled={disabled} onClick={onStart}><RotateCcw size={18} />重新录音</button><button type="button" disabled={disabled} onClick={onRemove}><Trash2 size={18} />删除</button></> : <span>{recording ? "点击停止按钮结束录音，60 秒后自动停止" : "允许使用麦克风后即可录音，最长 60 秒"}</span>}
      </div>
      {url && <audio ref={audio} src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)} onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }} />}
      {error && <p className="sr-error" role="status">{error}</p>}
    </div>
  );
}
