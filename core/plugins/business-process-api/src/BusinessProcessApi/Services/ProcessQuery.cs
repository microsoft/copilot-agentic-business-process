using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Services
{
    public sealed class ProcessQuery
    {
        public int? Status { get; set; }
        public int PageSize { get; set; } = 100;
        public string ContinuationToken { get; set; }
    }

    public enum BusinessProcessStatus
    {
        NotStarted = 324010000,
        Running = 324010001,
        Waiting = 324010002,
        Suspended = 324010003,
        Completed = 324010004,
        Failed = 324010005,
        Cancelled = 324010006,
        Compensating = 324010007
    }

    public sealed class ProcessPage
    {
        public ProcessPage(EntityCollection processes, bool hasMore, string nextToken)
        {
            Processes = processes;
            HasMore = hasMore;
            NextToken = nextToken;
        }

        public EntityCollection Processes { get; }
        public bool HasMore { get; }
        public string NextToken { get; }
    }
}