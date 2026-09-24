using Faf001.BusinessProcessApi.Infrastructure.Execution;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Api
{
    public sealed class AssignTaskPlugin : CustomApiPluginBase
    {
        public const string MessageName = "faf001_AssignTask";
        public AssignTaskPlugin() : base(MessageName) { }

        protected override ParameterCollection ExecuteOperation(ApiExecution execution)
        {
            var taskId = new TaskActionService(execution.OrganizationService, execution.Context.UserId)
                .AssignTask(execution.RequiredGuid("faf001_TaskId"));
            return new ParameterCollection { ["faf001_TaskId"] = taskId };
        }
    }
}