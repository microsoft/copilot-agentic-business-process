import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { contextDeepLink } from '../src/hooks/context-deep-link.ts';
import { startTaskWork } from '../src/features/tasks/start-task-work.ts';
import { parseTaskPreview } from '../src/features/tasks/task-api-contracts.ts';
import { taskPageError } from '../src/features/tasks/task-page-error.ts';
import { taskOperations, taskApiDataSources, taskRequest, parseTaskList, parseTaskDetail, parseTaskAction, taskAction } from '../src/features/tasks/task-api-contracts.ts';

const caller = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const taskId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const other = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const task = { faf001_bptaskid: taskId, faf001_taskname: 'Review', faf001_status: 324010003, statecode: 0 };
const definitions = new URL('../../../plugins/business-process-api/spec/', import.meta.url);

test('task preview accepts API-authorized unassigned tasks without weakening widget access', () => {
  assert.equal(parseTaskPreview(task, taskId, caller), task);
  assert.throws(() => parseTaskDetail(task, taskId, caller));
  for (const value of [{ ...task, _faf001_assignedto_value: other }, { ...task, statecode: 1 }, { ...task, faf001_status: 324010004 }]) {
    assert.throws(() => parseTaskPreview(value, taskId, caller));
  }
  assert.throws(() => parseTaskPreview(task, other, caller));
  assert.throws(() => parseTaskPreview(task, taskId, ''));
});

test('Start Work awaits assignment before start and validates both responses', async () => {
  const calls = [];
  await startTaskWork(taskId, async (operation, body) => {
    calls.push(operation);
    assert.deepEqual(body, { faf001_TaskId: taskId });
    if (operation === 'faf001_StartTask') assert.deepEqual(calls, ['faf001_AssignTask', 'faf001_StartTask']);
    return { success: true, data: { faf001_TaskId: taskId } };
  });
  assert.deepEqual(calls, ['faf001_AssignTask', 'faf001_StartTask']);
  for (const invalid of [{ success: false, error: { message: 'Already claimed' } }, { success: true, data: { faf001_TaskId: other } }]) {
    const failedCalls = [];
    await assert.rejects(startTaskWork(taskId, async operation => { failedCalls.push(operation); return invalid; }));
    assert.deepEqual(failedCalls, ['faf001_AssignTask']);
  }
  await assert.rejects(startTaskWork(taskId, async operation => operation === 'faf001_AssignTask'
    ? { success: true, data: { faf001_TaskId: taskId } }
    : { success: false, error: { message: 'Start conflict' } }), /Assignment succeeded, but.*Start conflict/);
  await assert.rejects(startTaskWork(taskId, async operation => {
    if (operation === 'faf001_StartTask') throw new Error('Network interrupted');
    return { success: true, data: { faf001_TaskId: taskId } };
  }), /Assignment succeeded, but.*Network interrupted/);
});

test('shared StartTaskDetail URLs route the requested task and preserve legacy links', () => {
  const url = new URL(`https://apps.powerapps.com/play/e/environment/app/app?page=StartTaskDetail&taskId=${taskId}`);
  assert.equal(contextDeepLink(Object.fromEntries(url.searchParams)), `/tasks/${taskId}/start`);
  assert.equal(contextDeepLink({ page: 'StartTaskDetail', taskid: taskId }), `/tasks/${taskId}/start`);
  assert.equal(contextDeepLink({ page: 'AssignTaskDetail', taskId }), `/tasks/${taskId}/start`);
  assert.equal(contextDeepLink({ taskId }), `/tasks/${taskId}/start`);
  assert.equal(contextDeepLink({ page: 'TaskDetail', taskId }), `/tasks/${taskId}`);
  assert.equal(contextDeepLink({ instanceId: other }), `/instances/${other}`);
  assert.equal(contextDeepLink({ page: 'ProcessInstanceDetail', instanceId: other }), `/instances/${other}`);
  for (const params of [{ page: 'StartTaskDetail' }, { page: 'StartTaskDetail', taskId: 'bad' }, { taskId: '00000000-0000-0000-0000-000000000000' }, { page: 'AssignTaskDetail', instanceId: other }]) {
    assert.equal(contextDeepLink(params), '/tasks/start');
  }
  for (const params of [{ page: 'https://example.com', taskId }, { page: 'Unknown', taskId }]) {
    assert.equal(contextDeepLink(params), undefined);
  }
});

test('task page errors cover claim, visibility, missing records and unexpected failures', () => {
  for (const message of ['This task is assigned to another user.', 'The task has already been assigned.']) assert.equal(taskPageError(new Error(message)).title, 'Task already taken');
  for (const message of ['You are not eligible to view this task.', 'PrivilegeDenied', 'Forbidden 403']) assert.equal(taskPageError(new Error(message)).title, 'Access unavailable');
  assert.equal(taskPageError(new Error('Task not found')).title, 'Task not found');
  assert.equal(taskPageError(new Error('Task is closed')).title, 'Task no longer available');
  assert.equal(taskPageError(new Error('Assignment succeeded, but starting work could not be confirmed.')).title, 'Unable to start work');
  for (const error of [new Error('Failed to fetch'), new Error('Unexpected backend failure'), null, {}]) assert.equal(taskPageError(error).title, 'Unable to access task');
});

for (const operation of taskOperations) {
  test(`${operation} matches the local task API request contract`, async () => {
    const definition = JSON.parse(await readFile(new URL(`${operation}.json`, definitions), 'utf8'));
    const api = taskApiDataSources[operation.toLowerCase()].apis[operation];
    assert.equal(definition.bindingtype, 0);
    assert.equal(definition.isfunction, false);
    assert.equal(api.method, 'POST');
    assert.equal(api.path, `/api/data/v9.2/${operation}`);
    assert.deepEqual(api.parameters.map(parameter => parameter.name), (definition.CustomAPIRequestParameters ?? []).map(parameter => parameter.uniquename));
    for (const parameter of definition.CustomAPIRequestParameters ?? []) {
      assert.equal(parameter.isoptional, false);
      assert.equal(parameter.type, parameter.uniquename === 'faf001_SubmissionJson' ? 10 : 12);
    }
  });
}

test('task requests reject malformed IDs, extra caller fields, and unsupported operations', () => {
  assert.deepEqual(taskRequest('faf001_GetTasks', {}).dataverseRequest.parameters.body, {});
  assert.deepEqual(taskRequest('faf001_StartTask', { faf001_TaskId: taskId }).dataverseRequest.parameters.body, { faf001_TaskId: taskId });
  for (const id of ['', 'bad', '00000000-0000-0000-0000-000000000000']) assert.throws(() => taskRequest('faf001_StartTask', { faf001_TaskId: id }));
  assert.throws(() => taskRequest('faf001_AssignTask', { faf001_TaskId: taskId, caller }));
  assert.throws(() => taskRequest('faf001_DeleteTask', {}));
  assert.throws(() => taskRequest('faf001_CompleteTask', { faf001_TaskId: taskId }));
});

test('task list hides closed and inactive tasks and rejects malformed or content-bearing lists', () => {
  assert.deepEqual(parseTaskList({ value: [] }), []);
  for (const status of [324010004, 324010005, 324010006]) {
    const closed = { ...task, faf001_bptaskid: other, faf001_status: status, _faf001_assignedto_value: caller };
    assert.deepEqual(parseTaskList({ value: [task, closed] }), [task]);
  }
  assert.deepEqual(parseTaskList({ value: [{ ...task, statecode: 1 }] }), []);
  for (const status of [324010000, 324010001, 324010002, 324010003]) {
    assert.equal(parseTaskList({ value: [{ ...task, faf001_status: status }] }).length, 1);
  }
  for (const data of [{}, [], { value: [task, task] }, { value: [{ ...task, faf001_inputdata: '{}' }] }, { value: [{ ...task, statecode: undefined }] }]) assert.throws(() => parseTaskList(data));
});

test('task actions separate claim, start, closed detail and foreign assignment', () => {
  assert.equal(taskAction(task, caller), 'claim');
  assert.equal(taskAction({ ...task, _faf001_assignedto_value: caller.toUpperCase() }, caller), 'start');
  assert.equal(taskAction({ ...task, _faf001_assignedto_value: other }, caller), null);
  assert.equal(taskAction({ ...task, faf001_status: 324010004 }, caller), null);
  assert.equal(taskAction({ ...task, _faf001_assignedto_value: caller, faf001_status: 324010004 }, caller), 'view');
});

test('detail and action results validate identity and assignment', () => {
  const assigned = { ...task, _faf001_assignedto_value: caller, faf001_inputdata: '{}' };
  assert.equal(parseTaskDetail(assigned, taskId.toUpperCase(), caller).faf001_inputdata, '{}');
  assert.throws(() => parseTaskDetail(task, taskId, caller));
  assert.throws(() => parseTaskDetail(assigned, other, caller));
  assert.throws(() => parseTaskDetail({ faf001_Task: assigned }, taskId, caller));
  assert.equal(parseTaskAction({ faf001_TaskId: taskId }, 'faf001_TaskId', taskId), taskId);
  assert.throws(() => parseTaskAction({ faf001_TaskId: other }, 'faf001_TaskId', taskId));
  assert.throws(() => parseTaskAction({}, 'faf001_StepId'));
});