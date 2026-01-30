# TUI-CAM — Architecture & Scope Notes

## Project Goal

Build a deliberately over-engineered ASCII webcam rendered in a terminal using OpenTUI. The project is intentionally playful, but should be architected cleanly enough to serve as a real testbed for OpenTUI rendering performance, diffing behavior, and component composition.

This is a **Bloated Viable Project (BVP)**: minimal usefulness, maximal learning and visual novelty.

---

## High-Level Architecture

The system is a real-time pipeline:

`Camera → Frame Capture → Pixel Processing → ASCII Mapping → OpenTUI Render`

Key design constraints:

- Terminal-first rendering (no browser UI)
- Predictable performance
- Clear separation between frame generation and UI rendering
- Easy to add cursed features without rewriting everything

---

## Runtime Environment

- Runtime: Bun
- Language: TypeScript (ESM)
- UI Framework: OpenTUI
- Platform: macOS/Linux terminal
- Camera access via:
  - `ffmpeg` subprocess OR
  - platform webcam bindings OR
  - pre-captured frames for development mode

Camera capture details are intentionally abstracted so the UI does not depend on how frames are sourced.

---

## Core Modules

### 1. CameraSource

**Responsibility**

- Produce raw frames at a target FPS
- Hide platform-specific camera logic

**Output**

- Frame objects containing:
  - width
  - height
  - Uint8ClampedArray (RGBA or RGB)

**Notes**

- Should support:
  - real webcam
  - file/video replay mode
- Frame rate throttling belongs here

---

### 2. FrameProcessor

**Responsibility**

- Convert raw pixel data into ASCII-ready buffers

**Stages**

1. Downscale frame to terminal-friendly resolution
2. Convert RGB → luminance
3. Optional image effects:
   - contrast
   - inversion
   - posterization
   - edge detection

**Output**

- 2D array or string[] representing ASCII rows

**Important**

- Processing should be fast and stateless
- Avoid terminal assumptions here

---

### 3. AsciiMapper

**Responsibility**

- Map luminance values to glyphs

**Configurable**

- Character ramps (multiple presets)
- Density modes (ASCII vs block characters)
- Optional color mapping

**Examples**

`“ .:-=+*#%@”`
`“ ░▒▓█”`
`“ .oO@”`

---

### 4. OpenTUI App Layer

**Responsibility**

- Render ASCII frames efficiently
- Handle keyboard input
- Display diagnostics

**Key Components**

- `AsciiViewport`
  - Renders the frame grid
  - Owns terminal size awareness
- `StatusBar`
  - FPS
  - resolution
  - current mode
- `Controls`
  - Keybindings (toggle modes, pause, quit)

**Design Notes**

- Rendering must rely on OpenTUI diffing
- Avoid full re-renders when possible
- Treat ASCII frame as immutable per tick

---

## Data Flow

```
CameraSource
↓
FrameProcessor
↓
AsciiMapper
↓
OpenTUI Render Tree
```

Each stage should be swappable and testable in isolation.

---

## Performance Targets

- Resolution: ~80×40 characters (configurable)
- FPS: 15–30
- Avoid blocking the event loop
- Accept occasional dropped frames

Correctness < smoothness < fun

---

## Development Modes

- `--mock`
  - Uses static images or looping video
- `--fps <n>`
  - Cap frame rate
- `--resolution WxH`
  - Override terminal-based sizing

---

## Extra Cursed Ideas (Explicitly In-Scope)

These are optional but encouraged once the core loop works:

- Edge-detection-only ASCII mode
- Temporal dithering to fake higher resolution
- Multiple character ramps blended by brightness
- Color ASCII using terminal colors
- Mirror mode (selfie correctness)
- FPS-driven glitching when overloaded
- Record frames to a `.txtvid` format and replay
- SSH-friendly low-bandwidth mode
- Sobel outlines overlaid on brightness ramps
- Face detection boxes drawn in ASCII (best-effort)
- “Terminal latency simulator” mode for pain

---

## Non-Goals

- Photorealism
- Perfect cross-platform camera support
- Browser compatibility
- Long-term maintainability
- Restraint

---

## Guiding Principle

This project should feel:

- Slightly too heavy for what it does
- Surprisingly clean inside
- Fun to demo
- Easy to extend in irresponsible directions

If something seems unnecessary but interesting, it probably belongs.
