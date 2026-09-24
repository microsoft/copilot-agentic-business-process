using System;
using Faf001.BusinessProcessApi.Infrastructure.Execution;
using Faf001.BusinessProcessApi.Repositories;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Api
{
    public sealed class GetTasksPagePlugin : CustomApiPluginBase
    {
        public const string MessageName = "faf001_GetTasksPage";
        public const string ProcessInstanceInput = "faf001_ProcessInstanceId";
        public const string StatusInput = "faf001_Status";
        public const string AssignedUserInput = "faf001_AssignedUserId";
        public const string AssignedTeamInput = "faf001_AssignedTeamId";
        public const string PageSizeInput = "faf001_PageSize";
        public const string TokenInput = "faf001_ContinuationToken";
        public const string TasksOutput = "faf001_Tasks";
        public const string HasMoreOutput = "faf001_HasMore";
        public const string NextTokenOutput = "faf001_NextToken";

        public GetTasksPagePlugin() : base(MessageName) { }

        protected override ParameterCollection ExecuteOperation(ApiExecution execution)
        {
            var query = new TaskQuery
            {
                ProcessInstanceId = execution.OptionalNonDefaultValue<Guid>(ProcessInstanceInput),
                Status = execution.OptionalNonDefaultValue<int>(StatusInput),
                AssignedUserId = execution.OptionalNonDefaultValue<Guid>(AssignedUserInput),
                AssignedTeamId = execution.OptionalNonDefaultValue<Guid>(AssignedTeamInput),
                PageSize = execution.OptionalNonDefaultValue<int>(PageSizeInput) ?? 100,
                ContinuationToken = execution.OptionalString(TokenInput)
            };
            var tasks = new TaskService(new DataverseTaskRepository(execution.OrganizationService,
                () => new DataverseTaskAccessRepository(execution.OrganizationService).GetVisibility(execution.Context.UserId)));
            var page = tasks.GetPage(query, execution.Context.UserId, execution.Context.OrganizationId);
            return new ParameterCollection
            {
                [TasksOutput] = page.Tasks,
                [HasMoreOutput] = page.HasMore,
                [NextTokenOutput] = page.NextToken
            };
        }
    }
}