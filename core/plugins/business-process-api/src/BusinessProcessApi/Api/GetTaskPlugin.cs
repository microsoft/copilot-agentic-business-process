using Faf001.BusinessProcessApi.Infrastructure.Execution;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Api
{
    public sealed class GetTaskPlugin : CustomApiPluginBase
    {
        public const string MessageName = "faf001_GetTask";
        public GetTaskPlugin() : base(MessageName) { }

        protected override ParameterCollection ExecuteOperation(ApiExecution execution)
        {
            var task = new TaskActionService(execution.OrganizationService, execution.Context.UserId)
                .GetTask(execution.RequiredGuid("faf001_TaskId"));
            return new ParameterCollection { ["faf001_Task"] = task };
        }
    }
}