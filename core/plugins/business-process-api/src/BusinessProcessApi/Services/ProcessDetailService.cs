using System;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using Faf001.BusinessProcessApi.Repositories;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Services
{
    public sealed class ProcessDetailService
    {
        private readonly DataverseProcessDetailRepository repository;

        public ProcessDetailService(DataverseProcessDetailRepository repository)
        {
            this.repository = repository ?? throw new ArgumentNullException(nameof(repository));
        }

        public ParameterCollection GetProcess(Guid processId)
        {
            var process = ReadProcess(processId);
            var steps = repository.GetSteps(processId);
            var outputs = repository.GetOutputs(processId).Entities.ToLookup(row => row.GetAttributeValue<EntityReference>("faf001_bpstepid")?.Id);
            var artifacts = repository.GetArtifacts(processId).Entities.ToLookup(row => row.GetAttributeValue<EntityReference>("faf001_bpstepid")?.Id);
            var summaries = steps.Entities.OrderBy(row => row.GetAttributeValue<DateTime?>("faf001_starttime")
                    ?? row.GetAttributeValue<DateTime?>("createdon") ?? DateTime.MaxValue)
                .ThenBy(row => row.Id).Select(row => new StepSummary
                {
                    Id = row.Id,
                    Name = row.GetAttributeValue<string>("faf001_stepname"),
                    StartDate = Date(row, "faf001_starttime"),
                    EndDate = Date(row, "faf001_endtime"),
                    Type = row.GetAttributeValue<OptionSetValue>("faf001_steptype")?.Value,
                    Status = row.GetAttributeValue<OptionSetValue>("faf001_status")?.Value,
                    ExecutedBy = Executor(row),
                    Outputs = outputs[row.Id].Select(value => Reference(value, "faf001_datakey", "faf001_datatype")).ToArray(),
                    Artifacts = artifacts[row.Id].Select(value => Reference(value, "faf001_artifactname", "faf001_artifacttype")).ToArray()
                }).ToArray();
            using (var stream = new MemoryStream())
            {
                new DataContractJsonSerializer(typeof(StepSummary[])).WriteObject(stream, summaries);
                return new ParameterCollection { ["faf001_Process"] = process, ["faf001_StepsJson"] = Encoding.UTF8.GetString(stream.ToArray()) };
            }
        }

        public EntityCollection GetAttachments(Guid processId) { ReadProcess(processId); return repository.GetAttachments(processId); }
        public EntityCollection GetArtifacts(Guid processId) { ReadProcess(processId); return repository.GetArtifacts(processId); }
        public EntityCollection GetOutputs(Guid processId) { ReadProcess(processId); return repository.GetOutputs(processId); }

        private Entity ReadProcess(Guid processId)
        {
            if (processId == Guid.Empty) throw new InvalidPluginExecutionException("A process instance ID is required.");
            return repository.GetProcess(processId);
        }

        private static string Date(Entity row, string attribute)
        {
            var value = row.GetAttributeValue<DateTime?>(attribute);
            return value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc).ToString("o") : null;
        }

        private static RecordSummary Reference(Entity row, string name, string type)
        {
            return new RecordSummary { Id = row.Id, Name = row.GetAttributeValue<string>(name), Type = row.GetAttributeValue<OptionSetValue>(type)?.Value };
        }

        private static ExecutorSummary Executor(Entity row)
        {
            if (row.GetAttributeValue<OptionSetValue>("faf001_steptype")?.Value != 324010001) return null;
            var executor = row.GetAttributeValue<EntityReference>("faf001_executedby");
            return executor == null ? null : new ExecutorSummary { Id = executor.Id, Name = executor.Name };
        }
    }

    [DataContract]
    public sealed class StepSummary
    {
        [DataMember(Name = "id")] public Guid Id { get; set; }
        [DataMember(Name = "name")] public string Name { get; set; }
        [DataMember(Name = "startDate")] public string StartDate { get; set; }
        [DataMember(Name = "endDate")] public string EndDate { get; set; }
        [DataMember(Name = "type")] public int? Type { get; set; }
        [DataMember(Name = "status")] public int? Status { get; set; }
        [DataMember(Name = "executedBy")] public ExecutorSummary ExecutedBy { get; set; }
        [DataMember(Name = "outputs")] public RecordSummary[] Outputs { get; set; }
        [DataMember(Name = "artifacts")] public RecordSummary[] Artifacts { get; set; }
    }

    [DataContract]
    public sealed class ExecutorSummary
    {
        [DataMember(Name = "id")] public Guid Id { get; set; }
        [DataMember(Name = "name")] public string Name { get; set; }
    }

    [DataContract]
    public sealed class RecordSummary
    {
        [DataMember(Name = "id")] public Guid Id { get; set; }
        [DataMember(Name = "name")] public string Name { get; set; }
        [DataMember(Name = "type")] public int? Type { get; set; }
    }
}