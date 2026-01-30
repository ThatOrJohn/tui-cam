# tui-cam

Real-time ASCII webcam viewer for the terminal. Captures video from your webcam (or generates test patterns) and renders it as ASCII art using half-block characters for high-resolution output.

Built with [OpenTUI](https://opentui.com) and [Bun](https://bun.sh).

<!-- Screenshot: main webcam view -->

![tui-cam in action](screenshots/live.png)

## Features

- Live webcam capture via ffmpeg
- Real-time ASCII rendering using Unicode half-block characters (2x vertical resolution)
- 6 image effects: edges (Sobel), posterize, contrast, invert, threshold, none
- 5 character ramps: standard, blocks, simple, detailed (70-char), braille dots
- Supersampled rendering mode for smoother output
- Mirror mode
- Built-in mock camera with animated test patterns for development
- GPU shader pipeline (Three.js WebGPU) with automatic CPU fallback
- Interactive controls with on-screen help overlay
- Status bar with FPS, resolution, effect, and pipeline info

<!-- Screenshot: edge detection or another effect -->

![Effects demo](screenshots/effects.png)

## Requirements

- [Bun](https://bun.sh) v1.3+
- [ffmpeg](https://ffmpeg.org/) (for live webcam capture)
- macOS (uses AVFoundation for camera access; Linux/Windows would need different ffmpeg input flags)

## Install

```bash
git clone https://github.com/anthropics/tui-cam.git
cd tui-cam
bun install
```

## Usage

### Live webcam

```bash
bun run start
```

### Mock camera (no webcam needed)

```bash
bun run start:mock
```

### CLI options

| Flag                 | Description                                                                      | Default       |
| -------------------- | -------------------------------------------------------------------------------- | ------------- |
| `--mock`             | Use mock camera with test patterns                                               | off           |
| `--pattern <name>`   | Mock pattern: `gradient`, `checkerboard`, `sinewave`, `noise`, `bars`, `circle`  | `gradient`    |
| `--fps <n>`          | Target frame rate                                                                | `24`          |
| `--resolution <WxH>` | Override output resolution (e.g. `120x60`)                                       | terminal size |
| `--effect <name>`    | Starting effect: `none`, `edges`, `posterize`, `contrast`, `invert`, `threshold` | `none`        |
| `--ramp <name>`      | Character ramp: `standard`, `blocks`, `simple`, `detailed`, `dots`               | `standard`    |
| `--mirror`           | Start with mirror mode on                                                        | off           |
| `--color`            | Enable color mode                                                                | off           |
| `--no-gpu`           | Force CPU pipeline (skip GPU)                                                    | off           |
| `--camera <index>`   | Camera device index for ffmpeg                                                   | `0`           |

### Examples

```bash
# Webcam with edge detection
bun run src/index.ts --effect edges

# Mock camera, block characters, mirrored
bun run src/index.ts --mock --ramp blocks --mirror

# Webcam at 30fps with detailed ramp
bun run src/index.ts --fps 30 --ramp detailed

# Use a specific camera
bun run src/index.ts --camera 1
```

## Controls

| Key     | Action                    |
| ------- | ------------------------- |
| `Space` | Pause / Resume            |
| `E`     | Cycle effect              |
| `R`     | Cycle character ramp      |
| `M`     | Toggle mirror             |
| `S`     | Toggle supersample        |
| `P`     | Cycle pattern (mock mode) |
| `H`     | Toggle help overlay       |
| `Q`     | Quit                      |

## Architecture

```
Webcam / Mock patterns
  -> Raw RGBA frames (Uint8ClampedArray)
    -> Shader pipeline (GPU via Three.js WebGPU, or CPU fallback)
      -> Effect processing (Sobel, posterize, contrast, invert, threshold)
        -> Luminance extraction (Float32Array)
          -> OpenTUI drawGrayscaleBuffer() -> Terminal
```

```
src/
  camera/
    types.ts              Frame + CameraSource interfaces
    mock-camera.ts        Animated test pattern generator
    ffmpeg-camera.ts      Live webcam via ffmpeg subprocess
  pipeline/
    shader-pipeline.ts    GPU pipeline + CPU fallback, factory
    effects.ts            Image effects (CPU implementations)
  ascii/
    ramps.ts              Character ramp presets
    ascii-mapper.ts       Luminance-to-character mapping
  app/
    viewport.ts           ASCII viewport (drawGrayscaleBuffer)
    status-bar.ts         Status display bar
    controls.ts           Keybindings
    app.ts                OpenTUI app composition
  config.ts               CLI argument parsing
  index.ts                Entry point
```

## Tests

```bash
bun test
```

## Credits

- [OpenTUI](https://github.com/anthropics/opentui) -- Terminal UI framework
- [Bun](https://bun.sh) -- JavaScript runtime
- [Three.js](https://threejs.org/) -- GPU shader pipeline
- [bun-webgpu](https://github.com/xhyrom/bun-webgpu) -- WebGPU bindings for Bun
- [ffmpeg](https://ffmpeg.org/) -- Video capture

## License

MIT
