using System;
using System.Linq;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Faf001.BusinessProcessApi.Repositories
{
    public sealed class DataverseTaskAccessRepository
    {
        private readonly IOrganizationService service;

        public DataverseTaskAccessRepository(IOrganizationService service)
        {
            this.service = service ?? throw new ArgumentNullException(nameof(service));
        }

        public TaskVisibility GetVisibility(Guid caller)
        {
            var teams = new QueryExpression("team") { ColumnSet = new ColumnSet("teamid"), Distinct = true };
            teams.AddOrder("teamid", OrderType.Ascending);
            teams.AddLink("teammembership", "teamid", "teamid")
                .LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, caller);
            var direct = new QueryExpression("role") { ColumnSet = new ColumnSet("roleid"), Distinct = true };
            direct.AddOrder("roleid", OrderType.Ascending);
            direct.AddLink("systemuserroles", "roleid", "roleid")
                .LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, caller);
            var inherited = new QueryExpression("role") { ColumnSet = new ColumnSet("roleid"), Distinct = true };
            inherited.AddOrder("roleid", OrderType.Ascending);
            inherited.AddLink("teamroles", "roleid", "roleid").AddLink("teammembership", "teamid", "teamid")
                .LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, caller);
            return new TaskVisibility(caller,
                DataverseQuery.ReadAll(service, teams).Entities.Select(row => row.Id),
                DataverseQuery.ReadAll(service, direct).Entities.Concat(DataverseQuery.ReadAll(service, inherited).Entities)
                    .Select(row => row.Id));
        }

        public Entity ReadTask(Guid taskId, bool includeInput = false)
        {
            return service.Retrieve(DataverseTaskRepository.TableName, taskId, DataverseTaskRepository.Columns(includeInput));
        }

        public Entity ReadStep(Guid stepId)
        {
            return service.Retrieve("faf001_bpstep", stepId,
                new ColumnSet("faf001_bpinstanceid", "faf001_steptype", "faf001_status", "statecode"));
        }
    }
}