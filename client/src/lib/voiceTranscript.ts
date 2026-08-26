export function handOffVoiceTranscript(
  transcript: string,
  onSendMessage: (message: string) => void,
  isLoading: boolean,
) {
  const message = transcript.trim();
  if (!message || isLoading) return false;
  onSendMessage(message);
  return true;
}
