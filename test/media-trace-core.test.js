const assert = require("node:assert/strict");
const test = require("node:test");

const {
  addHandSample,
  classifyMediaState,
  createHandTrace,
  smoothAudioLevel,
} = require("../src/media-trace-core");

test("addHandSample stores bounded trails per hand", () => {
  const trace = createHandTrace(3);

  addHandSample(trace, "left", { x: 0.1, y: 0.2 }, 100);
  addHandSample(trace, "left", { x: 0.2, y: 0.3 }, 200);
  addHandSample(trace, "left", { x: 0.3, y: 0.4 }, 300);
  addHandSample(trace, "left", { x: 0.4, y: 0.5 }, 400);

  assert.equal(trace.left.length, 3);
  assert.deepEqual(trace.left[0].point, { x: 0.2, y: 0.3 });
  assert.deepEqual(trace.left[2].point, { x: 0.4, y: 0.5 });
});

test("addHandSample estimates movement speed", () => {
  const trace = createHandTrace(10);

  addHandSample(trace, "right", { x: 0.2, y: 0.2 }, 100);
  const sample = addHandSample(trace, "right", { x: 0.5, y: 0.2 }, 200);

  assert.ok(sample.speed > 2.9);
  assert.ok(sample.speed < 3.1);
});

test("smoothAudioLevel responds without jumping instantly", () => {
  const rising = smoothAudioLevel(0.1, 0.9, 0.16);
  const falling = smoothAudioLevel(0.9, 0.1, 0.16);

  assert.ok(rising > 0.1);
  assert.ok(rising < 0.9);
  assert.ok(falling < 0.9);
  assert.ok(falling > 0.1);
});

test("classifyMediaState reports missing camera or mic", () => {
  assert.equal(classifyMediaState({ camera: false, mic: false }), "offline");
  assert.equal(classifyMediaState({ camera: true, mic: false }), "camera-only");
  assert.equal(classifyMediaState({ camera: false, mic: true }), "mic-only");
  assert.equal(classifyMediaState({ camera: true, mic: true }), "live");
});
