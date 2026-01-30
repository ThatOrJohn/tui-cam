import { parseConfig } from "./config.ts";
import { MockCamera, getNextPattern, type PatternName } from "./camera/mock-camera.ts";
import { FfmpegCamera } from "./camera/ffmpeg-camera.ts";
import { createShaderPipeline, type ShaderPipeline } from "./pipeline/shader-pipeline.ts";
import { getNextEffect, type EffectName } from "./pipeline/effects.ts";
import { AsciiMapper } from "./ascii/ascii-mapper.ts";
import { TuiCamApp } from "./app/app.ts";
import type { CameraSource } from "./camera/types.ts";
import type { Action } from "./app/controls.ts";

const config = parseConfig();

// State
let currentEffect: EffectName = config.effect as EffectName;
let mirror = config.mirror;
let paused = false;
let supersample = false;

// Camera is created in main() after we know the output dimensions
let camera: CameraSource;

// Create mapper
const mapper = new AsciiMapper(config.ramp);

// Action handler
function handleAction(action: Action): void {
  switch (action) {
    case "toggle-pause":
      paused = !paused;
      break;
    case "cycle-effect":
      currentEffect = getNextEffect(currentEffect);
      break;
    case "cycle-ramp":
      mapper.cycleRamp();
      break;
    case "toggle-mirror":
      mirror = !mirror;
      break;
    case "toggle-supersample":
      supersample = !supersample;
      app.viewport.supersample = supersample;
      break;
    case "cycle-pattern":
      if (camera instanceof MockCamera) {
        camera.pattern = getNextPattern(camera.pattern);
      }
      break;
    case "quit":
      cleanup();
      break;
  }
}

// Create app
const app = new TuiCamApp({
  targetFps: config.fps,
  onAction: handleAction,
});

let pipeline: ShaderPipeline;

async function main() {
  // Initialize app (creates renderer)
  await app.initialize();

  // Determine output resolution from terminal size
  const termCols = process.stdout.columns || 80;
  const termRows = process.stdout.rows || 24;
  const outWidth = config.width || termCols;
  // drawGrayscaleBuffer uses half-blocks, so pixel height = 2 * cell rows
  // Status bar takes 1 row
  const outHeight = config.height || (termRows - 1) * 2;

  // Create camera at the OUTPUT resolution so ffmpeg scales for us,
  // keeping pipe throughput low and avoiding CPU downscale
  if (config.mock) {
    camera = new MockCamera(outWidth, outHeight, config.fps, config.mockPattern as PatternName);
  } else {
    camera = new FfmpegCamera(outWidth, outHeight, config.fps, config.cameraIndex);
  }

  // Create pipeline — input and output dimensions now match
  pipeline = await createShaderPipeline(outWidth, outHeight, !config.noGpu);

  // Start camera
  await camera.start();

  // FPS tracking
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let currentFps = 0;
  let lastFrameTime = 0;
  let lastFrameTimestamp = -1;
  let processing = false; // Concurrency guard

  // Pre-allocate status object — mutate in place instead of creating new objects each frame
  const status = {
    paused: false,
    fps: 0,
    targetFps: config.fps,
    width: outWidth,
    height: outHeight,
    source: config.mock ? `mock:${config.mockPattern}` : "cam",
    effect: currentEffect as string,
    ramp: mapper.getRampName(),
    isGpu: pipeline.isGpu,
    frameTimeMs: 0,
    mirror,
    supersample,
    debugInfo: undefined as string | undefined,
  };

  // Frame callback - called each frame by OpenTUI's render loop
  app.renderer.setFrameCallback(async (_deltaTime: number) => {
    // Concurrency guard: skip if previous frame is still processing
    if (processing) return;
    processing = true;

    try {
      // Update volatile status fields
      status.fps = currentFps;
      status.frameTimeMs = lastFrameTime;
      status.effect = currentEffect;
      status.mirror = mirror;
      status.supersample = supersample;
      status.ramp = mapper.getRampName();

      if (paused) {
        status.paused = true;
        if (config.mock) status.source = `mock:${(camera as MockCamera).pattern}`;
        app.updateStatus(status);
        return;
      }
      status.paused = false;

      const frameStart = performance.now();

      // Get frame from camera — skip if same frame as last time
      const frame = camera.getFrame();
      if (!frame) return;
      if (frame.timestamp === lastFrameTimestamp) {
        if (config.mock) status.source = `mock:${(camera as MockCamera).pattern}`;
        app.updateStatus(status);
        return;
      }
      lastFrameTimestamp = frame.timestamp;

      // Process through pipeline
      const processed = pipeline.processFrame(frame, currentEffect, mirror);

      // Update viewport with processed frame
      app.updateFrame(processed);

      // Track FPS
      frameCount++;
      const now = performance.now();
      lastFrameTime = now - frameStart;
      status.frameTimeMs = lastFrameTime;

      // Debug logging every ~1 second
      if (now - lastFpsTime >= 1000) {
        if (config.debug) {
           if (camera instanceof FfmpegCamera) {
             status.debugInfo = camera.getDebugStats();
           } else {
             status.debugInfo = "mock";
           }
        }
        
        currentFps = frameCount;
        frameCount = 0;
        lastFpsTime = now;
        status.fps = currentFps;
      }

      if (config.mock) status.source = `mock:${(camera as MockCamera).pattern}`;
      app.updateStatus(status);
    } finally {
      processing = false;
    }
  });

  // Start the render loop
  app.start();
}

function cleanup() {
  camera.stop();
  if (pipeline) pipeline.destroy();
  app.destroy();
  process.exit(0);
}

// Handle signals
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

main().catch((err) => {
  console.error("Fatal error:", err);
  cleanup();
});
