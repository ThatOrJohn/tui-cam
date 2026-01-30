export interface Frame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  timestamp: number;
}

export interface CameraSource {
  start(): Promise<void>;
  stop(): void;
  getFrame(): Frame | null;
  isRunning(): boolean;
}
