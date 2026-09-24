import { getClient } from '@microsoft/power-apps/data';
import type { IOperationResult } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';
import { processApiDataSources, processReadRequest } from './process-api-contracts';
import type { ProcessReadOperation, ProcessReadRequest, ProcessReadResponses } from './process-api-contracts';

Object.assign(dataSourcesInfo, processApiDataSources);
const client = getClient(dataSourcesInfo);

export function invokeProcessRead<Operation extends ProcessReadOperation>(
  operation: Operation,
  processInstanceId: string,
): Promise<IOperationResult<ProcessReadResponses[Operation]>> {
  return client.executeAsync<ProcessReadRequest, ProcessReadResponses[Operation]>(
    processReadRequest(operation, processInstanceId),
  );
}

export const processApi = { invoke: invokeProcessRead };