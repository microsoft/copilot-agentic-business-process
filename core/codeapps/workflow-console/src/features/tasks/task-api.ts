import { getClient, type IOperationResult } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';
import { taskApiDataSources, taskRequest, type TaskOperation, type TaskRequests, type TaskResponses } from './task-api-contracts';

Object.assign(dataSourcesInfo, taskApiDataSources);
const client = getClient(dataSourcesInfo);

function invoke<Operation extends TaskOperation>(operation: Operation, body: TaskRequests[Operation]): Promise<IOperationResult<TaskResponses[Operation]>> {
  return client.executeAsync<TaskRequests[Operation], TaskResponses[Operation]>(taskRequest(operation, body));
}

export const taskApi = { invoke };