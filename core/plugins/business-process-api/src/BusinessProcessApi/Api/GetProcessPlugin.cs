using Faf001.BusinessProcessApi.Infrastructure.Execution;
using Faf001.BusinessProcessApi.Repositories;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Api
{
    public sealed class GetProcessPlugin : CustomApiPluginBase
    {
        public const string MessageName = "faf001_GetProcess";
        public GetProcessPlugin() : base(MessageName) { }

        protected override ParameterCollection ExecuteOperation(ApiExecution execution)
        {
            return new ProcessDetailService(new DataverseProcessDetailRepository(execution.OrganizationService))
                .GetProcess(execution.RequiredGuid("faf001_ProcessInstanceId"));
        }
    }
}