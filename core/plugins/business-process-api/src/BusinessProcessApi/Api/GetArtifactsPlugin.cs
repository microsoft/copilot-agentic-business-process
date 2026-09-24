using Faf001.BusinessProcessApi.Infrastructure.Execution;
using Faf001.BusinessProcessApi.Repositories;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Api
{
    public sealed class GetArtifactsPlugin : CustomApiPluginBase
    {
        public const string MessageName = "faf001_GetArtifacts";
        public GetArtifactsPlugin() : base(MessageName) { }

        protected override ParameterCollection ExecuteOperation(ApiExecution execution)
        {
            var records = new ProcessDetailService(new DataverseProcessDetailRepository(execution.OrganizationService))
                .GetArtifacts(execution.RequiredGuid("faf001_ProcessInstanceId"));
            return new ParameterCollection { ["faf001_Artifacts"] = records };
        }
    }
}