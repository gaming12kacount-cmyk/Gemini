const MAX_LEN = 4000; // Telegram limit is 4096; keep some margin

/**
 * Splits a long message into chunks ≤ MAX_LEN characters.
 * Tries to split at newlines to avoid cutting mid-word/sentence.
 */
export function splitMessage(text: string): string[] {
  if (text.length <= MAX_LEN) return [text];

  const chunks: string[] = [];
  let current = '';

  for (const line of text.split('\n')) {
    if (current.length + line.length + 1 > MAX_LEN) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      // If single line itself is too long, hard-split it
      if (line.length > MAX_LEN) {
        for (let i = 0; i < line.length; i += MAX_LEN) {
          chunks.push(line.slice(i, i + MAX_LEN));
        }
      } else {
        current = line;
      }
    } else {
      current += (current ? '\n' : '') + line;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
