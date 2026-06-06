const TARGET_SAMPLE_RATE = 16000;
const CHUNK_SIZE = 2048;

function floatToInt16(floatValue) {
  const clamped = Math.max(-1, Math.min(1, floatValue));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inputBuffer = [];
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) {
      return true;
    }

    const ratio = sampleRate / TARGET_SAMPLE_RATE;
    const outputLength = Math.floor(input.length / ratio);
    const resampled = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i += 1) {
      resampled[i] = input[Math.floor(i * ratio)];
    }

    for (const sample of resampled) {
      this.inputBuffer.push(sample);
    }

    while (this.inputBuffer.length >= CHUNK_SIZE) {
      const chunk = this.inputBuffer.splice(0, CHUNK_SIZE);
      const pcm = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i += 1) {
        pcm[i] = floatToInt16(chunk[i]);
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
