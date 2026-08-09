declare module "gif.js" {
  export interface GIFOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
    background?: string;
    dither?: boolean | string;
  }

  export interface GIFAddFrameOptions {
    delay?: number;
    copy?: boolean;
  }

  export default class GIF {
    constructor(options: GIFOptions);
    addFrame(
      image: CanvasImageSource | ImageData,
      options?: GIFAddFrameOptions
    ): void;
    on(
      event: "finished",
      cb: (blob: Blob) => void
    ): void;
    on(event: "progress", cb: (p: number) => void): void;
    on(event: string, cb: (...args: unknown[]) => void): void;
    render(): void;
    abort(): void;
  }
}
