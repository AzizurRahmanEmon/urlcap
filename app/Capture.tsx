"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GIF from "gif.js";

type Mode = "screenshot" | "gif" | "video";
type Phase = "idle" | "picking" | "live" | "encoding" | "ready" | "error";

const MODE_LABEL: Record<Mode, string> = {
  screenshot: "Screenshot",
  gif: "GIF",
  video: "Video",
};

const MAX_GIF_WIDTH = 1200;
const GIF_FRAME_MS = 120; // ~8fps, keeps file size sane

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function pickVideoMimeType() {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const type of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
    ) {
      return type;
    }
  }
  return "";
}

export default function Capture() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("gif");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [resultKind, setResultKind] = useState<"image" | "video" | "">("");
  const [supported, setSupported] = useState(true);
  const [encodeProgress, setEncodeProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const gifRef = useRef<GIF | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices &&
        !!navigator.mediaDevices.getDisplayMedia,
    );
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    if (clockTimerRef.current) {
      clearInterval(clockTimerRef.current);
      clockTimerRef.current = null;
    }
  }, []);

  useEffect(() => cleanupStream, [cleanupStream]);

  const openUrl = () => {
    if (!url) return;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const resetResult = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl("");
    setResultKind("");
    setEncodeProgress(0);
  };

  const finishGif = useCallback(() => {
    setPhase("encoding");
    const gif = gifRef.current;
    if (!gif) return;
    gif.on("progress", (p: number) => setEncodeProgress(Math.round(p * 100)));
    gif.on("finished", (blob: Blob) => {
      resetResult();
      setResultUrl(URL.createObjectURL(blob));
      setResultKind("image");
      setPhase("ready");
    });
    gif.render();
  }, []);

  const stopCapture = useCallback(() => {
    if (
      mode === "video" &&
      recorderRef.current &&
      recorderRef.current.state !== "inactive"
    ) {
      recorderRef.current.stop();
      setPhase("encoding");
    } else if (mode === "gif") {
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
      }
      finishGif();
    }
    if (clockTimerRef.current) {
      clearInterval(clockTimerRef.current);
      clockTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [mode, finishGif]);

  const startCapture = async () => {
    setErrorMsg("");
    resetResult();
    setPhase("picking");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      track.addEventListener("ended", () => {
        if (mode === "screenshot") return;
        stopCapture();
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setPhase("live");
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      clockTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 200);

      if (mode === "video") {
        const mimeType = pickVideoMimeType();
        chunksRef.current = [];
        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, {
            type: mimeType || "video/webm",
          });
          resetResult();
          setResultUrl(URL.createObjectURL(blob));
          setResultKind("video");
          setPhase("ready");
        };
        recorder.start(250);
        recorderRef.current = recorder;
      }

      if (mode === "gif") {
        const video = videoRef.current!;
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2) return resolve();
          video.onloadedmetadata = () => resolve();
        });
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        const scale = Math.min(1, MAX_GIF_WIDTH / vw);
        const cw = Math.round(vw * scale);
        const ch = Math.round(vh * scale);
        const canvas = canvasRef.current!;
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d")!;

        const gif = new GIF({
          workers: 2,
          quality: 10,
          width: cw,
          height: ch,
          workerScript: "/gif.worker.js",
        });
        gifRef.current = gif;

        frameTimerRef.current = setInterval(() => {
          ctx.drawImage(video, 0, 0, cw, ch);
          gif.addFrame(canvas, { copy: true, delay: GIF_FRAME_MS });
        }, GIF_FRAME_MS);
      }
    } catch (err) {
      setPhase("idle");
      setErrorMsg(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Capture was cancelled — pick a tab/window to share when prompted."
          : "Could not start capture. Your browser may not support tab recording.",
      );
    }
  };

  const captureScreenshot = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = canvasRef.current!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      resetResult();
      setResultUrl(URL.createObjectURL(blob));
      setResultKind("image");
      setPhase("ready");
      cleanupStream();
    }, "image/png");
  };

  const downloadResult = () => {
    if (!resultUrl) return;
    const ext = mode === "video" ? "webm" : mode === "gif" ? "gif" : "png";
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `urlcap-${Date.now()}.${ext}`;
    a.click();
  };

  const startOver = () => {
    resetResult();
    setPhase("idle");
    setElapsedMs(0);
    setErrorMsg("");
  };

  const statusText: Record<Phase, string> = {
    idle: "IDLE",
    picking: "SELECT A TAB…",
    live: "LIVE",
    encoding: mode === "gif" ? `ENCODING ${encodeProgress}%` : "ENCODING",
    ready: "READY",
    error: "ERROR",
  };

  const statusColor =
    phase === "live"
      ? "var(--rec)"
      : phase === "ready"
        ? "var(--green)"
        : phase === "encoding" || phase === "picking"
          ? "var(--amber)"
          : "var(--text-faint)";

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-14 sm:py-20">
      {/* Header */}
      <div className="mb-10 flex items-baseline justify-between">
        <div>
          <h1
            className="text-2xl font-medium tracking-tight sm:text-[28px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            URLCAP
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Tab → screenshot, GIF, or video. Nothing leaves your browser.
          </p>
        </div>
        <div
          className="flex items-center gap-2 text-xs tabular"
          style={{ fontFamily: "var(--font-mono)", color: statusColor }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: statusColor,
              boxShadow: phase === "live" ? "0 0 8px var(--rec)" : "none",
            }}
          />
          {statusText[phase]}
        </div>
      </div>

      {!supported && (
        <div
          className="mb-6 rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--rec-dim)",
            background: "rgba(255,59,48,0.08)",
          }}
        >
          This browser doesn&apos;t support tab capture (Screen Capture API).
          Use a recent desktop Chrome, Edge, or Firefox.
        </div>
      )}

      {/* Step 1: URL */}
      <div className="mb-6">
        <label
          className="mb-2 block text-xs uppercase tracking-wider"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}
        >
          01 — Open the site you want to capture
        </label>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="your-demo.vercel.app"
            className="flex-1 rounded-md border px-3.5 py-2.5 text-sm outline-none"
            style={{
              background: "var(--panel)",
              borderColor: "var(--hairline)",
              color: "var(--text)",
              fontFamily: "var(--font-mono)",
            }}
          />
          <button
            onClick={openUrl}
            disabled={!url}
            className="shrink-0 rounded-md border px-4 py-2.5 text-sm transition-colors disabled:opacity-40"
            style={{
              borderColor: "var(--hairline-bright)",
              color: "var(--text)",
            }}
          >
            Open tab ↗
          </button>
        </div>
      </div>

      {/* Step 2: mode */}
      <div className="mb-6">
        <label
          className="mb-2 block text-xs uppercase tracking-wider"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}
        >
          02 — Choose output
        </label>
        <div className="flex gap-2">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => phase === "idle" && setMode(m)}
              disabled={phase !== "idle"}
              className="flex-1 rounded-md border px-3 py-2.5 text-sm transition-colors disabled:opacity-40"
              style={{
                borderColor: mode === m ? "var(--amber)" : "var(--hairline)",
                background:
                  mode === m ? "rgba(245,166,35,0.08)" : "var(--panel)",
                color: mode === m ? "var(--amber)" : "var(--text-muted)",
              }}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Step 3: capture viewfinder */}
      <div className="mb-6">
        <label
          className="mb-2 block text-xs uppercase tracking-wider"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}
        >
          03 — Capture the tab
        </label>

        <div
          className={`viewfinder rounded-lg border p-4 ${phase === "live" ? "is-live" : ""}`}
          style={{ borderColor: "var(--hairline)", background: "var(--panel)" }}
        >
          <span className="vf-tr" />
          <span className="vf-br" />

          <div
            className="relative flex aspect-video items-center justify-center overflow-hidden rounded"
            style={{ background: "#000" }}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full object-contain"
              style={{ display: phase === "live" ? "block" : "none" }}
            />
            {phase !== "live" && (
              <div
                className="px-6 text-center text-sm"
                style={{
                  color: "var(--text-faint)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {phase === "picking"
                  ? "waiting for tab selection…"
                  : phase === "encoding"
                    ? "encoding…"
                    : phase === "ready"
                      ? "capture complete — see result below"
                      : "preview appears here once capture starts"}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span
              className="tabular text-sm"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--text-muted)",
              }}
            >
              {phase === "live" || phase === "encoding"
                ? formatTime(elapsedMs)
                : "00:00"}
            </span>

            {phase === "idle" && (
              <button
                onClick={startCapture}
                disabled={!supported}
                className="flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ background: "var(--rec)", color: "#fff" }}
              >
                <span className="rec-dot inline-block h-2 w-2 rounded-full bg-white" />
                Start capture
              </button>
            )}

            {phase === "live" && mode === "screenshot" && (
              <button
                onClick={captureScreenshot}
                className="rounded-md px-5 py-2.5 text-sm font-medium"
                style={{ background: "var(--amber)", color: "#0a0b0d" }}
              >
                Capture frame
              </button>
            )}

            {phase === "live" && mode !== "screenshot" && (
              <button
                onClick={stopCapture}
                className="rounded-md border px-5 py-2.5 text-sm font-medium"
                style={{ borderColor: "var(--rec)", color: "var(--rec)" }}
              >
                Stop &amp; export
              </button>
            )}

            {phase === "picking" && (
              <span
                className="text-sm"
                style={{
                  color: "var(--text-faint)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                check the browser prompt…
              </span>
            )}
          </div>
        </div>

        {errorMsg && (
          <p className="mt-2 text-sm" style={{ color: "var(--rec)" }}>
            {errorMsg}
          </p>
        )}
      </div>

      {/* Result */}
      {resultUrl && (
        <div className="mb-6">
          <label
            className="mb-2 block text-xs uppercase tracking-wider"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--text-faint)",
            }}
          >
            04 — Result
          </label>
          <div
            className="overflow-hidden rounded-lg border"
            style={{
              borderColor: "var(--hairline)",
              background: "var(--panel)",
            }}
          >
            {resultKind === "video" ? (
              <video src={resultUrl} controls className="w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resultUrl} alt="Capture result" className="w-full" />
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={downloadResult}
              className="rounded-md px-4 py-2.5 text-sm font-medium"
              style={{ background: "var(--green)", color: "#0a0b0d" }}
            >
              Download {MODE_LABEL[mode]}
            </button>
            <button
              onClick={startOver}
              className="rounded-md border px-4 py-2.5 text-sm"
              style={{
                borderColor: "var(--hairline-bright)",
                color: "var(--text-muted)",
              }}
            >
              New capture
            </button>
          </div>
        </div>
      )}

      <p
        className="mt-10 text-xs leading-relaxed"
        style={{ color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}
      >
        No server. Capture, encoding, and export all run locally in this tab via
        the Screen Capture API — nothing is uploaded anywhere.
      </p>
    </div>
  );
}
