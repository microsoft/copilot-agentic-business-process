using Faf001.BusinessProcessApi.Infrastructure.Execution;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Api
{
    public sealed class StartTaskPlugin : CustomApiPluginBase
    {
        public const string MessageName = "faf001_StartTask";
        public StartTaskPlugin() : base(MessageName) { }

        protected override ParameterCollection ExecuteOperation(ApiExecution execution)
        {
            if (!execution.Context.IsInTransaction)
                throw new InvalidPluginExecutionException("StartTask requires a synchronous Dataverse transaction.");
            var taskId = new TaskActionService(execution.OrganizationService, execution.Context.UserId)
                .StartTask(execution.RequiredGuid("faf001_TaskId"));
            return new ParameterCollection { ["faf001_TaskId"] = taskId };
        }
    }
}