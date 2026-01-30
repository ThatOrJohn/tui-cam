import { test, expect } from "bun:test";
import type { Frame } from "./camera/types.ts";
import { MockCamera } from "./camera/mock-camera.ts";
import { createShaderPipeline } from "./pipeline/shader-pipeline.ts";
import { AsciiMapper } from "./ascii/ascii-mapper.ts";
import { getRamp, getNextRamp } from "./ascii/ramps.ts";
import { getNextEffect, CPU_EFFECTS } from "./pipeline/effects.ts";
import { parseConfig } from "./config.ts";
import { getAction, KEY_BINDINGS } from "./app/controls.ts";

test("MockCamera generates frames", async () => {
  const cam = new MockCamera(40, 20, 30, "gradient");
  await cam.start();
  await new Promise((r) => setTimeout(r, 100));
  const frame = cam.getFrame();
  expect(frame).not.toBeNull();
  expect(frame!.width).toBe(40);
  expect(frame!.height).toBe(20);
  expect(frame!.data.length).toBe(40 * 20 * 4);
  // Check that alpha is 255
  expect(frame!.data[3]).toBe(255);
  cam.stop();
});

test("MockCamera patterns produce different output", async () => {
  const cam1 = new MockCamera(10, 10, 30, "gradient");
  const cam2 = new MockCamera(10, 10, 30, "checkerboard");
  await cam1.start();
  await cam2.start();
  await new Promise((r) => setTimeout(r, 100));
  const f1 = cam1.getFrame()!;
  const f2 = cam2.getFrame()!;
  // Frames should differ
  let differ = false;
  for (let i = 0; i < f1.data.length; i++) {
    if (f1.data[i] !== f2.data[i]) {
      differ = true;
      break;
    }
  }
  expect(differ).toBe(true);
  cam1.stop();
  cam2.stop();
});

test("CpuShaderPipeline processes frames", async () => {
  const pipeline = await createShaderPipeline(40, 20, false);
  expect(pipeline.isGpu).toBe(false);

  const frame: Frame = {
    width: 40,
    height: 20,
    data: new Uint8ClampedArray(40 * 20 * 4),
    timestamp: 0,
  };
  // Fill with gray
  for (let i = 0; i < frame.data.length; i += 4) {
    frame.data[i] = 128;
    frame.data[i + 1] = 128;
    frame.data[i + 2] = 128;
    frame.data[i + 3] = 255;
  }

  const result = pipeline.processFrame(frame, "none", false);
  expect(result.width).toBe(40);
  expect(result.height).toBe(20);
  expect(result.luminance.length).toBe(40 * 20);
  // Gray pixel should be ~0.502
  expect(result.luminance[0]).toBeCloseTo(128 / 255, 2);
  pipeline.destroy();
});

test("CPU effects produce valid output", () => {
  const frame: Frame = {
    width: 10,
    height: 10,
    data: new Uint8ClampedArray(10 * 10 * 4),
    timestamp: 0,
  };
  for (let i = 0; i < frame.data.length; i += 4) {
    frame.data[i] = 100;
    frame.data[i + 1] = 150;
    frame.data[i + 2] = 200;
    frame.data[i + 3] = 255;
  }

  // Invert
  const inverted = CPU_EFFECTS.invert(frame);
  expect(inverted.data[0]).toBe(155);
  expect(inverted.data[1]).toBe(105);
  expect(inverted.data[2]).toBe(55);

  // Threshold
  const thresholded = CPU_EFFECTS.threshold(frame);
  expect(thresholded.data[0]).toBe(255); // Lum > 128

  // Posterize
  const posterized = CPU_EFFECTS.posterize(frame);
  expect(posterized.data[0]).toBeGreaterThanOrEqual(0);
  expect(posterized.data[0]).toBeLessThanOrEqual(255);
});

test("Edge detection works", () => {
  const w = 10,
    h = 10;
  const frame: Frame = {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
    timestamp: 0,
  };
  // Create a sharp edge: left half black, right half white
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 0 : 255;
      const i = (y * w + x) * 4;
      frame.data[i] = v;
      frame.data[i + 1] = v;
      frame.data[i + 2] = v;
      frame.data[i + 3] = 255;
    }
  }

  const edged = CPU_EFFECTS.edges(frame);
  // Edge should be detected at x=5 (boundary)
  const edgePixel = edged.data[(5 * w + 5) * 4]!;
  const flatPixel = edged.data[(5 * w + 0) * 4]!;
  expect(edgePixel).toBeGreaterThan(flatPixel);
});

test("AsciiMapper produces correct intensities", async () => {
  const pipeline = await createShaderPipeline(10, 10, false);
  const frame: Frame = {
    width: 10,
    height: 10,
    data: new Uint8ClampedArray(10 * 10 * 4),
    timestamp: 0,
  };
  for (let i = 0; i < frame.data.length; i += 4) {
    frame.data[i] = 255;
    frame.data[i + 1] = 255;
    frame.data[i + 2] = 255;
    frame.data[i + 3] = 255;
  }

  const processed = pipeline.processFrame(frame, "none", false);
  const mapper = new AsciiMapper("standard");
  const intensities = mapper.mapToIntensities(processed);
  expect(intensities.length).toBe(100);
  // White pixel = 1.0 intensity
  expect(intensities[0]).toBeCloseTo(1.0, 2);
  pipeline.destroy();
});

test("Ramp cycling works", () => {
  expect(getRamp("standard")).toBe(" .:-=+*#%@");
  expect(getNextRamp("standard")).toBe("blocks");
  expect(getNextRamp("dots")).toBe("standard");
});

test("Effect cycling works", () => {
  expect(getNextEffect("none")).toBe("edges");
  expect(getNextEffect("threshold")).toBe("none");
});

test("Key bindings map correctly", () => {
  expect(getAction("q")).toBe("quit");
  expect(getAction("e")).toBe("cycle-effect");
  expect(getAction("space")).toBe("toggle-pause");
  expect(getAction("m")).toBe("toggle-mirror");
  expect(getAction("z")).toBeUndefined();
});

test("Config parsing defaults", () => {
  const config = parseConfig();
  expect(config.fps).toBe(24);
  expect(config.effect).toBe("none");
  expect(config.ramp).toBe("standard");
  expect(config.mock).toBe(false);
  expect(config.gpu).toBe(true); // GPU enabled by default
  expect(config.mirror).toBe(false);
});

test("Config --no-gpu flag disables GPU", () => {
  const originalArgv = Bun.argv;
  Bun.argv = ["bun", "src/index.ts", "--no-gpu"];

  const config = parseConfig();
  expect(config.gpu).toBe(false);

  Bun.argv = originalArgv;
});

test("Mirror effect flips horizontally", () => {
  const frame: Frame = {
    width: 4,
    height: 1,
    data: new Uint8ClampedArray([10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 255, 40, 40, 40, 255]),
    timestamp: 0,
  };

  const { cpuMirror } = require("./pipeline/effects.ts");
  const mirrored = cpuMirror(frame);
  expect(mirrored.data[0]).toBe(40);
  expect(mirrored.data[4]).toBe(30);
  expect(mirrored.data[8]).toBe(20);
  expect(mirrored.data[12]).toBe(10);
});
