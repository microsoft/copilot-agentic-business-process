using Faf001.BusinessProcessApi.Infrastructure.Execution;
using Faf001.BusinessProcessApi.Repositories;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Api
{
    public sealed class GetProcessesPlugin : CustomApiPluginBase
    {
        public const string MessageName = "faf001_GetProcesses";
        public const string StatusInput = "faf001_Status";
        public const string PageSizeInput = "faf001_PageSize";
        public const string TokenInput = "faf001_ContinuationToken";
        public const string ProcessesOutput = "faf001_Processes";
        public const string HasMoreOutput = "faf001_HasMore";
        public const string NextTokenOutput = "faf001_NextToken";

        public GetProcessesPlugin() : base(MessageName) { }

        protected override ParameterCollection ExecuteOperation(ApiExecution execution)
        {
            var query = new ProcessQuery
            {
                Status = execution.OptionalNonDefaultValue<int>(StatusInput),
                PageSize = execution.OptionalNonDefaultValue<int>(PageSizeInput) ?? 100,
                ContinuationToken = execution.OptionalString(TokenInput)
            };
            var processes = new ProcessService(new DataverseProcessRepository(execution.OrganizationService));
            var page = processes.GetPage(query, execution.Context.UserId, execution.Context.OrganizationId);
            return new ParameterCollection
            {
                [ProcessesOutput] = page.Processes,
                [HasMoreOutput] = page.HasMore,
                [NextTokenOutput] = page.NextToken
            };
        }
    }
}