using System;
using System.Linq;
using System.ServiceModel;
using Faf001.BusinessProcessApi.Repositories;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Services
{
    public sealed class TaskActionService
    {
        private readonly DataverseTaskAccessRepository access;
        private readonly DataverseTaskWriteRepository writes;
        private readonly Guid caller;

        public TaskActionService(IOrganizationService service, Guid caller)
        {
            if (caller == Guid.Empty) throw new InvalidPluginExecutionException("A caller is required.");
            access = new DataverseTaskAccessRepository(service);
            writes = new DataverseTaskWriteRepository(service);
            this.caller = caller;
        }

        public Entity GetTask(Guid taskId)
        {
            RequireId(taskId);
            RequireReadable(access.ReadTask(taskId));
            var detail = access.ReadTask(taskId, true);
            RequireReadable(detail);
            return detail;
        }

        public Guid AssignTask(Guid taskId)
        {
            RequireId(taskId);
            var task = access.ReadTask(taskId);
            RequireOpen(task);
            var assigned = task.GetAttributeValue<EntityReference>("faf001_assignedto");
            if (assigned?.Id == caller) return taskId;
            if (assigned != null) throw new InvalidPluginExecutionException("The task has already been assigned.");
            if (!access.GetVisibility(caller).Allows(task)) throw new InvalidPluginExecutionException("You are not eligible to claim this task.");
            var update = new Entity("faf001_bptask", taskId)
            {
                RowVersion = task.RowVersion,
                ["faf001_assignedto"] = new EntityReference("systemuser", caller),
                ["faf001_assignedon"] = DateTime.UtcNow,
                ["faf001_status"] = new OptionSetValue(324010001)
            };
            ConditionalTaskUpdate(update);
            return taskId;
        }

        public Guid StartTask(Guid taskId)
        {
            RequireId(taskId);
            var task = access.ReadTask(taskId);
            RequireAssigned(task);
            RequireOpen(task);
            var step = RequireHumanStep(task);
            if (task.GetAttributeValue<OptionSetValue>("faf001_status").Value == 324010002
                && step.GetAttributeValue<OptionSetValue>("faf001_status").Value == 324010001) return taskId;
            ConditionalTaskUpdate(new Entity("faf001_bptask", taskId)
            {
                RowVersion = task.RowVersion,
                ["faf001_status"] = new OptionSetValue(324010002)
            });
            ConditionalTaskUpdate(new Entity("faf001_bpstep", step.Id)
            {
                RowVersion = step.RowVersion,
                ["faf001_status"] = new OptionSetValue(324010001)
            });
            return taskId;
        }

        public Guid CompleteTask(Guid taskId, string submissionJson, bool inTransaction)
        {
            RequireId(taskId);
            if (!inTransaction) throw new InvalidPluginExecutionException("CompleteTask requires a synchronous Dataverse transaction.");
            var task = access.ReadTask(taskId);
            RequireAssigned(task);
            RequireOpen(task);
            var step = RequireHumanStep(task);
            var process = task.GetAttributeValue<EntityReference>("faf001_bpinstanceid");
            var submission = WidgetSubmission.Parse(submissionJson, task);
            var now = DateTime.UtcNow;
            ConditionalTaskUpdate(new Entity("faf001_bptask", taskId)
            {
                RowVersion = task.RowVersion,
                ["faf001_status"] = new OptionSetValue(324010004),
                ["faf001_outcome"] = new OptionSetValue(submission.Outcome),
                ["faf001_comments"] = submission.Notes,
                ["faf001_completedon"] = now
            });
            var outputIds = submission.Outputs.Select(output => writes.WriteOutput(output, process, taskId)).ToArray();
            foreach (var outputId in outputIds) writes.AttachOutput(outputId, step.Id);
            ConditionalTaskUpdate(new Entity("faf001_bpstep", step.Id)
            {
                RowVersion = step.RowVersion,
                ["faf001_status"] = new OptionSetValue(324010003),
                ["faf001_endtime"] = now,
                ["faf001_executedby"] = new EntityReference("systemuser", caller)
            });
            return step.Id;
        }

        private Entity RequireHumanStep(Entity task)
        {
            var reference = task.GetAttributeValue<EntityReference>("faf001_bpstepid");
            var process = task.GetAttributeValue<EntityReference>("faf001_bpinstanceid");
            if (reference == null || reference.Id == Guid.Empty || reference.LogicalName != "faf001_bpstep"
                || process == null || process.Id == Guid.Empty)
                throw new InvalidPluginExecutionException("The task must reference its human task step and process. Existing tasks may require migration.");
            var step = access.ReadStep(reference.Id);
            var status = step.GetAttributeValue<OptionSetValue>("faf001_status")?.Value;
            if (step.GetAttributeValue<EntityReference>("faf001_bpinstanceid")?.Id != process.Id
                || step.GetAttributeValue<OptionSetValue>("faf001_steptype")?.Value != 324010001
                || step.GetAttributeValue<OptionSetValue>("statecode")?.Value != 0
                || !status.HasValue || status < 324010000 || status > 324010002)
                throw new InvalidPluginExecutionException("The linked step must be an active, open Human Task step in the same process. Existing tasks may require migration.");
            return step;
        }

        private void ConditionalTaskUpdate(Entity update)
        {
            try { writes.UpdateVersioned(update); }
            catch (FaultException<OrganizationServiceFault> exception) when (exception.Detail.ErrorCode == -2147088254)
            {
                throw new InvalidPluginExecutionException("The task or its step changed while you were acting on it. Refresh before trying again.", exception);
            }
        }

        private void RequireReadable(Entity task)
        {
            var assigned = task.GetAttributeValue<EntityReference>("faf001_assignedto");
            if (assigned?.Id == caller) return;
            if (assigned != null) throw new InvalidPluginExecutionException("This task is assigned to another user.");
            RequireOpen(task);
            if (task.GetAttributeValue<EntityReference>("faf001_assignedteam") == null
                && task.GetAttributeValue<EntityReference>("faf001_requiredrole") == null)
                throw new InvalidPluginExecutionException("You are not eligible to view this task.");
            if (!access.GetVisibility(caller).Allows(task))
                throw new InvalidPluginExecutionException("You are not eligible to view this task.");
        }

        private void RequireAssigned(Entity task)
        {
            if (task.GetAttributeValue<EntityReference>("faf001_assignedto")?.Id != caller)
                throw new InvalidPluginExecutionException("The task must be assigned to you to start it or complete it.");
        }

        private static void RequireOpen(Entity task)
        {
            var status = task.GetAttributeValue<OptionSetValue>("faf001_status")?.Value;
            if (task.GetAttributeValue<OptionSetValue>("statecode")?.Value != 0 || !status.HasValue || status < 324010000 || status > 324010003)
                throw new InvalidPluginExecutionException("The task is not active and open.");
        }

        private static void RequireId(Guid taskId)
        {
            if (taskId == Guid.Empty) throw new InvalidPluginExecutionException("A task ID is required.");
        }
    }
}