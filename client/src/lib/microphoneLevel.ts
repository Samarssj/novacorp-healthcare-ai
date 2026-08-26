export const MICROPHONE_METER_BARS = 8;

export function normalizeMicrophoneLevel(samples: Uint8Array) {
  if (samples.length === 0) return 0;
  const meanDeviation = samples.reduce((total, sample) => total + Math.abs(sample - 128), 0) / samples.length;
  return Math.round(Math.min(100, (meanDeviation / 28) * 100));
}

export function activeMicrophoneBars(level: number, totalBars = MICROPHONE_METER_BARS) {
  const normalizedLevel = Math.min(100, Math.max(0, level));
  return Array.from({ length: totalBars }, (_, index) => normalizedLevel >= ((index + 1) / totalBars) * 100);
}
