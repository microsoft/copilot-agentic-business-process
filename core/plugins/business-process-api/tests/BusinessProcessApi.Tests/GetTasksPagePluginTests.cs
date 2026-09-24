using System;
using System.Collections.Generic;
using System.ServiceModel;
using Faf001.BusinessProcessApi.Api;
using Faf001.BusinessProcessApi.Repositories;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Xunit;

namespace Faf001.BusinessProcessApi.Tests
{
    public sealed class GetTasksPagePluginTests
    {
        private readonly Mock<IOrganizationService> service = new Mock<IOrganizationService>(MockBehavior.Strict);
        private readonly Mock<IOrganizationServiceFactory> factory = new Mock<IOrganizationServiceFactory>(MockBehavior.Strict);
        private readonly Mock<IPluginExecutionContext> context = new Mock<IPluginExecutionContext>();
        private readonly Mock<IServiceProvider> provider = new Mock<IServiceProvider>();
        private readonly ParameterCollection inputs = new ParameterCollection();
        private readonly ParameterCollection outputs = new ParameterCollection();
        private readonly Guid caller = Guid.NewGuid();

        public GetTasksPagePluginTests()
        {
            context.SetupGet(value => value.MessageName).Returns(GetTasksPagePlugin.MessageName);
            context.SetupGet(value => value.Stage).Returns(30);
            context.SetupGet(value => value.Mode).Returns(0);
            context.SetupGet(value => value.UserId).Returns(caller);
            context.SetupGet(value => value.InitiatingUserId).Returns(Guid.NewGuid());
            context.SetupGet(value => value.OrganizationId).Returns(Guid.NewGuid());
            context.SetupGet(value => value.InputParameters).Returns(inputs);
            context.SetupGet(value => value.OutputParameters).Returns(outputs);
            factory.Setup(value => value.CreateOrganizationService(caller)).Returns(service.Object);
            provider.Setup(value => value.GetService(typeof(IPluginExecutionContext))).Returns(context.Object);
            provider.Setup(value => value.GetService(typeof(IOrganizationServiceFactory))).Returns(factory.Object);
        }

        [Fact]
        public void MapsInputsAndThreeOutputsAcrossPages()
        {
            inputs[GetTasksPagePlugin.ProcessInstanceInput] = Guid.NewGuid();
            inputs[GetTasksPagePlugin.StatusInput] = (int)BusinessTaskStatus.Assigned;
            inputs[GetTasksPagePlugin.AssignedUserInput] = Guid.NewGuid();
            inputs[GetTasksPagePlugin.AssignedTeamInput] = Guid.NewGuid();
            inputs[GetTasksPagePlugin.PageSizeInput] = 1;
            var task = new Entity(DataverseTaskRepository.TableName, Guid.NewGuid());
            var calls = 0;
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase supplied) =>
            {
                var query = Assert.IsType<QueryExpression>(supplied);
                if (query.EntityName != DataverseTaskRepository.TableName) return new EntityCollection();
                calls++;
                Assert.Equal(1, query.PageInfo.Count);
                Assert.Equal(calls, query.PageInfo.PageNumber);
                Assert.Equal(calls == 1 ? null : "server-cookie", query.PageInfo.PagingCookie);
                Assert.Equal(inputs[GetTasksPagePlugin.ProcessInstanceInput], query.Criteria.Conditions[0].Values[0]);
                Assert.Equal(inputs[GetTasksPagePlugin.StatusInput], query.Criteria.Conditions[1].Values[0]);
                Assert.Equal(caller, query.Criteria.Filters[0].Conditions[0].Values[0]);
                Assert.DoesNotContain("faf001_inputdata", query.ColumnSet.Columns);
                Assert.Equal(inputs[GetTasksPagePlugin.AssignedUserInput], query.Criteria.Filters[1].Conditions[0].Values[0]);
                Assert.Equal(inputs[GetTasksPagePlugin.AssignedTeamInput], query.Criteria.Filters[1].Conditions[1].Values[0]);
                return calls == 1
                    ? new EntityCollection(new[] { task }) { MoreRecords = true, PagingCookie = "server-cookie" }
                    : new EntityCollection();
            });
            var plugin = new GetTasksPagePlugin();
            plugin.Execute(provider.Object);
            Assert.Equal(3, outputs.Count);
            Assert.True((bool)outputs[GetTasksPagePlugin.HasMoreOutput]);
            Assert.Same(task, Assert.Single(((EntityCollection)outputs[GetTasksPagePlugin.TasksOutput]).Entities));
            inputs[GetTasksPagePlugin.TokenInput] = Assert.IsType<string>(outputs[GetTasksPagePlugin.NextTokenOutput]);
            outputs.Clear();
            plugin.Execute(provider.Object);
            Assert.False((bool)outputs[GetTasksPagePlugin.HasMoreOutput]);
            Assert.Equal(string.Empty, outputs[GetTasksPagePlugin.NextTokenOutput]);
            Assert.Empty(((EntityCollection)outputs[GetTasksPagePlugin.TasksOutput]).Entities);
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Exactly(8));
            service.VerifyNoOtherCalls();
            factory.Verify(value => value.CreateOrganizationService(caller), Times.Exactly(2));
            factory.VerifyNoOtherCalls();
        }

        public static IEnumerable<object[]> InvalidInputs()
        {
            yield return new object[] { GetTasksPagePlugin.ProcessInstanceInput, "not-a-guid" };
            yield return new object[] { GetTasksPagePlugin.AssignedUserInput, "not-a-guid" };
            yield return new object[] { GetTasksPagePlugin.AssignedTeamInput, "not-a-guid" };
            yield return new object[] { GetTasksPagePlugin.StatusInput, "Assigned" };
            yield return new object[] { GetTasksPagePlugin.StatusInput, -1 };
            yield return new object[] { GetTasksPagePlugin.PageSizeInput, -1 };
            yield return new object[] { GetTasksPagePlugin.PageSizeInput, "100" };
            yield return new object[] { GetTasksPagePlugin.PageSizeInput, 501 };
            yield return new object[] { GetTasksPagePlugin.TokenInput, 12 };
            yield return new object[] { GetTasksPagePlugin.TokenInput, "invalid" };
        }

        [Theory]
        [MemberData(nameof(InvalidInputs))]
        public void InvalidInputsNeverQueryOrProduceOutputs(string name, object value)
        {
            inputs[name] = value;
            Assert.Throws<InvalidPluginExecutionException>(() => new GetTasksPagePlugin().Execute(provider.Object));
            Assert.Empty(outputs);
            service.VerifyNoOtherCalls();
        }

        [Theory]
        [InlineData(false)]
        [InlineData(true)]
        public void NullAndPlatformDefaultInputsAndUnknownExtensionsAreAllowed(bool platformDefaults)
        {
            inputs[GetTasksPagePlugin.ProcessInstanceInput] = platformDefaults ? (object)Guid.Empty : null;
            inputs[GetTasksPagePlugin.AssignedUserInput] = platformDefaults ? (object)Guid.Empty : null;
            inputs[GetTasksPagePlugin.AssignedTeamInput] = platformDefaults ? (object)Guid.Empty : null;
            inputs[GetTasksPagePlugin.StatusInput] = platformDefaults ? (object)0 : null;
            inputs[GetTasksPagePlugin.PageSizeInput] = platformDefaults ? (object)0 : null;
            inputs[GetTasksPagePlugin.TokenInput] = null;
            inputs["optional_extension"] = "ignored";
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase supplied) =>
            {
                var query = Assert.IsType<QueryExpression>(supplied);
                if (query.EntityName != DataverseTaskRepository.TableName) return new EntityCollection();
                Assert.Equal(100, query.PageInfo.Count);
                Assert.Empty(query.Criteria.Conditions);
                Assert.Single(query.Criteria.Filters);
                Assert.Equal(caller, query.Criteria.Filters[0].Conditions[0].Values[0]);
                return new EntityCollection();
            });
            new GetTasksPagePlugin().Execute(provider.Object);
            Assert.False((bool)outputs[GetTasksPagePlugin.HasMoreOutput]);
        }

        [Theory]
        [InlineData("faf001_GetTasks", 30, 0)]
        [InlineData("faf001_GetTasksPage", 20, 0)]
        [InlineData("faf001_GetTasksPage", 30, 1)]
        public void RejectsWrongRegistrationBeforeCreatingService(string message, int stage, int mode)
        {
            context.SetupGet(value => value.MessageName).Returns(message);
            context.SetupGet(value => value.Stage).Returns(stage);
            context.SetupGet(value => value.Mode).Returns(mode);
            Assert.Throws<InvalidPluginExecutionException>(() => new GetTasksPagePlugin().Execute(provider.Object));
            factory.VerifyNoOtherCalls();
            service.VerifyNoOtherCalls();
            Assert.Empty(outputs);
        }

        [Fact]
        public void PagingFailureDoesNotSetAnyOutput()
        {
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>()))
                .Returns(new EntityCollection { MoreRecords = true });
            Assert.Throws<InvalidPluginExecutionException>(() => new GetTasksPagePlugin().Execute(provider.Object));
            Assert.Empty(outputs);
        }

        [Fact]
        public void AccessFaultDoesNotElevateOrReturnAnEmptySuccess()
        {
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>()))
                .Throws(new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = -2147220960 }));
            Assert.Throws<InvalidPluginExecutionException>(() => new GetTasksPagePlugin().Execute(provider.Object));
            Assert.Empty(outputs);
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Once);
            service.VerifyNoOtherCalls();
            factory.Verify(value => value.CreateOrganizationService(caller), Times.Once);
            factory.VerifyNoOtherCalls();
        }
    }
}