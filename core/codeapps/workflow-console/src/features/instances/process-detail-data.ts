import type { Faf001_bpsteps } from '../../generated/models/Faf001_bpstepsModel';
import type { ProcessDetailRow, ProcessStepSummary, OutputMetadata, ArtifactMetadata } from './process-api-contracts';

export type TimelineStep = Partial<Faf001_bpsteps> & Pick<Faf001_bpsteps, 'faf001_bpstepid'> & {
  executedBy?: ProcessStepSummary['executedBy'];
};
export type ProcessDetailData = {
  instance: ProcessDetailRow;
  steps: TimelineStep[];
  outputs: OutputMetadata[];
  artifacts: ArtifactMetadata[];
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nullableString(value: unknown) { return value === null || typeof value === 'string'; }
function nullableNumber(value: unknown) { return value === null || Number.isInteger(value); }
function executor(value: unknown) {
  return value == null || (record(value) && typeof value.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)
    && value.id !== '00000000-0000-0000-0000-000000000000' && nullableString(value.name));
}
function reference(value: unknown) {
  return record(value) && typeof value.id === 'string' && value.id.length > 0
    && nullableString(value.name) && nullableNumber(value.type);
}

export function parseProcessDetail(data: unknown, instanceId: string): ProcessDetailData {
  if (!record(data) || !record(data.faf001_Process)
    || typeof data.faf001_Process.faf001_bpinstanceid !== 'string'
    || data.faf001_Process.faf001_bpinstanceid.toLowerCase() !== instanceId.toLowerCase()
    || !Number.isInteger(data.faf001_Process.faf001_status)
    || typeof data.faf001_StepsJson !== 'string') {
    throw new Error('Invalid process detail response.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(data.faf001_StepsJson); }
  catch { throw new Error('Invalid process timeline JSON.'); }
  if (!Array.isArray(parsed) || !parsed.every(step => record(step) && reference(step)
    && nullableString(step.startDate) && nullableString(step.endDate) && nullableNumber(step.status)
    && executor(step.executedBy)
    && Array.isArray(step.outputs) && step.outputs.every(reference)
    && Array.isArray(step.artifacts) && step.artifacts.every(reference))) {
    throw new Error('Invalid process timeline response.');
  }
  const summaries = parsed as ProcessStepSummary[];
  if (new Set(summaries.map(step => step.id.toLowerCase())).size !== summaries.length) {
    throw new Error('Duplicate process timeline step.');
  }
  return {
    instance: data.faf001_Process as ProcessDetailRow,
    steps: summaries.map(step => ({
      faf001_bpstepid: step.id,
      faf001_stepname: step.name ?? undefined,
      faf001_starttime: step.startDate ?? undefined,
      faf001_endtime: step.endDate ?? undefined,
      faf001_steptype: (step.type ?? undefined) as TimelineStep['faf001_steptype'],
      faf001_status: (step.status ?? undefined) as TimelineStep['faf001_status'],
      executedBy: step.type === 324010001 ? step.executedBy ?? null : null,
    })),
    outputs: summaries.flatMap(step => step.outputs.map(output => ({
      faf001_bpdatavalueid: output.id,
      faf001_datakey: output.name ?? undefined,
      faf001_datatype: (output.type ?? undefined) as OutputMetadata['faf001_datatype'],
      _faf001_bpstepid_value: step.id,
    }))),
    artifacts: summaries.flatMap(step => step.artifacts.map(artifact => ({
      faf001_bpartifactid: artifact.id,
      faf001_artifactname: artifact.name ?? undefined,
      faf001_artifacttype: (artifact.type ?? undefined) as ArtifactMetadata['faf001_artifacttype'],
      _faf001_bpstepid_value: step.id,
    }))),
  };
}

export function parseProcessCollection<Row>(data: unknown, instanceId: string, idColumn: string): Row[] {
  if (!record(data) || !Array.isArray(data.value) || !data.value.every(row => record(row)
    && typeof row[idColumn] === 'string' && row[idColumn].length > 0
    && typeof row._faf001_bpinstanceid_value === 'string'
    && row._faf001_bpinstanceid_value.toLowerCase() === instanceId.toLowerCase())) {
    throw new Error('Invalid process collection response.');
  }
  return data.value as Row[];
}