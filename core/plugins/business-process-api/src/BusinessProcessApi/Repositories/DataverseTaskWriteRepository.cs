using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace Faf001.BusinessProcessApi.Repositories
{
    public sealed class DataverseTaskWriteRepository
    {
        private readonly IOrganizationService service;

        public DataverseTaskWriteRepository(IOrganizationService service) { this.service = service; }

        public void UpdateVersioned(Entity target)
        {
            if (string.IsNullOrEmpty(target.RowVersion)) throw new InvalidPluginExecutionException("A Dataverse row version is required. Enable optimistic concurrency on the task/output table.");
            service.Execute(new UpdateRequest { Target = target, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
        }

        public Guid WriteOutput(Entity output, EntityReference process, Guid taskId)
        {
            var query = new QueryExpression("faf001_bpdatavalue")
            {
                ColumnSet = new ColumnSet("faf001_bpdatavalueid", "faf001_bptaskid"), TopCount = 2
            };
            query.Criteria.AddCondition("faf001_bpinstanceid", ConditionOperator.Equal, process.Id);
            query.Criteria.AddCondition("faf001_datakey", ConditionOperator.Equal, output.GetAttributeValue<string>("faf001_datakey"));
            var existing = service.RetrieveMultiple(query).Entities;
            output["faf001_bpinstanceid"] = process;
            output["faf001_bptaskid"] = new EntityReference("faf001_bptask", taskId);
            if (existing.Count == 0) return service.Create(output);
            if (existing.Count != 1 || existing[0].GetAttributeValue<EntityReference>("faf001_bptaskid")?.Id != taskId)
                throw new InvalidPluginExecutionException("An output key is already used by another task or process value.");
            output.Id = existing[0].Id;
            output.RowVersion = existing[0].RowVersion;
            UpdateVersioned(output);
            return output.Id;
        }

        public void AttachOutput(Guid outputId, Guid stepId)
        {
            service.Update(new Entity("faf001_bpdatavalue", outputId) { ["faf001_bpstepid"] = new EntityReference("faf001_bpstep", stepId) });
        }
    }
}