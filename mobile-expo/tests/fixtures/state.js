function localDate(offset) {
  const nowFortaleza = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const date = new Date(Date.UTC(nowFortaleza.getUTCFullYear(), nowFortaleza.getUTCMonth(), nowFortaleza.getUTCDate() + offset));
  return date.toISOString().slice(0, 10);
}

export const curriculum = [
  [1, 'T105', 'Desafios do ciberespaço'], [1, 'T161', 'Experimentação orientada'],
  [1, 'T099', 'Fundamentos de sistemas computacionais'], [1, 'T100', 'Modelagem de problemas matemáticos'],
  [1, 'T096', 'Postura profissional e comunicação interpessoal'], [1, 'T160', 'Raciocínio lógico algorítmico'],
  [2, 'T196', 'Arquitetura de computadores'], [2, 'T166', 'Experimentação de protótipos'],
  [2, 'T163', 'Interação humano-computador'], [2, 'T164', 'Programação orientada a objetos'],
  [2, 'T168', 'Álgebra e geometria computacional'], [3, 'F041', 'Ciclo avaliativo I'],
  [3, 'T197', 'Desenvolvimento para plataformas móveis'], [3, 'T390', 'Estrutura de dados'],
  [3, 'T193', 'Requisitos e modelagem de sistemas'], [3, 'T162', 'Resolução de problemas de natureza discreta'],
  [3, 'T169', 'Sistemas ciberfísicos colaborativos'], [3, 'T116', 'Ética em computação'],
  [4, 'T203', 'Ambiente de dados'], [4, 'T198', 'Construção e análise de algoritmos'],
  [4, 'T242', 'Desenvolvimento para plataformas web'], [4, 'T199', 'Métodos quantitativos em computação'],
  [4, 'T200', 'Projeto de arquitetura de sistemas'], [5, 'F042', 'Ciclo avaliativo II'],
  [5, 'T113', 'Experiência empreendedora'], [5, 'T289', 'Gerenciamento de projetos'],
  [5, 'T293', 'Modelagem em programação matemática'], [5, 'T300', 'Programação funcional'],
  [5, 'T303', 'Projeto de sistema operacional'], [5, 'T290', 'Resolução de problemas com grafos'],
  [6, 'T291', 'Aspectos teóricos da computação'], [6, 'N394', 'Computação gráfica e realidade virtual'],
  [6, 'T292', 'Computação paralela e concorrente'], [6, 'T296', 'Inteligência artificial computacional'],
  [6, 'T295', 'Investigação científica'], [6, 'T310', 'Projeto de redes convergentes'],
  [7, 'F043', 'Ciclo avaliativo III'], [7, 'T326', 'Ciência dos dados'],
  [7, 'T335', 'Computação distribuída'], [7, 'T339', 'Inovação em soluções computacionais'],
  [7, 'T334', 'Modelagem e avaliação de desempenho'], [7, 'T333', 'Projeto banco de dados'],
  [7, 'T319', 'Projeto final integrador I'], [8, 'A500', 'Atividades complementares'],
  [8, 'F044', 'Ciclo avaliativo IV'], [8, 'T338', 'Gerência da implantação de sistemas'],
  [8, 'T337', 'Gerência de serviços no ciberespaço'], [8, 'T138', 'Projeto de tecnologia intercursos'],
  [8, 'T336', 'Projeto final integrador II']
].map(([semester, id, name]) => ({ id, code: id, semester, name }));

export const demoUsers = [
  {
    id: 'student-1', name: 'Aluno de teste', registration: '1000001',
    email: 'aluno.teste@edu.unifor.br', roles: ['student'], course: 'Ciências da Computação'
  },
  {
    id: 'monitor-1', name: 'Monitor de teste', registration: '1000002',
    email: 'monitor.teste@edu.unifor.br', roles: ['student', 'monitor'], course: 'Ciências da Computação'
  },
  {
    id: 'professor-1', name: 'Professora de teste', registration: 'DOC-TESTE',
    email: 'professora.teste@unifor.br', roles: ['professor'], department: 'Centro de Ciências Tecnológicas'
  }
];

const clone = value => JSON.parse(JSON.stringify(value));

export function createSeedState() {
  return {
    users: clone(demoUsers),
    disciplines: clone(curriculum),
    professorDisciplines: [
      { professorId: 'professor-1', disciplineId: 'T390' },
      { professorId: 'professor-1', disciplineId: 'T164' },
      { professorId: 'professor-1', disciplineId: 'T333' }
    ],
    monitorDisciplines: [
      { monitorId: 'monitor-1', disciplineId: 'T390', professorId: 'professor-1', active: true },
      { monitorId: 'monitor-1', disciplineId: 'T164', professorId: 'professor-1', active: true },
      { monitorId: 'monitor-1', disciplineId: 'T333', professorId: 'professor-1', active: true }
    ],
    sessions: [
      { id: 'session-1', disciplineId: 'T390', monitorId: 'monitor-1', professorId: 'professor-1', topic: 'Árvores e percursos', date: localDate(2), time: '18:30', durationMinutes: 90, modality: 'Presencial', location: 'Sala D-12', capacity: 4, status: 'approved', archived: false },
      { id: 'session-2', disciplineId: 'T164', monitorId: 'monitor-1', professorId: 'professor-1', topic: 'Herança e polimorfismo', date: localDate(3), time: '14:00', durationMinutes: 60, modality: 'Online', location: 'Google Meet', monitoringUrl: 'https://meet.google.com/exemplo-monimob', linkValidUntil: `${localDate(3)}T15:30:00`, capacity: 8, status: 'approved', archived: false },
      { id: 'session-3', disciplineId: 'T333', monitorId: 'monitor-1', professorId: 'professor-1', topic: 'Normalização e SQL', date: localDate(4), time: '18:00', durationMinutes: 90, modality: 'Presencial', location: 'Sala J-03', capacity: 3, status: 'pending', archived: false }
    ],
    reservations: [],
    waitlist: [],
    favorites: [],
    attendanceCodes: [],
    attendance: [],
    materials: [
      { id: 'material-1', disciplineId: 'T390', monitorId: 'monitor-1', professorId: 'professor-1', title: 'Resumo — Árvores binárias', type: 'PDF', url: 'https://example.invalid/material-1', status: 'approved', archived: false },
      { id: 'material-2', disciplineId: 'T164', monitorId: 'monitor-1', professorId: 'professor-1', title: 'Lista 03 — Herança', type: 'Lista', url: 'https://example.invalid/material-2', status: 'pending', archived: false }
    ],
    approvals: [],
    auditLogs: [],
    passwordRecoveryRequests: [],
    settings: { cancellationWindowHours: 2, attendanceCodeMinutes: 20, attendanceEarlyWindowMinutes: 15, attendanceLateWindowMinutes: 30, manualAttendanceGraceHours: 24 },
    notifications: [
      { id: 'notification-1', userId: 'student-1', title: 'Bem-vindo ao MoniMob', body: 'Encontre monitorias das disciplinas atuais do curso.', read: false }
    ]
  };
}
