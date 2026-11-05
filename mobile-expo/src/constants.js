export const ROLE_LABELS = { student: 'Aluno', monitor: 'Monitor', professor: 'Professor' };

export const createSessionFilters = () => ({ query: '', semester: '', disciplineId: '', professorId: '', monitorId: '', modality: '', date: '', time: '', shift: '', availableOnly: false });

const STATUS_LABELS = {
  approved: 'Aprovada', pending: 'Pendente', rejected: 'Rejeitada',
  adjustments_requested: 'Ajustes solicitados', confirmed: 'Confirmada',
  cancelled: 'Cancelada', waiting: 'Lista de espera', present: 'Presente', absent: 'Ausente'
};

export function statusLabel(value) {
  return STATUS_LABELS[value] || String(value || '');
}
