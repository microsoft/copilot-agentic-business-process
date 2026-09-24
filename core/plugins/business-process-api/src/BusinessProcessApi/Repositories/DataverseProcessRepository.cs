using System;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Faf001.BusinessProcessApi.Repositories
{
    public sealed class DataverseProcessRepository : IProcessRepository
    {
        public const string TableName = "faf001_bpinstance";
        private readonly IOrganizationService service;

        public DataverseProcessRepository(IOrganizationService service)
        {
            this.service = service ?? throw new ArgumentNullException(nameof(service));
        }

        public EntityCollection GetPage(ProcessQuery query, int pageNumber, string pagingCookie)
        {
            var request = new QueryExpression(TableName)
            {
                ColumnSet = new ColumnSet(
                    "faf001_bpinstanceid", "faf001_processname", "faf001_processdescription",
                    "faf001_processversion", "faf001_businesskey", "faf001_status", "faf001_statusmessage",
                    "faf001_priority", "faf001_starttime", "faf001_endtime", "faf001_duedate",
                    "faf001_lastupdated", "faf001_lastcompletedstepid", "faf001_errorcode",
                    "faf001_errormessage", "faf001_channel", "faf001_initiatedby", "faf001_initiatorexternal",
                    "ownerid", "createdon", "modifiedon", "statecode", "statuscode"),
                PageInfo = new PagingInfo { Count = query.PageSize, PageNumber = pageNumber, PagingCookie = pagingCookie }
            };
            request.AddOrder("faf001_bpinstanceid", OrderType.Ascending);
            if (query.Status.HasValue)
            {
                request.Criteria.AddCondition("faf001_status", ConditionOperator.Equal, query.Status.Value);
            }
            return service.RetrieveMultiple(request);
        }
    }
}