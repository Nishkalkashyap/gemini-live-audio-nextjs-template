"use client";

import { useEffect, useRef, useState } from "react";
import type { ScreenFrameRate } from "./types";

const MAX_FRAME_WIDTH = 1280;
const MAX_FRAME_HEIGHT = 720;
const JPEG_QUALITY = 0.72;

type ScreenFrame = {
  data: string;
  mimeType: "image/jpeg";
};

type ScreenShareOptions = {
  frameRate: ScreenFrameRate;
  onFrame: (frame: ScreenFrame) => void;
};

export function useScreenShare({ frameRate, onFrame }: ScreenShareOptions) {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isStartingScreenShare, setIsStartingScreenShare] = useState(false);
  const [screenShareError, setScreenShareError] = useState<string | undefined>();

  const streamRef = useRef<MediaStream | undefined>(undefined);
  const videoRef = useRef<HTMLVideoElement | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement | undefined>(undefined);
  const timerRef = useRef<number | undefined>(undefined);
  const isCapturingFrameRef = useRef(false);
  const frameRateRef = useRef(frameRate);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    frameRateRef.current = frameRate;
    if (streamRef.current) {
      clearFrameTimer();
      scheduleFrameCapture(0);
    }
  }, [frameRate]);

  useEffect(() => {
    return () => {
      stopScreenShare();
    };
  }, []);

  async function startScreenShare() {
    if (streamRef.current || isStartingScreenShare) {
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenShareError("Screen sharing is not supported in this browser.");
      return;
    }

    setIsStartingScreenShare(true);
    setScreenShareError(undefined);

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { max: 1 },
          height: { max: MAX_FRAME_HEIGHT },
          width: { max: MAX_FRAME_WIDTH }
        },
        audio: false
      });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      await waitForVideo(video);
      await video.play();

      for (const track of stream.getVideoTracks()) {
        track.onended = handleStreamEnded;
      }

      streamRef.current = stream;
      videoRef.current = video;
      setIsScreenSharing(true);
      scheduleFrameCapture(0);
    } catch (error) {
      stopScreenShare();
      setScreenShareError(formatScreenShareError(error));
    } finally {
      setIsStartingScreenShare(false);
    }
  }

  function stopScreenShare() {
    clearFrameTimer();
    isCapturingFrameRef.current = false;

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.onended = null;
        track.stop();
      }
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    streamRef.current = undefined;
    videoRef.current = undefined;
    setIsScreenSharing(false);
  }

  function handleStreamEnded() {
    stopScreenShare();
  }

  function clearFrameTimer() {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }

  function scheduleFrameCapture(delayMs = 1000 / frameRateRef.current) {
    clearFrameTimer();
    if (!streamRef.current) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      void captureFrame();
    }, delayMs);
  }

  async function captureFrame() {
    if (!streamRef.current || isCapturingFrameRef.current) {
      return;
    }

    isCapturingFrameRef.current = true;

    try {
      const frame = await createScreenFrame();
      if (frame) {
        onFrameRef.current(frame);
      }
    } catch (error) {
      setScreenShareError(formatScreenShareError(error));
    } finally {
      isCapturingFrameRef.current = false;
      scheduleFrameCapture();
    }
  }

  async function createScreenFrame(): Promise<ScreenFrame | undefined> {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return undefined;
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) {
      return undefined;
    }

    const scale = Math.min(
      1,
      MAX_FRAME_WIDTH / sourceWidth,
      MAX_FRAME_HEIGHT / sourceHeight
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not prepare a screen capture canvas.");
    }

    context.drawImage(video, 0, 0, width, height);
    const blob = await canvasToJpeg(canvas);
    return {
      data: await blobToBase64(blob),
      mimeType: "image/jpeg"
    };
  }

  return {
    isScreenSharing,
    isStartingScreenShare,
    screenShareError,
    startScreenShare,
    stopScreenShare
  };
}

function waitForVideo(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load the selected screen."));
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not encode the screen frame."));
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the screen frame."));
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? "");
    };
    reader.readAsDataURL(blob);
  });
}

function formatScreenShareError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Screen sharing permission was not granted.";
  }
  return error instanceof Error ? error.message : String(error);
}
