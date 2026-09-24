using System;
using System.Collections.Generic;
using System.Linq;
using System.ServiceModel;
using System.Web.Script.Serialization;
using Faf001.BusinessProcessApi.Repositories;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Xunit;

namespace Faf001.BusinessProcessApi.Tests
{
    public sealed class ProcessDetailTests
    {
        private readonly Mock<IOrganizationService> service = new Mock<IOrganizationService>(MockBehavior.Strict);
        private readonly Guid processId = Guid.NewGuid();
        private ProcessDetailService Detail => new ProcessDetailService(new DataverseProcessDetailRepository(service.Object));

        public ProcessDetailTests()
        {
            service.Setup(value => value.Retrieve("faf001_bpinstance", processId, It.IsAny<ColumnSet>()))
                .Returns(new Entity("faf001_bpinstance", processId));
        }

        [Theory]
        [InlineData("faf001_bpattachment")]
        [InlineData("faf001_bpartifact")]
        [InlineData("faf001_bpdatavalue")]
        public void ListsAllPagesOfMetadataForOnlyRequestedProcess(string table)
        {
            var calls = 0;
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase request) =>
            {
                var query = Assert.IsType<QueryExpression>(request);
                Assert.Equal(table, query.EntityName);
                Assert.False(query.ColumnSet.AllColumns);
                Assert.DoesNotContain("faf001_file", query.ColumnSet.Columns);
                Assert.DoesNotContain(query.ColumnSet.Columns, column => column.StartsWith("faf001_value"));
                Assert.Contains(table + "id", query.ColumnSet.Columns);
                var condition = Assert.Single(query.Criteria.Conditions);
                Assert.Equal("faf001_bpinstanceid", condition.AttributeName);
                Assert.Equal(processId, Assert.Single(condition.Values));
                Assert.Equal("createdon", query.Orders[0].AttributeName);
                Assert.Equal(table + "id", query.Orders[1].AttributeName);
                calls++;
                Assert.Equal(calls, query.PageInfo.PageNumber);
                Assert.Equal(calls == 1 ? null : "next", query.PageInfo.PagingCookie);
                return new EntityCollection(new[] { new Entity(table, Guid.NewGuid()) }) { MoreRecords = calls == 1, PagingCookie = calls == 1 ? "next" : null };
            });
            var result = table == "faf001_bpattachment" ? Detail.GetAttachments(processId)
                : table == "faf001_bpartifact" ? Detail.GetArtifacts(processId) : Detail.GetOutputs(processId);
            Assert.Equal(2, result.Entities.Count);
            Assert.False(result.MoreRecords);
            Assert.Null(result.PagingCookie);
        }

        [Fact]
        public void TimelineSortsByStartThenIdAndNestsOnlyRelatedMetadata()
        {
            var early = new Entity("faf001_bpstep", Guid.NewGuid()) { ["faf001_stepname"] = "Early", ["faf001_starttime"] = new DateTime(2026, 9, 1), ["faf001_steptype"] = new OptionSetValue(324010001), ["faf001_status"] = new OptionSetValue(324010003) };
            var late = new Entity("faf001_bpstep", Guid.NewGuid()) { ["faf001_stepname"] = "Late", ["faf001_starttime"] = new DateTime(2026, 9, 3) };
            var middle = new Entity("faf001_bpstep", Guid.NewGuid()) { ["faf001_stepname"] = "Fallback", ["createdon"] = new DateTime(2026, 9, 2) };
            var output = new Entity("faf001_bpdatavalue", Guid.NewGuid()) { ["faf001_datakey"] = "review.decision", ["faf001_datatype"] = new OptionSetValue(324010000), ["faf001_bpstepid"] = early.ToEntityReference(), ["faf001_valuetext"] = "must-not-leak" };
            var global = new Entity("faf001_bpdatavalue", Guid.NewGuid()) { ["faf001_datakey"] = "global" };
            var artifact = new Entity("faf001_bpartifact", Guid.NewGuid()) { ["faf001_artifactname"] = "Report", ["faf001_artifacttype"] = new OptionSetValue(324010001), ["faf001_bpstepid"] = late.ToEntityReference(), ["faf001_file"] = "must-not-leak" };
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase request) =>
            {
                var query = (QueryExpression)request;
                return new EntityCollection(query.EntityName == "faf001_bpstep" ? new[] { late, middle, early }
                    : query.EntityName == "faf001_bpdatavalue" ? new[] { output, global } : new[] { artifact });
            });
            var result = Detail.GetProcess(processId);
            Assert.Equal(processId, ((Entity)result["faf001_Process"]).Id);
            var json = (string)result["faf001_StepsJson"];
            Assert.DoesNotContain("must-not-leak", json);
            Assert.DoesNotContain("global", json);
            var steps = new JavaScriptSerializer().Deserialize<Dictionary<string, object>[]>(json);
            Assert.Equal(new[] { "Early", "Fallback", "Late" }, steps.Select(step => step["name"]));
            Assert.Equal(324010001, steps[0]["type"]);
            Assert.Equal(324010003, steps[0]["status"]);
            Assert.Null(steps[0]["endDate"]);
            var references = ((System.Collections.IEnumerable)steps[0]["outputs"]).Cast<Dictionary<string, object>>().ToArray();
            Assert.Equal(output.Id.ToString(), Assert.Single(references)["id"]);
            Assert.Equal(3, references[0].Count);
        }

        [Fact]
        public void NoStepsProducesEmptyTimeline()
        {
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());
            Assert.Equal("[]", Detail.GetProcess(processId)["faf001_StepsJson"]);
        }

        [Theory]
        [InlineData(324010001, true, "Alex Reviewer")]
        [InlineData(324010001, true, null)]
        [InlineData(324010001, false, null)]
        [InlineData(324010000, true, "Automation Owner")]
        [InlineData(324010006, true, "Agent Owner")]
        public void TimelineIncludesExecutorOnlyForHumanTasks(int stepType, bool hasExecutor, string name)
        {
            var executorId = Guid.NewGuid();
            var step = new Entity("faf001_bpstep", Guid.NewGuid()) { ["faf001_steptype"] = new OptionSetValue(stepType) };
            if (hasExecutor) step["faf001_executedby"] = new EntityReference("systemuser", executorId) { Name = name };
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase request) =>
            {
                var query = Assert.IsType<QueryExpression>(request);
                if (query.EntityName != "faf001_bpstep") return new EntityCollection();
                Assert.Contains("faf001_executedby", query.ColumnSet.Columns);
                return new EntityCollection(new[] { step });
            });
            var json = (string)Detail.GetProcess(processId)["faf001_StepsJson"];
            var summary = Assert.Single(new JavaScriptSerializer().Deserialize<Dictionary<string, object>[]>(json));
            if (stepType == 324010001 && hasExecutor)
            {
                var executor = Assert.IsType<Dictionary<string, object>>(summary["executedBy"]);
                Assert.Equal(executorId.ToString(), executor["id"]);
                Assert.Equal(name, executor["name"]);
                Assert.Equal(2, executor.Count);
            }
            else Assert.Null(summary["executedBy"]);
            service.Verify(value => value.Retrieve("systemuser", It.IsAny<Guid>(), It.IsAny<ColumnSet>()), Times.Never);
        }

        [Fact]
        public void MissingCookieFailsRatherThanReturningPartialMetadata()
        {
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection { MoreRecords = true });
            Assert.Throws<InvalidPluginExecutionException>(() => Detail.GetOutputs(processId));
        }

        [Fact]
        public void DeniedProcessReadNeverQueriesChildren()
        {
            service.Setup(value => value.Retrieve("faf001_bpinstance", processId, It.IsAny<ColumnSet>()))
                .Throws(new FaultException<OrganizationServiceFault>(new OrganizationServiceFault()));
            Assert.Throws<FaultException<OrganizationServiceFault>>(() => Detail.GetAttachments(processId));
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Never);
        }
    }
}