(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.MediaTraceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createCore() {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createHandTrace(maxLength) {
    return {
      maxLength,
      left: [],
      right: [],
    };
  }

  function addHandSample(trace, hand, point, time) {
    const list = trace[hand];
    if (!list) throw new Error(`Unknown hand: ${hand}`);

    const previous = list[list.length - 1];
    const dt = previous ? Math.max((time - previous.time) / 1000, 0.001) : 0.001;
    const speed = previous
      ? Math.hypot(point.x - previous.point.x, point.y - previous.point.y) / dt
      : 0;
    const sample = {
      point: {
        x: clamp(point.x, 0, 1),
        y: clamp(point.y, 0, 1),
      },
      time,
      speed,
    };

    list.push(sample);
    while (list.length > trace.maxLength) list.shift();
    return sample;
  }

  function smoothAudioLevel(current, target, dt) {
    const safeDt = clamp(dt || 0.016, 0.001, 0.08);
    const response = 1 - Math.pow(0.04, safeDt);
    return clamp(current + (clamp(target, 0, 1) - current) * response, 0, 1);
  }

  function classifyMediaState(status) {
    if (status.camera && status.mic) return "live";
    if (status.camera) return "camera-only";
    if (status.mic) return "mic-only";
    return "offline";
  }

  return {
    addHandSample,
    clamp,
    classifyMediaState,
    createHandTrace,
    smoothAudioLevel,
  };
});
