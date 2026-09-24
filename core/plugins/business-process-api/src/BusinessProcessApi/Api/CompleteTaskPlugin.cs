using Faf001.BusinessProcessApi.Infrastructure.Execution;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Api
{
    public sealed class CompleteTaskPlugin : CustomApiPluginBase
    {
        public const string MessageName = "faf001_CompleteTask";
        public CompleteTaskPlugin() : base(MessageName) { }

        protected override ParameterCollection ExecuteOperation(ApiExecution execution)
        {
            var stepId = new TaskActionService(execution.OrganizationService, execution.Context.UserId)
                .CompleteTask(execution.RequiredGuid("faf001_TaskId"), execution.OptionalString("faf001_SubmissionJson"), execution.Context.IsInTransaction);
            return new ParameterCollection { ["faf001_StepId"] = stepId };
        }
    }
}