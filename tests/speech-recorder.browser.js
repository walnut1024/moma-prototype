// Run in the local voice-recognition page via DevTools Runtime.evaluate.
// Uses synthetic audio and the real MediaRecorder; never accesses a microphone.
(async () => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const button = (name) => document.querySelector(`button[aria-label="${name}"]`);
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  const tone = context.createOscillator();
  const gain = context.createGain();
  tone.connect(gain).connect(destination);
  tone.start();
  await context.resume();
  const original = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async () => destination.stream;
  const pulse = setInterval(() => { gain.gain.value = 0.05 + Math.abs(Math.sin(context.currentTime * 3)) * 0.3; }, 80);
  window.__speechQA = { state: "recording" };
  try {
    button("开始录音").click();
    await wait(500);
    assert(button("停止录音"), "recording state missing");
    assert(button("开始识别").disabled, "recognition enabled during recording");
    await wait(61000);
    assert(!button("停止录音"), "recording exceeded 60-second limit");
    assert(destination.stream.getTracks().every((track) => track.readyState === "ended"), "microphone tracks not released");
    assert(button("播放录音"), "completed playback control missing");
    assert(!button("开始识别").disabled, "recognition remains disabled");
    const audio = document.querySelector('.sr-recorder audio');
    assert(audio?.src.startsWith('blob:'), "recorded Blob missing");
    button("播放录音").click();
    await wait(1200);
    assert(!audio.paused && audio.currentTime > 0, "playback did not advance");
    button("暂停试听").click();
    assert(audio.paused, "pause failed");
    window.__speechQA = { state: "passed", checks: ["60-second auto-stop", "tracks released", "real audio decoding", "playback", "pause", "recognition enabled"] };
  } catch (error) {
    window.__speechQA = { state: "failed", message: error.message };
  } finally {
    clearInterval(pulse);
    navigator.mediaDevices.getUserMedia = original;
    destination.stream.getTracks().forEach((track) => track.stop());
    await context.close();
  }
})();
