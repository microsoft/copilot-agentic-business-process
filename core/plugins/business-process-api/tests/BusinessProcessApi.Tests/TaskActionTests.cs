using System;
using System.Collections.Generic;
using System.Linq;
using System.ServiceModel;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Xunit;

namespace Faf001.BusinessProcessApi.Tests
{
    public sealed class TaskActionTests
    {
        private readonly Mock<IOrganizationService> service = new Mock<IOrganizationService>(MockBehavior.Strict);
        private readonly Guid caller = Guid.NewGuid();
        private readonly Entity task = new Entity("faf001_bptask", Guid.NewGuid())
        {
            RowVersion = "12",
            ["faf001_taskname"] = "Review order",
            ["faf001_widgetid"] = "order-review-ui",
            ["faf001_status"] = new OptionSetValue(324010001),
            ["statecode"] = new OptionSetValue(0),
            ["faf001_bpinstanceid"] = new EntityReference("faf001_bpinstance", Guid.NewGuid()),
            ["faf001_assignedon"] = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc)
        };
        private readonly Entity humanStep = new Entity("faf001_bpstep", Guid.NewGuid())
        {
            RowVersion = "7",
            ["faf001_steptype"] = new OptionSetValue(324010001),
            ["faf001_status"] = new OptionSetValue(324010002),
            ["statecode"] = new OptionSetValue(0)
        };
        private TaskActionService Actions => new TaskActionService(service.Object, caller);

        public TaskActionTests()
        {
            task["faf001_bpstepid"] = humanStep.ToEntityReference();
            humanStep["faf001_bpinstanceid"] = task["faf001_bpinstanceid"];
            service.Setup(value => value.Retrieve("faf001_bptask", task.Id, It.IsAny<ColumnSet>())).Returns(task);
            service.Setup(value => value.Retrieve("faf001_bpstep", humanStep.Id, It.IsAny<ColumnSet>())).Returns(humanStep);
        }

        [Theory]
        [InlineData(false)]
        [InlineData(true)]
        public void IneligibleNonAssigneeCannotReadInputOrComplete(bool assignedElsewhere)
        {
            if (assignedElsewhere) task["faf001_assignedto"] = new EntityReference("systemuser", Guid.NewGuid());
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.GetTask(task.Id));
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.CompleteTask(task.Id, "{}", true));
            service.Verify(value => value.Retrieve("faf001_bptask", task.Id, It.Is<ColumnSet>(columns => !columns.Columns.Contains("faf001_inputdata"))), Times.Exactly(2));
            service.VerifyNoOtherCalls();
        }

        [Fact]
        public void EligibleUnassignedUserCanPreviewButCannotStartOrComplete()
        {
            var team = Guid.NewGuid();
            task["faf001_assignedteam"] = new EntityReference("team", team);
            task["faf001_inputdata"] = "{\"order\":42}";
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase request) =>
                ((QueryExpression)request).EntityName == "team" ? new EntityCollection(new[] { new Entity("team", team) }) : new EntityCollection());
            Assert.Equal(task["faf001_inputdata"], Actions.GetTask(task.Id)["faf001_inputdata"]);
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.StartTask(task.Id));
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.CompleteTask(task.Id, "{}", true));
            service.Setup(value => value.Retrieve("faf001_bptask", task.Id, It.Is<ColumnSet>(columns => columns.Columns.Contains("faf001_inputdata"))))
                .Returns(new Entity("faf001_bptask", task.Id) { ["faf001_assignedto"] = new EntityReference("systemuser", Guid.NewGuid()) });
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.GetTask(task.Id));
            service.Verify(value => value.Execute(It.IsAny<OrganizationRequest>()), Times.Never);
            service.Verify(value => value.Create(It.IsAny<Entity>()), Times.Never);
        }

        [Theory]
        [InlineData(324010001, 0)]
        [InlineData(324010004, 0)]
        [InlineData(324010001, 1)]
        public void IneligibleOrClosedUnassignedPreviewDoesNotRetrieveInput(int status, int state)
        {
            task["faf001_requiredrole"] = new EntityReference("role", Guid.NewGuid());
            task["faf001_status"] = new OptionSetValue(status);
            task["statecode"] = new OptionSetValue(state);
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.GetTask(task.Id));
            service.Verify(value => value.Retrieve("faf001_bptask", task.Id, It.Is<ColumnSet>(columns => columns.Columns.Contains("faf001_inputdata"))), Times.Never);
        }

        [Fact]
        public void AssigneeReceivesInputAndWidgetAndRechecksAssignment()
        {
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            task["faf001_inputdata"] = "{\"order\":42}";
            var result = Actions.GetTask(task.Id);
            Assert.Equal(task["faf001_inputdata"], result["faf001_inputdata"]);
            Assert.Equal("order-review-ui", result["faf001_widgetid"]);
            service.Verify(value => value.Retrieve("faf001_bptask", task.Id, It.Is<ColumnSet>(columns => columns.Columns.Contains("faf001_inputdata"))), Times.Once);
            service.Setup(value => value.Retrieve("faf001_bptask", task.Id, It.Is<ColumnSet>(columns => columns.Columns.Contains("faf001_inputdata"))))
                .Returns(new Entity("faf001_bptask", task.Id) { ["faf001_assignedto"] = new EntityReference("systemuser", Guid.NewGuid()) });
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.GetTask(task.Id));
        }

        [Theory]
        [InlineData(324010004)]
        [InlineData(324010005)]
        [InlineData(324010006)]
        public void TerminalTasksCannotBeClaimedOrCompleted(int status)
        {
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            task["faf001_status"] = new OptionSetValue(status);
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.AssignTask(task.Id));
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.CompleteTask(task.Id, "{\"outcome\":324010000}", true));
            service.Verify(value => value.Execute(It.IsAny<OrganizationRequest>()), Times.Never);
            service.Verify(value => value.Create(It.IsAny<Entity>()), Times.Never);
        }

        [Theory]
        [InlineData(324010000)]
        [InlineData(324010001)]
        [InlineData(324010003)]
        public void StartSetsTaskAndStepStatusUsingCurrentRowVersions(int status)
        {
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            task["faf001_status"] = new OptionSetValue(status);
            service.Setup(value => value.Execute(It.IsAny<OrganizationRequest>())).Returns((OrganizationRequest request) =>
            {
                var update = Assert.IsType<UpdateRequest>(request);
                var isTask = update.Target.LogicalName == "faf001_bptask";
                Assert.Equal(isTask ? task.Id : humanStep.Id, update.Target.Id);
                Assert.Equal(isTask ? "12" : "7", update.Target.RowVersion);
                Assert.Equal(ConcurrencyBehavior.IfRowVersionMatches, update.ConcurrencyBehavior);
                Assert.Single(update.Target.Attributes);
                Assert.Equal(isTask ? 324010002 : 324010001, update.Target.GetAttributeValue<OptionSetValue>("faf001_status").Value);
                return new UpdateResponse();
            });
            Assert.Equal(task.Id, Actions.StartTask(task.Id));
            service.Verify(value => value.Execute(It.IsAny<OrganizationRequest>()), Times.Exactly(2));
        }

        [Fact]
        public void StartMovesLinkedHumanStepToRunningWithoutCreatingStep()
        {
            var step = new Entity("faf001_bpstep", Guid.NewGuid())
            {
                RowVersion = "7",
                ["faf001_bpinstanceid"] = task["faf001_bpinstanceid"],
                ["faf001_steptype"] = new OptionSetValue(324010001),
                ["faf001_status"] = new OptionSetValue(324010002),
                ["statecode"] = new OptionSetValue(0)
            };
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            task["faf001_bpstepid"] = step.ToEntityReference();
            service.Setup(value => value.Retrieve("faf001_bpstep", step.Id, It.IsAny<ColumnSet>())).Returns(step);
            service.Setup(value => value.Execute(It.IsAny<OrganizationRequest>())).Returns(new UpdateResponse());

            Assert.Equal(task.Id, Actions.StartTask(task.Id));

            service.Verify(value => value.Execute(It.Is<UpdateRequest>(request =>
                request.Target.LogicalName == "faf001_bpstep" && request.Target.Id == step.Id &&
                request.Target.RowVersion == "7" &&
                request.Target.GetAttributeValue<OptionSetValue>("faf001_status").Value == 324010001)), Times.Once);
            service.Verify(value => value.Create(It.IsAny<Entity>()), Times.Never);
        }

        [Fact]
        public void StartIsIdempotentForCurrentAssigneeOnly()
        {
            task["faf001_status"] = new OptionSetValue(324010002);
            humanStep["faf001_status"] = new OptionSetValue(324010001);
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            Assert.Equal(task.Id, Actions.StartTask(task.Id));
            task["faf001_assignedto"] = new EntityReference("systemuser", Guid.NewGuid());
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.StartTask(task.Id));
            task.Attributes.Remove("faf001_assignedto");
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.StartTask(task.Id));
            service.Verify(value => value.Execute(It.IsAny<OrganizationRequest>()), Times.Never);
        }

        [Theory]
        [InlineData(324010004, 0)]
        [InlineData(324010005, 0)]
        [InlineData(324010006, 0)]
        [InlineData(324010001, 1)]
        [InlineData(324010002, 1)]
        public void ClosedOrInactiveTasksCannotStart(int status, int state)
        {
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            task["faf001_status"] = new OptionSetValue(status);
            task["statecode"] = new OptionSetValue(state);
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.StartTask(task.Id));
            service.Verify(value => value.Execute(It.IsAny<OrganizationRequest>()), Times.Never);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("conflict")]
        public void StartRequiresCurrentRowVersion(string version)
        {
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            task.RowVersion = version;
            service.Setup(value => value.Execute(It.IsAny<OrganizationRequest>()))
                .Throws(new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = -2147088254 }));
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.StartTask(task.Id));
            if (version == null) service.Verify(value => value.Execute(It.IsAny<OrganizationRequest>()), Times.Never);
            service.Verify(value => value.Update(It.IsAny<Entity>()), Times.Never);
        }

        [Fact]
        public void StartRejectsEmptyIdentityBeforeReading()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.StartTask(Guid.Empty));
            service.VerifyNoOtherCalls();
        }

        [Fact]
        public void CompletionRequiresAmbientTransactionBeforeReading()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.CompleteTask(task.Id, "{}", false));
            service.VerifyNoOtherCalls();
        }

        [Fact]
        public void ClaimByCurrentAssigneeIsIdempotentButOtherAssigneeIsRejected()
        {
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            Assert.Equal(task.Id, Actions.AssignTask(task.Id));
            task["faf001_assignedto"] = new EntityReference("systemuser", Guid.NewGuid());
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.AssignTask(task.Id));
            service.Verify(value => value.Execute(It.IsAny<OrganizationRequest>()), Times.Never);
        }

        [Fact]
        public void TwoEligibleClaimantsWithSameVersionHaveExactlyOneWinner()
        {
            var team = Guid.NewGuid();
            task["faf001_assignedteam"] = new EntityReference("team", team);
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase request) =>
                ((QueryExpression)request).EntityName == "team" ? new EntityCollection(new[] { new Entity("team", team) }) : new EntityCollection());
            var currentVersion = "12";
            Guid winner = Guid.Empty;
            service.Setup(value => value.Execute(It.IsAny<OrganizationRequest>())).Returns((OrganizationRequest request) =>
            {
                var update = Assert.IsType<UpdateRequest>(request);
                Assert.Equal(ConcurrencyBehavior.IfRowVersionMatches, update.ConcurrencyBehavior);
                if (update.Target.RowVersion != currentVersion)
                    throw new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = -2147088254 });
                currentVersion = "13";
                winner = update.Target.GetAttributeValue<EntityReference>("faf001_assignedto").Id;
                Assert.DoesNotContain("ownerid", update.Target.Attributes.Keys);
                Assert.Equal(324010001, update.Target.GetAttributeValue<OptionSetValue>("faf001_status").Value);
                return new UpdateResponse();
            });
            Assert.Equal(task.Id, Actions.AssignTask(task.Id));
            var loser = new TaskActionService(service.Object, Guid.NewGuid());
            var error = Assert.Throws<InvalidPluginExecutionException>(() => loser.AssignTask(task.Id));
            Assert.Contains("Refresh", error.Message);
            Assert.Equal(caller, winner);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("conflict")]
        public void CompletionWithoutCurrentVersionCannotWriteOutputs(string version)
        {
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            task.RowVersion = version;
            service.Setup(value => value.Execute(It.IsAny<OrganizationRequest>()))
                .Throws(new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = -2147088254 }));
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.CompleteTask(task.Id, "{\"outcome\":324010000}", true));
            service.Verify(value => value.Create(It.IsAny<Entity>()), Times.Never);
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Never);
        }

        [Theory]
        [InlineData(324010000, "approved")]
        [InlineData(324010001, "rejected")]
        [InlineData(324010002, "needs_info")]
        public void CompletionWritesAndLinksOutputsThenCompletesExistingStepWithinTransaction(int outcome, string decision)
        {
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            var events = new List<string>();
            var created = new List<Entity>();
            var stepId = humanStep.Id;
            Entity completedStep = null;
            service.Setup(value => value.Execute(It.IsAny<OrganizationRequest>())).Returns((OrganizationRequest request) =>
            {
                var update = Assert.IsType<UpdateRequest>(request);
                Assert.Equal(ConcurrencyBehavior.IfRowVersionMatches, update.ConcurrencyBehavior);
                if (update.Target.LogicalName == "faf001_bpstep")
                {
                    Assert.Equal(stepId, update.Target.Id);
                    Assert.Equal("7", update.Target.RowVersion);
                    completedStep = update.Target;
                    events.Add("step-completed");
                    return new UpdateResponse();
                }
                Assert.Equal("12", update.Target.RowVersion);
                Assert.Equal(324010004, update.Target.GetAttributeValue<OptionSetValue>("faf001_status").Value);
                Assert.Equal(outcome, update.Target.GetAttributeValue<OptionSetValue>("faf001_outcome").Value);
                Assert.DoesNotContain("faf001_bpstepid", update.Target.Attributes.Keys);
                events.Add("task");
                return new UpdateResponse();
            });
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());
            service.Setup(value => value.Create(It.IsAny<Entity>())).Returns((Entity row) =>
            {
                created.Add(row);
                events.Add(row.LogicalName);
                Assert.Equal("faf001_bpdatavalue", row.LogicalName);
                return Guid.NewGuid();
            });
            service.Setup(value => value.Update(It.IsAny<Entity>())).Callback((Entity row) =>
            {
                Assert.Equal(stepId, row.GetAttributeValue<EntityReference>("faf001_bpstepid").Id);
                events.Add("link");
            });
            Assert.Equal(stepId, Actions.CompleteTask(task.Id, "{\"outcome\":" + outcome + ",\"values\":[{\"key\":\"order\",\"type\":\"json\",\"value\":{\"id\":42}}]}", true));
            Assert.Equal(new[] { "task", "faf001_bpdatavalue", "faf001_bpdatavalue", "faf001_bpdatavalue", "link", "link", "link", "step-completed" }, events);
            Assert.NotNull(completedStep);
            Assert.Equal(324010003, completedStep.GetAttributeValue<OptionSetValue>("faf001_status").Value);
            Assert.Equal(caller, completedStep.GetAttributeValue<EntityReference>("faf001_executedby").Id);
            Assert.True(completedStep.Contains("faf001_endtime"));
            Assert.DoesNotContain("faf001_starttime", completedStep.Attributes.Keys);
            Assert.DoesNotContain("faf001_stepname", completedStep.Attributes.Keys);
            Assert.DoesNotContain("faf001_steptype", completedStep.Attributes.Keys);
            Assert.Equal(stepId, task.GetAttributeValue<EntityReference>("faf001_bpstepid").Id);
            var decisionRow = Assert.Single(created, row => row.GetAttributeValue<string>("faf001_datakey") == "order-review.decision");
            Assert.Equal(decision, decisionRow["faf001_valuetext"]);
            Assert.All(created.Where(row => row.LogicalName == "faf001_bpdatavalue"), row => Assert.Equal(task.Id, row.GetAttributeValue<EntityReference>("faf001_bptaskid").Id));
        }

        [Theory]
        [InlineData("missing")]
        [InlineData("process")]
        [InlineData("type")]
        [InlineData("completed")]
        [InlineData("inactive")]
        public void StartAndCompleteRejectInvalidHumanStepBeforeWriting(string invalid)
        {
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            if (invalid == "missing") task.Attributes.Remove("faf001_bpstepid");
            if (invalid == "process") humanStep["faf001_bpinstanceid"] = new EntityReference("faf001_bpinstance", Guid.NewGuid());
            if (invalid == "type") humanStep["faf001_steptype"] = new OptionSetValue(324010006);
            if (invalid == "completed") humanStep["faf001_status"] = new OptionSetValue(324010003);
            if (invalid == "inactive") humanStep["statecode"] = new OptionSetValue(1);
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.StartTask(task.Id));
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.CompleteTask(task.Id, "{\"outcome\":324010000}", true));
            service.Verify(value => value.Execute(It.IsAny<OrganizationRequest>()), Times.Never);
            service.Verify(value => value.Create(It.IsAny<Entity>()), Times.Never);
            service.Verify(value => value.Update(It.IsAny<Entity>()), Times.Never);
        }

        [Fact]
        public void OutputOwnedByAnotherTaskFailsWithoutCreatingStep()
        {
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            service.Setup(value => value.Execute(It.IsAny<OrganizationRequest>())).Returns(new UpdateResponse());
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection(new[]
            {
                new Entity("faf001_bpdatavalue", Guid.NewGuid()) { ["faf001_bptaskid"] = new EntityReference("faf001_bptask", Guid.NewGuid()) }
            }));
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.CompleteTask(task.Id, "{\"outcome\":324010000}", true));
            service.Verify(value => value.Create(It.IsAny<Entity>()), Times.Never);
        }

        [Theory]
        [InlineData(false)]
        [InlineData(true)]
        public void ClaimDeniedForUnroutedTaskOrMissingRequiredRole(bool teamMember)
        {
            var team = Guid.NewGuid();
            if (teamMember)
            {
                task["faf001_assignedteam"] = new EntityReference("team", team);
                task["faf001_requiredrole"] = new EntityReference("role", Guid.NewGuid());
            }
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase query) =>
                ((QueryExpression)query).EntityName == "team" ? new EntityCollection(new[] { new Entity("team", team) }) : new EntityCollection());
            Assert.Throws<InvalidPluginExecutionException>(() => Actions.AssignTask(task.Id));
            service.Verify(value => value.Execute(It.IsAny<OrganizationRequest>()), Times.Never);
        }

        [Fact]
        public void SameTaskOutputUpdatesConditionallyAndClearsStaleTypedValues()
        {
            var outputId = Guid.NewGuid();
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection(new[]
            {
                new Entity("faf001_bpdatavalue", outputId) { RowVersion = "8", ["faf001_bptaskid"] = task.ToEntityReference() }
            }));
            service.Setup(value => value.Execute(It.IsAny<OrganizationRequest>())).Returns((OrganizationRequest request) =>
            {
                var update = Assert.IsType<UpdateRequest>(request);
                Assert.Equal(outputId, update.Target.Id);
                Assert.Equal("8", update.Target.RowVersion);
                Assert.Equal(ConcurrencyBehavior.IfRowVersionMatches, update.ConcurrencyBehavior);
                Assert.Null(update.Target["faf001_valuejson"]);
                Assert.Null(update.Target["faf001_valuenumber"]);
                Assert.Equal("approved", update.Target["faf001_valuetext"]);
                return new UpdateResponse();
            });
            var submission = WidgetSubmission.Parse("{\"outcome\":324010000}", task);
            var repository = new Faf001.BusinessProcessApi.Repositories.DataverseTaskWriteRepository(service.Object);
            Assert.Equal(outputId, repository.WriteOutput(submission.Outputs[0], task.GetAttributeValue<EntityReference>("faf001_bpinstanceid"), task.Id));
            service.Verify(value => value.Create(It.IsAny<Entity>()), Times.Never);
        }

        [Fact]
        public void OutputFailurePropagatesWithoutCreatingCompletionStep()
        {
            task["faf001_assignedto"] = new EntityReference("systemuser", caller);
            service.Setup(value => value.Execute(It.IsAny<OrganizationRequest>())).Returns(new UpdateResponse());
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());
            service.Setup(value => value.Create(It.Is<Entity>(row => row.LogicalName == "faf001_bpdatavalue")))
                .Throws(new FaultException<OrganizationServiceFault>(new OrganizationServiceFault()));
            Assert.Throws<FaultException<OrganizationServiceFault>>(() => Actions.CompleteTask(task.Id, "{\"outcome\":324010000}", true));
            service.Verify(value => value.Create(It.Is<Entity>(row => row.LogicalName == "faf001_bpstep")), Times.Never);
        }
    }
}