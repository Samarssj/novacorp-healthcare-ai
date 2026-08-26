export const FALLBACK_RECORDING_SECONDS = 60;

export function remainingRecordingSeconds(startedAt: number, now = Date.now()) {
  return Math.max(0, FALLBACK_RECORDING_SECONDS - Math.floor((now - startedAt) / 1000));
}

export function formatRecordingCountdown(seconds: number) {
  return `0:${String(Math.max(0, seconds)).padStart(2, "0")}`;
}
