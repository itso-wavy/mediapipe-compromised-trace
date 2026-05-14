import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

(function runCompromisedTrace() {
  const {
    addHandSample,
    clamp,
    classifyMediaState,
    createHandTrace,
    smoothAudioLevel,
  } = window.MediaTraceCore;

  const canvas = document.getElementById("traceCanvas");
  const ctx = canvas.getContext("2d");
  const camera = document.getElementById("camera");
  const startButton = document.getElementById("startButton");
  const bootPanel = document.getElementById("bootPanel");
  const deviceError = document.getElementById("deviceError");
  const mediaStatus = document.getElementById("mediaStatus");
  const leftStatus = document.getElementById("leftStatus");
  const rightStatus = document.getElementById("rightStatus");
  const audioMeter = document.getElementById("audioMeter");

  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    trace: createHandTrace(150),
    lastTime: performance.now(),
    handLandmarker: null,
    cameraLive: false,
    micLive: false,
    lastVideoTime: -1,
    analyser: null,
    audioData: null,
    audioLevel: 0,
    glitch: 0,
    gridOffset: 0,
  };

  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  async function startMedia() {
    startButton.disabled = true;
    startButton.textContent = "REQUESTING ACCESS...";
    deviceError.textContent = "";

    const devices = await listInputDevices();
    const videoStream = await requestStream("camera", { video: true });
    const audioStream = await requestStream("mic", { audio: true });

    const videoTracks = videoStream?.getVideoTracks() || [];
    const audioTracks = audioStream?.getAudioTracks() || [];
    state.cameraLive = videoTracks.length > 0;
    state.micLive = audioTracks.length > 0;

    try {
      if (!state.cameraLive && !state.micLive) {
        throw new Error("No camera or microphone device was available");
      }

      if (state.cameraLive) {
        camera.srcObject = new MediaStream(videoTracks);
        await camera.play();
        camera.classList.add("is-active");
        await setupMediaPipe();
      }

      if (state.micLive) setupAudio(audioStream);

      bootPanel.classList.add("is-hidden");
      startButton.textContent = state.cameraLive ? "SIGNAL ARMED" : "MIC ONLY - CAMERA MISSING";
      updateHud();
    } catch (error) {
      console.warn(error);
      startButton.disabled = false;
      startButton.textContent = "NO MEDIA DEVICE - RETRY";
      mediaStatus.textContent = "NO DEVICE";
      mediaStatus.classList.add("warning");
      deviceError.textContent = buildDeviceError(devices);
    }
  }

  async function listInputDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return { cameras: 0, microphones: 0 };
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        cameras: devices.filter((device) => device.kind === "videoinput").length,
        microphones: devices.filter((device) => device.kind === "audioinput").length,
      };
    } catch (error) {
      console.warn("Could not enumerate media devices", error);
      return { cameras: 0, microphones: 0 };
    }
  }

  function buildDeviceError(devices) {
    if (devices.cameras === 0 && devices.microphones === 0) {
      return "No camera or microphone is exposed to this browser session.";
    }
    return `Detected ${devices.cameras} camera(s), ${devices.microphones} microphone(s), but access failed. Check browser permissions.`;
  }

  async function requestStream(kind, constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      console.warn(`${kind} unavailable`, error);
      return null;
    }
  }

  function setupAudio(stream) {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    state.analyser = audioContext.createAnalyser();
    state.analyser.fftSize = 512;
    state.audioData = new Uint8Array(state.analyser.frequencyBinCount);
    source.connect(state.analyser);
  }

  async function setupMediaPipe() {
    if (state.handLandmarker) return;
    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    const options = {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    };

    try {
      state.handLandmarker = await HandLandmarker.createFromOptions(fileset, options);
    } catch (error) {
      console.warn("GPU delegate unavailable, retrying MediaPipe on CPU", error);
      state.handLandmarker = await HandLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: {
          ...options.baseOptions,
          delegate: "CPU",
        },
      });
    }
  }

  function updateHands() {
    if (!state.cameraLive || !state.handLandmarker || camera.readyState < 2) return;
    if (camera.currentTime === state.lastVideoTime) return;
    state.lastVideoTime = camera.currentTime;

    const result = state.handLandmarker.detectForVideo(camera, performance.now());
    const seen = { left: false, right: false };

    for (let i = 0; i < (result.landmarks?.length || 0); i += 1) {
      const landmarks = result.landmarks[i];
      const handedness = result.handednesses?.[i]?.[0]?.categoryName || (i === 0 ? "Left" : "Right");
      const hand = handedness.toLowerCase() === "left" ? "right" : "left";
      const point = palmPoint(landmarks);
      addHandSample(state.trace, hand, point, performance.now());
      seen[hand] = true;
    }

    leftStatus.textContent = seen.left ? "TRACKING" : decayStatus(state.trace.left);
    rightStatus.textContent = seen.right ? "TRACKING" : decayStatus(state.trace.right);
  }

  function palmPoint(landmarks) {
    const points = [landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]];
    const avg = points.reduce(
      (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
      { x: 0, y: 0 }
    );
    return {
      x: 1 - avg.x,
      y: avg.y,
    };
  }

  function decayStatus(samples) {
    const last = samples[samples.length - 1];
    if (!last) return "NO SIGNAL";
    return performance.now() - last.time < 700 ? "DECAY" : "NO SIGNAL";
  }

  function updateAudio(dt) {
    if (!state.analyser || !state.audioData) {
      state.audioLevel = smoothAudioLevel(state.audioLevel, 0, dt);
      return;
    }

    state.analyser.getByteFrequencyData(state.audioData);
    let sum = 0;
    for (const value of state.audioData) sum += value * value;
    const rms = Math.sqrt(sum / state.audioData.length) / 255;
    state.audioLevel = smoothAudioLevel(state.audioLevel, clamp(rms * 2.6, 0, 1), dt);
    state.glitch = clamp(state.glitch * Math.pow(0.08, dt) + state.audioLevel * 0.42, 0, 1);
  }

  function updateHud() {
    const status = classifyMediaState({
      camera: state.cameraLive,
      mic: state.micLive,
    });
    mediaStatus.textContent = status.toUpperCase();
    mediaStatus.classList.toggle("warning", status !== "live");
    audioMeter.style.width = `${Math.round(state.audioLevel * 100)}%`;
  }

  function render(now) {
    ctx.clearRect(0, 0, state.width, state.height);
    drawBackground(now);
    drawTrace("left", "#50ff7a", "#35e7ff", now);
    drawTrace("right", "#ff315a", "#f8ff6a", now);
    drawConnection(now);
    drawDataBursts(now);
    drawCorruption();
  }

  function drawBackground(now) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.fillRect(0, 0, state.width, state.height);

    const grid = 44;
    state.gridOffset = (now * 0.012) % grid;
    ctx.save();
    ctx.globalAlpha = 0.18 + state.audioLevel * 0.14;
    ctx.strokeStyle = "#123f1b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -grid + state.gridOffset; x < state.width + grid; x += grid) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + state.glitch * 18, state.height);
    }
    for (let y = -grid + state.gridOffset; y < state.height + grid; y += grid) {
      ctx.moveTo(0, y);
      ctx.lineTo(state.width, y + state.glitch * 12);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawTrace(hand, colorA, colorB, now) {
    const samples = state.trace[hand];
    if (samples.length < 2) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 1; i < samples.length; i += 1) {
      const prev = samples[i - 1];
      const sample = samples[i];
      const age = clamp((now - sample.time) / 2800, 0, 1);
      const alpha = (1 - age) * (0.25 + state.audioLevel * 0.55);
      const speed = clamp(sample.speed / 3.2, 0, 1);
      const jitter = state.glitch * 10;
      const x1 = prev.point.x * state.width + randomSignal(i, now) * jitter;
      const y1 = prev.point.y * state.height + randomSignal(i + 7, now) * jitter;
      const x2 = sample.point.x * state.width + randomSignal(i + 13, now) * jitter;
      const y2 = sample.point.y * state.height + randomSignal(i + 19, now) * jitter;

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = i % 3 === 0 ? colorB : colorA;
      ctx.lineWidth = 1.2 + speed * 5 + state.audioLevel * 4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (i % 9 === 0) {
        ctx.globalAlpha = alpha * 0.58;
        ctx.fillStyle = colorB;
        ctx.fillRect(x2 - 2, y2 - 2, 4 + state.audioLevel * 10, 4);
      }
    }

    const last = samples[samples.length - 1];
    const pulse = 14 + Math.sin(now * 0.018) * 4 + state.audioLevel * 26;
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = colorA;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(last.point.x * state.width, last.point.y * state.height, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawConnection(now) {
    const left = recentSample(state.trace.left);
    const right = recentSample(state.trace.right);
    if (!left || !right) return;

    ctx.save();
    ctx.globalAlpha = 0.18 + state.audioLevel * 0.32;
    ctx.strokeStyle = "#f8ff6a";
    ctx.lineWidth = 1 + state.audioLevel * 3;
    ctx.setLineDash([8, 12 - state.audioLevel * 8]);
    ctx.lineDashOffset = -now * 0.04;
    ctx.beginPath();
    ctx.moveTo(left.point.x * state.width, left.point.y * state.height);
    ctx.lineTo(right.point.x * state.width, right.point.y * state.height);
    ctx.stroke();
    ctx.restore();
  }

  function drawDataBursts(now) {
    const samples = [recentSample(state.trace.left), recentSample(state.trace.right)].filter(Boolean);
    ctx.save();
    ctx.font = "12px Consolas, monospace";
    for (const sample of samples) {
      if (now - sample.time > 500) continue;
      const x = sample.point.x * state.width;
      const y = sample.point.y * state.height;
      ctx.globalAlpha = 0.4 + state.audioLevel * 0.4;
      ctx.fillStyle = "#50ff7a";
      ctx.fillText(`x:${sample.point.x.toFixed(3)} y:${sample.point.y.toFixed(3)}`, x + 18, y - 18);
    }
    ctx.restore();
  }

  function drawCorruption() {
    if (state.glitch < 0.04) return;

    ctx.save();
    for (let i = 0; i < 8; i += 1) {
      const y = Math.random() * state.height;
      const h = 1 + Math.random() * 10 * state.glitch;
      const offset = (Math.random() - 0.5) * 90 * state.glitch;
      ctx.globalAlpha = 0.08 + state.glitch * 0.1;
      ctx.fillStyle = i % 2 ? "#ff315a" : "#35e7ff";
      ctx.fillRect(offset, y, state.width, h);
    }
    ctx.restore();
  }

  function recentSample(samples) {
    const sample = samples[samples.length - 1];
    if (!sample || performance.now() - sample.time > 1200) return null;
    return sample;
  }

  function randomSignal(seed, now) {
    return Math.sin(seed * 91.17 + now * 0.021) * Math.cos(seed * 12.31 + now * 0.011);
  }

  function tick(now) {
    const dt = clamp((now - state.lastTime) / 1000, 0.001, 0.05);
    state.lastTime = now;
    updateHands();
    updateAudio(dt);
    updateHud();
    render(now);
    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", resize);
  startButton.addEventListener("click", startMedia);
  resize();
  requestAnimationFrame(tick);
})();
