using Faf001.BusinessProcessApi.Infrastructure.Execution;
using Faf001.BusinessProcessApi.Repositories;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Api
{
    public sealed class GetTasksPlugin : CustomApiPluginBase
    {
        public const string MessageName = "faf001_GetTasks";
        public const string TasksOutput = "faf001_Tasks";

        public GetTasksPlugin() : base(MessageName) { }

        protected override ParameterCollection ExecuteOperation(ApiExecution execution)
        {
            var tasks = new TaskService(new DataverseTaskRepository(execution.OrganizationService,
                () => new DataverseTaskAccessRepository(execution.OrganizationService).GetVisibility(execution.Context.UserId)));
            return new ParameterCollection { [TasksOutput] = tasks.GetAll() };
        }
    }
}