import test from 'node:test';
import assert from 'node:assert/strict';
import { nextStudentAppointment } from '../src/domain/studentSummary.js';
import { MonitoringService } from '../src/domain/monitoring.js';
import { createSeedState } from './fixtures/state.js';
import { MemoryStateRepository } from './fixtures/repository.js';

test('home selects the next own commitment, including an ongoing or resubmitted booking', () => {
  const state = createSeedState();
  const sample = state.sessions[0];
  const now = Date.parse('2099-06-10T10:30:00-03:00');
  state.sessions = [
    { ...sample, id: 'unbooked', date: '2099-06-10', time: '10:35' },
    { ...sample, id: 'later', date: '2099-06-11', time: '10:00' },
    { ...sample, id: 'ongoing', date: '2099-06-10', time: '10:00', durationMinutes: 60, status: 'pending' },
    { ...sample, id: 'cancelled', date: '2099-06-10', time: '10:01', status: 'cancelled' },
    { ...sample, id: 'archived', date: '2099-06-10', time: '10:02', archived: true },
    { ...sample, id: 'ended', date: '2099-06-10', time: '09:00', durationMinutes: 60 },
  ];
  state.reservations = state.sessions.filter((s) => s.id !== 'unbooked').map((s) => ({ sessionId: s.id, studentId: 'student-1', status: 'confirmed' }));
  assert.equal(nextStudentAppointment(state, 'student-1', now).id, 'ongoing');
  assert.equal(nextStudentAppointment(state, 'student-1', now + 30 * 60000).id, 'later');
  assert.equal(nextStudentAppointment(state, 'another-student', now), null);
  state.reservations.forEach((r) => { r.status = 'cancelled'; });
  assert.equal(nextStudentAppointment(state, 'student-1', now), null);
});

test('catalog orders filtered future sessions chronologically without changing persisted order', () => {
  const state = createSeedState(), sample = state.sessions[0];
  state.sessions = [
    { ...sample, id: 'late', date: '2099-06-12', time: '09:00' },
    { ...sample, id: 'early-b', date: '2099-06-10', time: '08:00' },
    { ...sample, id: 'early-a', date: '2099-06-10', time: '08:00' },
    { ...sample, id: 'private', date: '2099-06-09', status: 'pending' },
  ];
  const repository = new MemoryStateRepository(state), service = new MonitoringService(repository);
  assert.deepEqual(service.listSessions({ approvedOnly: true }).map((s) => s.id), ['early-a', 'early-b', 'late']);
  assert.equal(repository.read().sessions[0].id, 'late');
});

test('demand metrics respect course and session-date filters and retain archived attendance history', () => {
  const state = createSeedState(), sample = state.sessions[0];
  state.sessions = [
    { ...sample, id: 'past', date: '2099-06-10', time: '08:00', durationMinutes: 60, capacity: 2, archived: true },
    { ...sample, id: 'future', date: '2099-06-10', time: '18:00', capacity: 4 },
    { ...sample, id: 'other-date', date: '2099-06-11', capacity: 90 },
    { ...sample, id: 'cancelled', date: '2099-06-10', status: 'cancelled', capacity: 90 },
    { ...sample, id: 'foreign', disciplineId: 'T197', date: '2099-06-10', capacity: 90 },
  ];
  state.reservations = [
    { id: 'r1', sessionId: 'past', studentId: 'student-1', status: 'confirmed' },
    { id: 'r2', sessionId: 'future', studentId: 'student-2', status: 'confirmed' },
    { id: 'r3', sessionId: 'future', studentId: 'cancelled', status: 'cancelled' },
  ];
  state.attendance = [{ sessionId: 'past', studentId: 'student-1', status: 'present' }];
  state.waitlist = [
    { sessionId: 'future', studentId: 'student-3', status: 'waiting' },
    { sessionId: 'future', studentId: 'student-2', status: 'promoted' },
  ];
  const service = new MonitoringService(new MemoryStateRepository(state));
  const filters = { disciplineId: sample.disciplineId, startDate: '2099-06-10', endDate: '2099-06-10' };
  const report = service.reportForProfessor('professor-1', filters, Date.parse('2099-06-10T12:00:00-03:00'));
  assert.equal(report.sessions, 1);
  assert.equal(report.attendanceRate, 100);
  assert.equal(report.scheduledSessions, 2);
  assert.equal(report.capacity, 6);
  assert.equal(report.bookedPlaces, 2);
  assert.equal(report.waiting, 1);
  assert.equal(report.demand, 3);
  assert.equal(report.occupancyRate, 33);
  const csv = service.exportReportCsv('professor-1', filters).split('\n');
  assert.equal(csv[0].split(',').length, 18);
  assert.match(csv[0], /Demanda,Ocupação/);
  assert.match(csv[1], /"2","6","2","1","3","33"$/);
  const denied = service.reportForProfessor('professor-1', { disciplineId: 'T197' });
  assert.equal(denied.demand, 0);
});
