const CHECK_PREFIX = "Couldn't check for updates: ";

/**
 * One sentence for a failed update check. The meet keeps running either way.
 */
export function updateCheckFailure(message: string): string {
  const detail = message.startsWith(CHECK_PREFIX)
    ? message.slice(CHECK_PREFIX.length)
    : message;
  const sentence = detail.endsWith(".") ? detail : `${detail}.`;
  return `Lane4 couldn't check for updates. ${sentence} You can keep running the meet.`;
}
