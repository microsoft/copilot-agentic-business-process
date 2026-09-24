using System;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Faf001.BusinessProcessApi.Repositories
{
    public sealed class DataverseTaskRepository : ITaskRepository
    {
        public const string TableName = "faf001_bptask";
        private readonly IOrganizationService service;
        private readonly Func<TaskVisibility> visibility;

        public DataverseTaskRepository(IOrganizationService service, Func<TaskVisibility> visibility = null)
        {
            this.service = service ?? throw new ArgumentNullException(nameof(service));
            this.visibility = visibility;
        }

        public EntityCollection GetAll()
        {
            var query = CreateQuery();
            query.PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 };
            var tasks = new EntityCollection { EntityName = TableName };
            while (true)
            {
                var page = service.RetrieveMultiple(query);
                tasks.Entities.AddRange(page.Entities);
                if (!page.MoreRecords)
                {
                    return tasks;
                }

                if (string.IsNullOrEmpty(page.PagingCookie))
                {
                    throw new InvalidPluginExecutionException("Dataverse did not return a paging cookie. No partial task result was returned.");
                }

                query.PageInfo.PageNumber = checked(query.PageInfo.PageNumber + 1);
                query.PageInfo.PagingCookie = page.PagingCookie;
            }
        }

        public EntityCollection GetPage(TaskQuery request, int pageNumber, string pagingCookie)
        {
            var query = CreateQuery();
            query.PageInfo = new PagingInfo { Count = request.PageSize, PageNumber = pageNumber, PagingCookie = pagingCookie };
            if (request.ProcessInstanceId.HasValue)
            {
                query.Criteria.AddCondition("faf001_bpinstanceid", ConditionOperator.Equal, request.ProcessInstanceId.Value);
            }
            if (request.Status.HasValue)
            {
                query.Criteria.AddCondition("faf001_status", ConditionOperator.Equal, request.Status.Value);
            }
            if (request.AssignedUserId.HasValue || request.AssignedTeamId.HasValue)
            {
                var assignment = query.Criteria.AddFilter(LogicalOperator.Or);
                if (request.AssignedUserId.HasValue)
                {
                    assignment.AddCondition("faf001_assignedto", ConditionOperator.Equal, request.AssignedUserId.Value);
                }
                if (request.AssignedTeamId.HasValue)
                {
                    assignment.AddCondition("faf001_assignedteam", ConditionOperator.Equal, request.AssignedTeamId.Value);
                }
            }
            return service.RetrieveMultiple(query);
        }

        private QueryExpression CreateQuery()
        {
            var query = new QueryExpression(TableName)
            {
                ColumnSet = Columns(false)
            };
            if (visibility != null) query.Criteria.AddFilter(visibility().CreateFilter());
            query.AddOrder("faf001_bptaskid", OrderType.Ascending);
            return query;
        }

        internal static ColumnSet Columns(bool includeInput)
        {
            var columns = new ColumnSet(
                    "faf001_bptaskid", "faf001_taskname", "faf001_tasktype", "faf001_status",
                    "faf001_bpinstanceid", "faf001_bpstepid", "faf001_assignedto", "faf001_assignedteam",
                    "faf001_assignedon", "faf001_completedon", "faf001_duedate", "faf001_requiredrole",
                    "faf001_comments", "faf001_outcome", "faf001_widgetid",
                    "ownerid", "createdon", "modifiedon", "statecode", "statuscode");
            if (includeInput) columns.AddColumn("faf001_inputdata");
            return columns;
        }
    }
}