export function displayDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
}
export function availabilityLabel(capacity, reserved) {
  const available = Math.max(0, Number(capacity || 0) - Number(reserved || 0));
  return available === 0
    ? 'Sem vagas disponíveis'
    : `${available} ${available === 1 ? 'vaga disponível' : 'vagas disponíveis'} de ${capacity}`;
}
export function assistantBlocks(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const heading = /^\s*#{1,6}\s+/.test(line);
      const text = line.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*[-*]\s+/, '• ');
      return {
        heading,
        parts: text
          .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
          .filter(Boolean)
          .map((part) => ({
            text:
              part.startsWith('**') && part.endsWith('**')
                ? part.slice(2, -2)
                : part.startsWith('`') && part.endsWith('`')
                  ? part.slice(1, -1)
                  : part,
            strong: heading || part.startsWith('**'),
            code: part.startsWith('`'),
          })),
      };
    });
}

export function displayDeadline(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'não informado';
  const local = new Date(Date.parse(value) - 3 * 60 * 60 * 1000).toISOString();
  return displayDate(local.slice(0, 10)) + ' às ' + local.slice(11, 19) + ' (Brasília)';
}
