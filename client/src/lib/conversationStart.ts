export function isConversationGreeting(message: string) {
  return /^(hi|hello|hey)\b[!,.\s]*$/i.test(message.trim());
}
