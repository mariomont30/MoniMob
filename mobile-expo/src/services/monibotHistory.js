const MAX_HISTORY_ENTRIES = 10;
const MAX_HISTORY_TEXT = 600;

// Send only completed user/model pairs. Failed or currently pending user turns
// are intentionally omitted so Gemini always receives a valid conversation.
export function buildMoniBotHistory(messages) {
  const turns = [];
  let pendingUserText = null;

  for (const item of Array.isArray(messages) ? messages : []) {
    const text = String(item?.text || '').trim();
    if (!text) continue;

    if (item.from === 'user') {
      pendingUserText = text;
      continue;
    }

    if (item.from === 'bot' && pendingUserText !== null) {
      turns.push(
        { role: 'user', text: pendingUserText.slice(0, MAX_HISTORY_TEXT) },
        { role: 'model', text: text.slice(0, MAX_HISTORY_TEXT) }
      );
      pendingUserText = null;
    }
  }

  return turns.slice(-MAX_HISTORY_ENTRIES);
}
