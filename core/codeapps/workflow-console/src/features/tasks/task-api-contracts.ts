import type { Faf001_bptasks } from '../../generated/models/Faf001_bptasksModel';

export type TaskRow = Partial<Faf001_bptasks> & Pick<Faf001_bptasks,
  'faf001_bptaskid' | 'faf001_taskname' | 'faf001_status' | 'statecode'>;

export type TaskRequests = {
  faf001_GetTasks: Record<string, never>;
  faf001_GetTask: { faf001_TaskId: string };
  faf001_AssignTask: { faf001_TaskId: string };
  faf001_StartTask: { faf001_TaskId: string };
  faf001_CompleteTask: { faf001_TaskId: string; faf001_SubmissionJson: string };
};
export type TaskResponses = {
  faf001_GetTasks: { value: TaskRow[] };
  faf001_GetTask: TaskRow;
  faf001_AssignTask: { faf001_TaskId: string };
  faf001_StartTask: { faf001_TaskId: string };
  faf001_CompleteTask: { faf001_StepId: string };
};
export type TaskOperation = keyof TaskRequests;
export const taskOperations = ['faf001_GetTasks', 'faf001_GetTask', 'faf001_AssignTask',
  'faf001_StartTask', 'faf001_CompleteTask'] as const;

export const taskApiDataSources = Object.fromEntries(taskOperations.map(operation => [operation.toLowerCase(), {
  tableId: '', version: '', primaryKey: '', dataSourceType: 'Dataverse',
  apis: {
    [operation]: {
      path: `/api/data/v9.2/${operation}`, method: 'POST',
      parameters: (operation === 'faf001_GetTasks' ? [] : operation === 'faf001_CompleteTask'
        ? ['faf001_TaskId', 'faf001_SubmissionJson'] : ['faf001_TaskId'])
        .map(name => ({ name, in: 'body', required: true, type: 'string' })),
      responseInfo: { '200': { type: 'object' } },
    },
  },
}]));

function isGuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    && value !== '00000000-0000-0000-0000-000000000000';
}

export function taskRequest<Operation extends TaskOperation>(operation: Operation, body: TaskRequests[Operation]) {
  if (!taskOperations.includes(operation)) throw new Error('Unsupported task operation.');
  const parameters = taskApiDataSources[operation.toLowerCase()].apis[operation].parameters;
  const values = body as Record<string, unknown>;
  if (!body || Object.keys(body).length !== parameters.length
    || parameters.some(parameter => typeof values[parameter.name] !== 'string')) {
    throw new Error('Invalid task action parameters.');
  }
  if (operation !== 'faf001_GetTasks' && !isGuid(values.faf001_TaskId)) throw new Error('A nonempty task GUID is required.');
  return { dataverseRequest: { action: 'customapi' as const, parameters: {
    operationName: operation, tableName: operation.toLowerCase(), body,
  } } };
}

function parseTask(data: unknown): TaskRow {
  if (!data || typeof data !== 'object') throw new Error('Invalid task response.');
  const row = data as Record<string, unknown>;
  if (!isGuid(row.faf001_bptaskid) || typeof row.faf001_taskname !== 'string'
    || !Number.isInteger(row.faf001_status) || Number(row.faf001_status) < 324010000 || Number(row.faf001_status) > 324010006
    || (row.statecode !== 0 && row.statecode !== 1)
    || (row._faf001_assignedto_value != null && !isGuid(row._faf001_assignedto_value))) {
    throw new Error('Invalid task response.');
  }
  return row as TaskRow;
}

export function parseTaskList(data: unknown): TaskRow[] {
  if (!data || typeof data !== 'object' || !('value' in data) || !Array.isArray(data.value)) {
    throw new Error('Invalid task list response.');
  }
  const tasks = data.value.map(parseTask);
  const ids = new Set<string>();
  for (const task of tasks) {
    const id = task.faf001_bptaskid.toLowerCase();
    if (ids.has(id) || task.faf001_inputdata != null) throw new Error('Invalid task metadata response.');
    ids.add(id);
  }
  const timestamp = (value: string | undefined, fallback: number) => {
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return tasks.filter(task => task.statecode === 0 && task.faf001_status <= 324010003).sort((left, right) =>
    timestamp(left.faf001_duedate, Infinity) - timestamp(right.faf001_duedate, Infinity)
    || timestamp(right.createdon, 0) - timestamp(left.createdon, 0)
    || left.faf001_bptaskid.localeCompare(right.faf001_bptaskid));
}

export function isMyTask(task: TaskRow, caller: string): boolean {
  return !!caller && task._faf001_assignedto_value?.toLowerCase() === caller.toLowerCase();
}

export function taskAction(task: TaskRow, caller: string): 'claim' | 'start' | 'view' | null {
  const open = task.statecode === 0 && task.faf001_status <= 324010003;
  if (isMyTask(task, caller)) return open ? 'start' : 'view';
  return open && !task._faf001_assignedto_value ? 'claim' : null;
}

export function parseTaskDetail(data: unknown, taskId: string, caller: string): TaskRow {
  const task = parseTask(data);
  if (task.faf001_bptaskid.toLowerCase() !== taskId.toLowerCase() || !isMyTask(task, caller)) {
    throw new Error('The task must be assigned to you to access its details.');
  }
  return task;
}

export function parseTaskPreview(data: unknown, taskId: string, caller: string): TaskRow {
  const task = parseTask(data);
  if (!caller || task.faf001_bptaskid.toLowerCase() !== taskId.toLowerCase()
    || (!isMyTask(task, caller) && (task._faf001_assignedto_value || task.statecode !== 0 || task.faf001_status > 324010003))) {
    throw new Error('This task is unavailable or assigned to another user.');
  }
  return task;
}

export function parseTaskAction(data: unknown, property: 'faf001_TaskId' | 'faf001_StepId', expectedId?: string): string {
  const id = data && typeof data === 'object' ? (data as Record<string, unknown>)[property] : undefined;
  if (!isGuid(id) || (expectedId && id.toLowerCase() !== expectedId.toLowerCase())) {
    throw new Error('Invalid task action response. Refresh before trying again.');
  }
  return id;
}