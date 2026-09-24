using System;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Services
{
    public sealed class TaskQuery
    {
        public Guid? ProcessInstanceId { get; set; }
        public int? Status { get; set; }
        public Guid? AssignedUserId { get; set; }
        public Guid? AssignedTeamId { get; set; }
        public int PageSize { get; set; } = 100;
        public string ContinuationToken { get; set; }
    }

    public enum BusinessTaskStatus
    {
        NotStarted = 324010000,
        Assigned = 324010001,
        InProgress = 324010002,
        Waiting = 324010003,
        Completed = 324010004,
        Cancelled = 324010005,
        Expired = 324010006
    }

    public sealed class TaskPage
    {
        public TaskPage(EntityCollection tasks, bool hasMore, string nextToken)
        {
            Tasks = tasks;
            HasMore = hasMore;
            NextToken = nextToken;
        }

        public EntityCollection Tasks { get; }
        public bool HasMore { get; }
        public string NextToken { get; }
    }
}