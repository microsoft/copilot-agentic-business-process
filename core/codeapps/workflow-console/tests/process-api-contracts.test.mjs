import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { processApiDataSources, processReadOperations, processReadRequest } from '../src/features/instances/process-api-contracts.ts';
import { parseProcessDetail, parseProcessCollection } from '../src/features/instances/process-detail-data.ts';

const definitions = new URL('../../../plugins/business-process-api/spec/', import.meta.url);
const processId = '11111111-2222-3333-4444-555555555555';

for (const operation of processReadOperations) {
  test(`${operation} SDK contract matches the local API definition`, async () => {
    const definition = JSON.parse(await readFile(new URL(`${operation}.json`, definitions), 'utf8'));
    assert.equal(definition.uniquename, operation);
    assert.equal(definition.bindingtype, 0);
    assert.equal(definition.isfunction, false);
    const source = processApiDataSources[operation.toLowerCase()];
    assert.equal(source.dataSourceType, 'Dataverse');
    const api = source.apis[operation];
    assert.equal(api.path, `/api/data/v9.2/${operation}`);
    assert.equal(api.method, 'POST');
    assert.deepEqual(api.parameters, definition.CustomAPIRequestParameters.map(parameter => {
      assert.equal(parameter.type, 12);
      return { name: parameter.uniquename, in: 'body', required: !parameter.isoptional, type: 'string' };
    }));
    const expectedResponses = operation === 'faf001_GetProcess'
      ? [['faf001_Process', 3], ['faf001_StepsJson', 10]]
      : [[operation.replace('Get', ''), 4]];
    assert.deepEqual(definition.CustomAPIResponseProperties.map(property => [property.uniquename, property.type]), expectedResponses);
    assert.deepEqual(processReadRequest(operation, processId), {
      dataverseRequest: {
        action: 'customapi',
        parameters: { operationName: operation, tableName: operation.toLowerCase(), body: { faf001_ProcessInstanceId: processId } },
      },
    });
  });
}

test('process read requests reject invalid identities and write operations', () => {
  for (const invalidId of ['', 'not-a-guid', '00000000-0000-0000-0000-000000000000', `${processId}/extra`]) {
    assert.throws(() => processReadRequest('faf001_GetProcess', invalidId), /GUID/);
  }
  assert.throws(() => processReadRequest('faf001_CompleteTask', processId), /Unsupported/);
});

test('process detail preserves server order and maps metadata-only references', () => {
  const step = { id: 'step-later', name: 'Review', type: 324010001, status: 324010003, startDate: null, endDate: null,
    outputs: [{ id: 'output', name: 'decision', type: 324010000 }], artifacts: [{ id: 'artifact', name: 'Report', type: null }] };
  const data = { faf001_Process: { faf001_bpinstanceid: processId, faf001_status: 324010000 }, faf001_StepsJson: JSON.stringify([step, { ...step, id: 'step-earlier', outputs: [], artifacts: [] }]) };
  const parsed = parseProcessDetail(data, processId);
  assert.deepEqual(parsed.steps.map(item => item.faf001_bpstepid), ['step-later', 'step-earlier']);
  assert.equal(parsed.steps[0].faf001_starttime, undefined);
  assert.equal(parsed.outputs[0]._faf001_bpstepid_value, 'step-later');
  assert.equal(parsed.artifacts[0].faf001_bpartifactid, 'artifact');
  assert.equal('faf001_valuetext' in parsed.outputs[0], false);
  for (const invalid of ['{broken', '{}', JSON.stringify([{ ...step, outputs: null }]), JSON.stringify([step, step])]) {
    assert.throws(() => parseProcessDetail({ ...data, faf001_StepsJson: invalid }, processId), /timeline/);
  }
  assert.throws(() => parseProcessDetail(data, 'another-process'), /detail/);
});

test('timeline maps API executors only for human steps and validates their identity', () => {
  const executedBy = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Alex Reviewer' };
  const step = { id: 'review', name: 'Review', type: 324010001, status: 324010003,
    startDate: null, endDate: null, outputs: [], artifacts: [], executedBy };
  const parse = (steps) => parseProcessDetail({ faf001_Process: { faf001_bpinstanceid: processId, faf001_status: 324010004 },
    faf001_StepsJson: JSON.stringify(steps) }, processId).steps;
  assert.deepEqual(parse([step])[0].executedBy, executedBy);
  assert.equal(parse([{ ...step, type: 324010000 }])[0].executedBy, null);
  assert.equal(parse([{ ...step, executedBy: null }])[0].executedBy, null);
  assert.equal(parse([{ ...step, executedBy: undefined }])[0].executedBy, null);
  assert.deepEqual(parse([{ ...step, executedBy: { ...executedBy, name: null } }])[0].executedBy, { ...executedBy, name: null });
  for (const invalid of [{}, { ...executedBy, id: 'invalid' }, { ...executedBy, name: 42 }, { ...executedBy, id: '00000000-0000-0000-0000-000000000000' }]) {
    assert.throws(() => parse([{ ...step, executedBy: invalid }]), /timeline/);
  }
});

test('collection envelopes allow empty lists but reject wrong shapes or process ownership', () => {
  assert.deepEqual(parseProcessCollection({ value: [] }, processId, 'id'), []);
  const row = { id: 'output', _faf001_bpinstanceid_value: processId };
  assert.deepEqual(parseProcessCollection({ value: [row] }, processId, 'id'), [row]);
  for (const data of [{}, { faf001_Outputs: [] }, { value: [{}] }, { value: [{ ...row, _faf001_bpinstanceid_value: 'other' }] }]) {
    assert.throws(() => parseProcessCollection(data, processId, 'id'), /collection/);
  }
});