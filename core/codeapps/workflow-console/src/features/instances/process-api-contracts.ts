import type { Faf001_bpinstances } from '../../generated/models/Faf001_bpinstancesModel';
import type { Faf001_bpattachments } from '../../generated/models/Faf001_bpattachmentsModel';
import type { Faf001_bpartifacts } from '../../generated/models/Faf001_bpartifactsModel';
import type { Faf001_bpdatavalues } from '../../generated/models/Faf001_bpdatavaluesModel';

export const processReadOperations = [
  'faf001_GetProcess',
  'faf001_GetAttachments',
  'faf001_GetArtifacts',
  'faf001_GetOutputs',
] as const;

export type ProcessReadOperation = typeof processReadOperations[number];
export type ProcessReadRequest = { faf001_ProcessInstanceId: string };

export const processApiDataSources = Object.fromEntries(processReadOperations.map(operation => [
  operation.toLowerCase(),
  {
    tableId: '',
    version: '',
    primaryKey: '',
    dataSourceType: 'Dataverse',
    apis: {
      [operation]: {
        path: `/api/data/v9.2/${operation}`,
        method: 'POST',
        parameters: [{ name: 'faf001_ProcessInstanceId', in: 'body', required: true, type: 'string' }],
        responseInfo: { '200': { type: 'object' } },
      },
    },
  },
]));

export type ProcessRecordReference = {
  id: string;
  name: string | null;
  type: number | null;
};

export type ProcessStepSummary = ProcessRecordReference & {
  executedBy?: { id: string; name: string | null } | null;
  startDate: string | null;
  endDate: string | null;
  status: number | null;
  outputs: ProcessRecordReference[];
  artifacts: ProcessRecordReference[];
};

type MetadataRow<Row, Id extends keyof Row> = Partial<Row> & Pick<Row, Id>;
export type ProcessDetailRow = MetadataRow<Faf001_bpinstances, 'faf001_bpinstanceid'>;
export type AttachmentMetadata = Omit<MetadataRow<Faf001_bpattachments, 'faf001_bpattachmentid'>, 'faf001_file'>;
export type ArtifactMetadata = Omit<MetadataRow<Faf001_bpartifacts, 'faf001_bpartifactid'>, 'faf001_file' | 'faf001_file_name'>;
export type OutputMetadata = Omit<MetadataRow<Faf001_bpdatavalues, 'faf001_bpdatavalueid'>,
  'faf001_valuetext' | 'faf001_valuejson' | 'faf001_valuenumber' | 'faf001_valueboolean' | 'faf001_valuedatetime'>;

export type ProcessReadResponses = {
  faf001_GetProcess: { faf001_Process: ProcessDetailRow; faf001_StepsJson: string };
  faf001_GetAttachments: { value: AttachmentMetadata[] };
  faf001_GetArtifacts: { value: ArtifactMetadata[] };
  faf001_GetOutputs: { value: OutputMetadata[] };
};

export function processReadRequest(operation: ProcessReadOperation, processInstanceId: string) {
  if (!processReadOperations.includes(operation)) throw new Error('Unsupported process read operation.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(processInstanceId)
    || processInstanceId === '00000000-0000-0000-0000-000000000000') {
    throw new Error('A nonempty process instance GUID is required.');
  }
  return {
    dataverseRequest: {
      action: 'customapi' as const,
      parameters: {
        operationName: operation,
        tableName: operation.toLowerCase(),
        body: { faf001_ProcessInstanceId: processInstanceId },
      },
    },
  };
}