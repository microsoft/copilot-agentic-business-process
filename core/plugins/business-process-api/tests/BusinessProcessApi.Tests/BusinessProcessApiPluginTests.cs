using System;
using System.Collections.Generic;
using System.ServiceModel;
using Faf001.BusinessProcessApi.Api;
using Faf001.BusinessProcessApi.Infrastructure.Execution;
using Faf001.BusinessProcessApi.Repositories;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Xunit;

namespace Faf001.BusinessProcessApi.Tests
{
    public sealed class BusinessProcessApiPluginTests
    {
        private readonly Mock<IOrganizationService> service = new Mock<IOrganizationService>(MockBehavior.Strict);
        private readonly Mock<IOrganizationServiceFactory> factory = new Mock<IOrganizationServiceFactory>(MockBehavior.Strict);
        private readonly Mock<IPluginExecutionContext> context = new Mock<IPluginExecutionContext>();
        private readonly Mock<IServiceProvider> provider = new Mock<IServiceProvider>();
        private readonly ParameterCollection output = new ParameterCollection();
        private readonly Guid callerId = Guid.NewGuid();

        public BusinessProcessApiPluginTests()
        {
            context.SetupGet(value => value.MessageName).Returns(GetTasksPlugin.MessageName);
            context.SetupGet(value => value.Stage).Returns(30);
            context.SetupGet(value => value.Mode).Returns(0);
            context.SetupGet(value => value.UserId).Returns(callerId);
            context.SetupGet(value => value.OutputParameters).Returns(output);
            factory.Setup(value => value.CreateOrganizationService(callerId)).Returns(service.Object);
            provider.Setup(value => value.GetService(typeof(IPluginExecutionContext))).Returns(context.Object);
            provider.Setup(value => value.GetService(typeof(IOrganizationServiceFactory))).Returns(factory.Object);
        }

        [Theory]
        [InlineData(true)]
        [InlineData(false)]
        public void NonTaskActionReceivesInvocationInfrastructureWithoutQueryingTasks(bool hasTracing)
        {
            var tracing = hasTracing ? new Mock<ITracingService>().Object : null;
            provider.Setup(value => value.GetService(typeof(ITracingService))).Returns(tracing);
            context.SetupGet(value => value.MessageName).Returns("faf001_TestOperation");
            ApiExecution captured = null;
            var plugin = new InfrastructureOnlyPlugin(execution => captured = execution);

            plugin.Execute(provider.Object);

            Assert.NotNull(captured);
            Assert.Same(context.Object, captured.Context);
            Assert.Same(service.Object, captured.OrganizationService);
            Assert.Same(tracing, captured.Tracing);
            Assert.Equal("done", output["faf001_Result"]);
            factory.Verify(value => value.CreateOrganizationService(callerId), Times.Once);
            factory.VerifyNoOtherCalls();
            service.VerifyNoOtherCalls();
        }

        private sealed class InfrastructureOnlyPlugin : CustomApiPluginBase
        {
            private readonly Action<ApiExecution> capture;

            public InfrastructureOnlyPlugin(Action<ApiExecution> capture) : base("faf001_TestOperation")
            {
                this.capture = capture;
            }

            protected override ParameterCollection ExecuteOperation(ApiExecution execution)
            {
                capture(execution);
                return new ParameterCollection { ["faf001_Result"] = "done" };
            }
        }

        [Fact]
        public void EmptyTableReturnsEmptyCollectionUsingCallerIdentity()
        {
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());
            new GetTasksPlugin().Execute(provider.Object);
            var tasks = Assert.IsType<EntityCollection>(output[GetTasksPlugin.TasksOutput]);
            Assert.Empty(tasks.Entities);
            Assert.Equal(DataverseTaskRepository.TableName, tasks.EntityName);
            factory.Verify(value => value.CreateOrganizationService(callerId), Times.Once);
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Exactly(4));
            service.VerifyNoOtherCalls();
            factory.VerifyNoOtherCalls();
        }

        [Fact]
        public void ReadsBeyondFiveThousandWithCookieAndStableOrder()
        {
            var firstPage = new EntityCollection { MoreRecords = true, PagingCookie = "first-page-cookie" };
            for (var index = 0; index < 5000; index++)
            {
                firstPage.Entities.Add(new Entity(DataverseTaskRepository.TableName, Guid.NewGuid()));
            }
            var lastTask = new Entity(DataverseTaskRepository.TableName, Guid.NewGuid());
            var lastPage = new EntityCollection();
            lastPage.Entities.Add(lastTask);
            var calls = 0;
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase request) =>
            {
                var query = Assert.IsType<QueryExpression>(request);
                if (query.EntityName != DataverseTaskRepository.TableName) return new EntityCollection();
                calls++;
                Assert.Equal(DataverseTaskRepository.TableName, query.EntityName);
                Assert.False(query.ColumnSet.AllColumns);
                Assert.Contains("faf001_taskname", query.ColumnSet.Columns);
                Assert.DoesNotContain("faf001_inputdata", query.ColumnSet.Columns);
                Assert.Empty(query.Criteria.Conditions);
                Assert.Single(query.Criteria.Filters);
                Assert.Equal(callerId, query.Criteria.Filters[0].Conditions[0].Values[0]);
                Assert.Null(query.TopCount);
                Assert.Equal("faf001_bptaskid", Assert.Single(query.Orders).AttributeName);
                Assert.Equal(OrderType.Ascending, query.Orders[0].OrderType);
                Assert.Equal(5000, query.PageInfo.Count);
                Assert.Equal(calls, query.PageInfo.PageNumber);
                Assert.Equal(calls == 1 ? null : "first-page-cookie", query.PageInfo.PagingCookie);
                Assert.InRange(calls, 1, 2);
                return calls == 1 ? firstPage : lastPage;
            });
            new GetTasksPlugin().Execute(provider.Object);
            var tasks = Assert.IsType<EntityCollection>(output[GetTasksPlugin.TasksOutput]);
            Assert.Equal(5001, tasks.Entities.Count);
            Assert.Same(lastTask, tasks.Entities[5000]);
            Assert.False(tasks.MoreRecords);
            Assert.Null(tasks.PagingCookie);
            Assert.Equal(2, calls);
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Exactly(5));
            service.VerifyNoOtherCalls();
        }

        [Theory]
        [InlineData("Create", 30, 0)]
        [InlineData("faf001_GetTasks", 20, 0)]
        [InlineData("faf001_GetTasks", 30, 1)]
        public void RejectsUnsupportedMessagesAndRegistrations(string message, int stage, int mode)
        {
            context.SetupGet(value => value.MessageName).Returns(message);
            context.SetupGet(value => value.Stage).Returns(stage);
            context.SetupGet(value => value.Mode).Returns(mode);
            Assert.Throws<InvalidPluginExecutionException>(() => new GetTasksPlugin().Execute(provider.Object));
            Assert.Empty(output);
            factory.VerifyNoOtherCalls();
            service.VerifyNoOtherCalls();
        }

        [Fact]
        public void MissingPagingCookieDoesNotReturnPartialResults()
        {
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>()))
                .Returns(new EntityCollection { MoreRecords = true });
            Assert.Throws<InvalidPluginExecutionException>(() => new GetTasksPlugin().Execute(provider.Object));
            Assert.Empty(output);
        }

        [Fact]
        public void AccessDeniedDoesNotReturnPartialResultsOrElevateIdentity()
        {
            var fault = new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = -2147220960 });
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Throws(fault);
            var error = Assert.Throws<InvalidPluginExecutionException>(() => new GetTasksPlugin().Execute(provider.Object));
            Assert.Same(fault, error.InnerException);
            Assert.Empty(output);
            factory.Verify(value => value.CreateOrganizationService(callerId), Times.Once);
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Once);
            factory.VerifyNoOtherCalls();
        }

        [Fact]
        public void ReusedPluginInstanceCreatesServicesForEachCaller()
        {
            var secondCaller = Guid.NewGuid();
            var secondService = new Mock<IOrganizationService>(MockBehavior.Strict);
            var firstTask = new Entity(DataverseTaskRepository.TableName, Guid.NewGuid());
            var secondTask = new Entity(DataverseTaskRepository.TableName, Guid.NewGuid());
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>()))
                .Returns(new EntityCollection(new[] { firstTask }));
            secondService.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>()))
                .Returns(new EntityCollection(new[] { secondTask }));
            factory.Setup(value => value.CreateOrganizationService(secondCaller)).Returns(secondService.Object);
            var plugin = new GetTasksPlugin();
            plugin.Execute(provider.Object);
            Assert.Same(firstTask, Assert.Single(((EntityCollection)output[GetTasksPlugin.TasksOutput]).Entities));
            context.SetupGet(value => value.UserId).Returns(secondCaller);
            var secondOutput = new ParameterCollection();
            context.SetupGet(value => value.OutputParameters).Returns(secondOutput);
            plugin.Execute(provider.Object);
            Assert.Same(secondTask, Assert.Single(((EntityCollection)secondOutput[GetTasksPlugin.TasksOutput]).Entities));
            Assert.Same(firstTask, Assert.Single(((EntityCollection)output[GetTasksPlugin.TasksOutput]).Entities));
            factory.Verify(value => value.CreateOrganizationService(callerId), Times.Once);
            factory.Verify(value => value.CreateOrganizationService(secondCaller), Times.Once);
        }

        [Fact]
        public void LaterPageFailureDoesNotReturnEarlierRows()
        {
            var first = new EntityCollection(new[] { new Entity(DataverseTaskRepository.TableName, Guid.NewGuid()) })
            { MoreRecords = true, PagingCookie = "cookie" };
            service.SetupSequence(value => value.RetrieveMultiple(It.IsAny<QueryBase>()))
                .Returns(first).Throws(new FaultException<OrganizationServiceFault>(new OrganizationServiceFault()));
            Assert.Throws<InvalidPluginExecutionException>(() => new GetTasksPlugin().Execute(provider.Object));
            Assert.Empty(output);
        }

        [Fact]
        public void UnexpectedErrorsAreSanitizedAndTracedWithCorrelation()
        {
            const string sensitive = "task payload and credential";
            var correlation = Guid.NewGuid();
            context.SetupGet(value => value.CorrelationId).Returns(correlation);
            var traces = new List<string>();
            var tracing = new Mock<ITracingService>();
            tracing.Setup(value => value.Trace(It.IsAny<string>(), It.IsAny<object[]>()))
                .Callback((string format, object[] arguments) => traces.Add(string.Format(format, arguments)));
            provider.Setup(value => value.GetService(typeof(ITracingService))).Returns(tracing.Object);
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Throws(new Exception(sensitive));
            var error = Assert.Throws<InvalidPluginExecutionException>(() => new GetTasksPlugin().Execute(provider.Object));
            Assert.Contains(correlation.ToString(), error.Message);
            Assert.DoesNotContain(sensitive, error.ToString());
            Assert.Contains(traces, trace => trace.Contains(correlation.ToString()) && trace.Contains("failed"));
            Assert.DoesNotContain(traces, trace => trace.Contains(sensitive));
            Assert.Empty(output);
        }

        [Fact]
        public void EmptyExecutionUserCannotCreateElevatedService()
        {
            context.SetupGet(value => value.UserId).Returns(Guid.Empty);
            Assert.Throws<InvalidPluginExecutionException>(() => new GetTasksPlugin().Execute(provider.Object));
            factory.VerifyNoOtherCalls();
            service.VerifyNoOtherCalls();
        }
    }
}