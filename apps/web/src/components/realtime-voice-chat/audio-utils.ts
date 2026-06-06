export const INPUT_RATE = 16000;
export const OUTPUT_RATE = 24000;

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function calculateLevel(samples: Int16Array) {
  if (!samples.length) {
    return 0;
  }

  let sum = 0;
  for (const sample of samples) {
    sum += Math.abs(sample) / 32768;
  }

  return Math.min(1, (sum / samples.length) * 8);
}

export function mergeTranscriptChunk(existing: string, chunk: string) {
  if (!existing) {
    return chunk;
  }
  if (!chunk) {
    return existing;
  }
  if (chunk.startsWith(existing)) {
    return chunk;
  }
  if (existing.endsWith(chunk)) {
    return existing;
  }
  if (/\s$/.test(existing) || /^\s|^[,.;:!?)]/.test(chunk)) {
    return existing + chunk;
  }
  return `${existing} ${chunk}`;
}
