import { activeAcademicLink } from './workflow.js';

export const materialOwner = (material) =>
  material.ownerId || material.monitorId || material.professorId;
export const publishedMaterial = (material) =>
  material.status === 'approved' && !material.archived && !material.deletedAt;
const activeCourse = (state, id) =>
  state.disciplines.some(
    (course) => course.id === id && course.active !== false,
  );
const supervised = (state, userId, courseId) =>
  state.professorDisciplines.some(
    (link) =>
      link.professorId === userId &&
      link.disciplineId === courseId &&
      activeAcademicLink(link),
  );
const assigned = (state, userId, courseId) =>
  state.monitorDisciplines.some(
    (link) =>
      link.monitorId === userId &&
      link.disciplineId === courseId &&
      activeAcademicLink(link),
  );

export function canReadMaterial(state, user, role, material) {
  const owner = materialOwner(material) === user.id;
  if (role === 'professor')
    return (
      supervised(state, user.id, material.disciplineId) &&
      (owner || material.professorId === user.id || publishedMaterial(material))
    );
  if (role === 'monitor')
    return (
      owner ||
      (activeCourse(state, material.disciplineId) &&
        assigned(state, user.id, material.disciplineId) &&
        publishedMaterial(material))
    );
  return (
    role === 'student' &&
    activeCourse(state, material.disciplineId) &&
    (!user.disciplineIds ||
      user.disciplineIds.includes(material.disciplineId)) &&
    publishedMaterial(material)
  );
}

export function canDeleteMaterial(state, user, role, material) {
  return (
    material.status !== 'deleted' &&
    (role === 'monitor'
      ? materialOwner(material) === user.id
      : role === 'professor' &&
        supervised(state, user.id, material.disciplineId))
  );
}

export function canEditMaterial(state, user, role, material) {
  return (
    materialOwner(material) === user.id &&
    !material.archived &&
    material.status !== 'deleted' &&
    (role === 'professor'
      ? supervised(state, user.id, material.disciplineId)
      : role === 'monitor' && assigned(state, user.id, material.disciplineId))
  );
}
