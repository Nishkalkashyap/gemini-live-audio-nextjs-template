"use client";

import { useEffect, useRef } from "react";
import {
  INPUT_RATE,
  OUTPUT_RATE,
  base64ToArrayBuffer,
  calculateLevel
} from "./audio-utils";

type AudioIoOptions = {
  onInputLevel: (level: number) => void;
  onOutputLevel: (level: number) => void;
  onPcmInput: (buffer: ArrayBuffer) => void;
};

export function useAudioIo({ onInputLevel, onOutputLevel, onPcmInput }: AudioIoOptions) {
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const captureContextRef = useRef<AudioContext | undefined>(undefined);
  const playbackContextRef = useRef<AudioContext | undefined>(undefined);
  const playbackGainRef = useRef<GainNode | undefined>(undefined);
  const captureSourceRef = useRef<MediaStreamAudioSourceNode | undefined>(undefined);
  const captureWorkletRef = useRef<AudioWorkletNode | undefined>(undefined);
  const playbackCursorRef = useRef(0);
  const callbacksRef = useRef({ onInputLevel, onOutputLevel, onPcmInput });

  useEffect(() => {
    callbacksRef.current = { onInputLevel, onOutputLevel, onPcmInput };
  }, [onInputLevel, onOutputLevel, onPcmInput]);

  async function setupCapture() {
    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    captureContextRef.current = new AudioContext({ sampleRate: INPUT_RATE });
    await captureContextRef.current.audioWorklet.addModule("/audio-worklet.js");
  }

  function startCapture() {
    const captureContext = captureContextRef.current;
    const stream = streamRef.current;
    if (!captureContext || !stream) {
      return;
    }

    captureSourceRef.current = captureContext.createMediaStreamSource(stream);
    captureWorkletRef.current = new AudioWorkletNode(
      captureContext,
      "pcm-capture-processor"
    );

    captureWorkletRef.current.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const pcmBuffer = event.data;
      callbacksRef.current.onInputLevel(calculateLevel(new Int16Array(pcmBuffer)));
      callbacksRef.current.onPcmInput(pcmBuffer);
    };

    captureSourceRef.current.connect(captureWorkletRef.current);
  }

  function stopCapture() {
    captureWorkletRef.current?.port.close();
    captureWorkletRef.current?.disconnect();
    captureWorkletRef.current = undefined;
    captureSourceRef.current?.disconnect();
    captureSourceRef.current = undefined;
  }

  async function setupPlayback() {
    playbackContextRef.current = new AudioContext({ sampleRate: OUTPUT_RATE });
    playbackGainRef.current = playbackContextRef.current.createGain();
    playbackGainRef.current.connect(playbackContextRef.current.destination);
    playbackCursorRef.current = playbackContextRef.current.currentTime;
  }

  function playPcmChunk(base64Data: string) {
    const playbackContext = playbackContextRef.current;
    const playbackGain = playbackGainRef.current;
    if (!playbackContext || !playbackGain) {
      return;
    }

    const pcm16 = new Int16Array(base64ToArrayBuffer(base64Data));
    const floats = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i += 1) {
      floats[i] = pcm16[i] / 32768;
    }

    callbacksRef.current.onOutputLevel(calculateLevel(pcm16));

    const audioBuffer = playbackContext.createBuffer(1, floats.length, OUTPUT_RATE);
    audioBuffer.copyToChannel(floats, 0);

    const source = playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(playbackGain);

    const now = playbackContext.currentTime;
    playbackCursorRef.current = Math.max(playbackCursorRef.current, now);
    source.start(playbackCursorRef.current);
    playbackCursorRef.current += audioBuffer.duration;
  }

  function resetPlayback() {
    const playbackContext = playbackContextRef.current;
    const playbackGain = playbackGainRef.current;
    if (!playbackContext || !playbackGain) {
      return;
    }

    playbackGain.disconnect();
    playbackGainRef.current = playbackContext.createGain();
    playbackGainRef.current.connect(playbackContext.destination);
    playbackCursorRef.current = playbackContext.currentTime;
    callbacksRef.current.onOutputLevel(0);
  }

  async function cleanupAudio() {
    callbacksRef.current.onInputLevel(0);
    callbacksRef.current.onOutputLevel(0);
    stopCapture();

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
    }
    streamRef.current = undefined;

    if (captureContextRef.current && captureContextRef.current.state !== "closed") {
      await captureContextRef.current.close();
    }
    captureContextRef.current = undefined;

    if (playbackContextRef.current && playbackContextRef.current.state !== "closed") {
      await playbackContextRef.current.close();
    }
    playbackContextRef.current = undefined;
    playbackGainRef.current = undefined;
  }

  return {
    cleanupAudio,
    playPcmChunk,
    resetPlayback,
    setupCapture,
    setupPlayback,
    startCapture,
    stopCapture
  };
}
