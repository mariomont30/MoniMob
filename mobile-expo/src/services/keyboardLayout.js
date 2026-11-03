// All positions are window coordinates in layout points, not offsets relative
// to the scroll content. This also works when Android does not resize its window.
export function focusedScrollOffset({ offset, viewportTop, viewportHeight, inputTop, inputHeight, keyboardTop = Infinity, margin = 8 }) {
  const top = viewportTop + margin;
  const bottom = Math.min(viewportTop + viewportHeight, keyboardTop) - margin;
  if (bottom <= top) return offset;
  const delta = inputHeight > bottom - top ? inputTop - top
    : inputTop + inputHeight > bottom ? inputTop + inputHeight - bottom
    : inputTop < top ? inputTop - top : 0;
  return Math.max(0, offset + delta);
}

export function multilineBounds(viewportHeight) {
  const maxHeight = Math.max(56, Math.min(260, viewportHeight - 24));
  return { minHeight: Math.min(110, maxHeight), maxHeight };
}
