using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.ServiceModel;
using System.Text;
using System.Xml.Linq;
using Faf001.BusinessProcessApi.Api;
using Faf001.BusinessProcessApi.Infrastructure.Paging;
using Faf001.BusinessProcessApi.Repositories;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Xunit;

namespace Faf001.BusinessProcessApi.Tests
{
    public sealed class GetProcessesPluginTests
    {
        private readonly Mock<IOrganizationService> service = new Mock<IOrganizationService>(MockBehavior.Strict);
        private readonly Mock<IOrganizationServiceFactory> factory = new Mock<IOrganizationServiceFactory>(MockBehavior.Strict);
        private readonly Mock<IPluginExecutionContext> context = new Mock<IPluginExecutionContext>();
        private readonly Mock<IServiceProvider> provider = new Mock<IServiceProvider>();
        private readonly ParameterCollection inputs = new ParameterCollection();
        private readonly ParameterCollection outputs = new ParameterCollection();
        private readonly Guid caller = Guid.NewGuid();
        private readonly Guid organization = Guid.NewGuid();

        public GetProcessesPluginTests()
        {
            context.SetupGet(value => value.MessageName).Returns(GetProcessesPlugin.MessageName);
            context.SetupGet(value => value.Stage).Returns(30);
            context.SetupGet(value => value.Mode).Returns(0);
            context.SetupGet(value => value.UserId).Returns(caller);
            context.SetupGet(value => value.InitiatingUserId).Returns(Guid.NewGuid());
            context.SetupGet(value => value.OrganizationId).Returns(organization);
            context.SetupGet(value => value.InputParameters).Returns(inputs);
            context.SetupGet(value => value.OutputParameters).Returns(outputs);
            factory.Setup(value => value.CreateOrganizationService(caller)).Returns(service.Object);
            provider.Setup(value => value.GetService(typeof(IPluginExecutionContext))).Returns(context.Object);
            provider.Setup(value => value.GetService(typeof(IOrganizationServiceFactory))).Returns(factory.Object);
        }

        [Theory]
        [InlineData(null)]
        [InlineData(324010000)]
        [InlineData(324010001)]
        [InlineData(324010002)]
        [InlineData(324010003)]
        [InlineData(324010004)]
        [InlineData(324010005)]
        [InlineData(324010006)]
        [InlineData(324010007)]
        public void ReadsOnePageUsingOnlyOptionalStatusAndCallerIdentity(int? status)
        {
            if (status.HasValue) inputs[GetProcessesPlugin.StatusInput] = status.Value;
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase supplied) =>
            {
                var query = Assert.IsType<QueryExpression>(supplied);
                Assert.Equal(DataverseProcessRepository.TableName, query.EntityName);
                Assert.Equal(100, query.PageInfo.Count);
                Assert.Equal(1, query.PageInfo.PageNumber);
                Assert.Null(query.PageInfo.PagingCookie);
                Assert.Null(query.TopCount);
                Assert.Empty(query.LinkEntities);
                Assert.Empty(query.Criteria.Filters);
                Assert.Equal(LogicalOperator.And, query.Criteria.FilterOperator);
                Assert.Equal(status.HasValue ? 1 : 0, query.Criteria.Conditions.Count);
                if (status.HasValue)
                {
                    var condition = Assert.Single(query.Criteria.Conditions);
                    Assert.Equal("faf001_status", condition.AttributeName);
                    Assert.Equal(ConditionOperator.Equal, condition.Operator);
                    Assert.Equal(status.Value, Assert.Single(condition.Values));
                }
                var order = Assert.Single(query.Orders);
                Assert.Equal("faf001_bpinstanceid", order.AttributeName);
                Assert.Equal(OrderType.Ascending, order.OrderType);
                Assert.False(query.ColumnSet.AllColumns);
                var metadata = XDocument.Load(Path.Combine(AppContext.BaseDirectory, "metadata", "faf001_bpinstance.xml"));
                var attributes = metadata.Descendants("attribute").Select(value => (string)value.Attribute("PhysicalName"))
                    .Where(value => value != null).Select(value => value.ToLowerInvariant()).ToArray();
                Assert.Equal(23, query.ColumnSet.Columns.Count);
                Assert.All(query.ColumnSet.Columns, column => Assert.Contains(column, attributes));
                var customAttributes = attributes.Where(value => value.StartsWith("faf001_"));
                Assert.Equal(customAttributes.OrderBy(value => value),
                    query.ColumnSet.Columns.Where(value => value.StartsWith("faf001_")).OrderBy(value => value));
                return new EntityCollection();
            });

            new GetProcessesPlugin().Execute(provider.Object);

            var processes = Assert.IsType<EntityCollection>(outputs[GetProcessesPlugin.ProcessesOutput]);
            Assert.Equal(DataverseProcessRepository.TableName, processes.EntityName);
            Assert.Empty(processes.Entities);
            Assert.Equal(3, outputs.Count);
            Assert.Equal(false, outputs[GetProcessesPlugin.HasMoreOutput]);
            Assert.Equal(string.Empty, outputs[GetProcessesPlugin.NextTokenOutput]);
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Once);
            service.VerifyNoOtherCalls();
            factory.Verify(value => value.CreateOrganizationService(caller), Times.Once);
            factory.VerifyNoOtherCalls();
        }

        [Theory]
        [InlineData(1)]
        [InlineData(500)]
        public void TraversesPagesWithoutLeakingRawPagingProperties(int pageSize)
        {
            const string cookie = "<cookie page=\"1\"><id last=\"record\" /></cookie>";
            inputs[GetProcessesPlugin.StatusInput] = (int)BusinessProcessStatus.Running;
            inputs[GetProcessesPlugin.PageSizeInput] = pageSize;
            var process = new Entity(DataverseProcessRepository.TableName, Guid.NewGuid());
            var calls = 0;
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase supplied) =>
            {
                calls++;
                var query = Assert.IsType<QueryExpression>(supplied);
                Assert.Equal(pageSize, query.PageInfo.Count);
                Assert.Equal(calls, query.PageInfo.PageNumber);
                Assert.Equal(calls == 1 ? null : cookie, query.PageInfo.PagingCookie);
                Assert.Equal((int)BusinessProcessStatus.Running, Assert.Single(query.Criteria.Conditions).Values[0]);
                return calls == 1
                    ? new EntityCollection(new[] { process }) { MoreRecords = true, PagingCookie = cookie, TotalRecordCount = 10 }
                    : new EntityCollection();
            });
            var plugin = new GetProcessesPlugin();
            plugin.Execute(provider.Object);
            var collection = Assert.IsType<EntityCollection>(outputs[GetProcessesPlugin.ProcessesOutput]);
            Assert.Same(process, Assert.Single(collection.Entities));
            Assert.False(collection.MoreRecords);
            Assert.Null(collection.PagingCookie);
            Assert.NotEqual(10, collection.TotalRecordCount);
            Assert.Equal(true, outputs[GetProcessesPlugin.HasMoreOutput]);
            var token = Assert.IsType<string>(outputs[GetProcessesPlugin.NextTokenOutput]);
            Assert.NotEmpty(token);
            inputs[GetProcessesPlugin.TokenInput] = token;
            outputs.Clear();
            plugin.Execute(provider.Object);
            Assert.Equal(false, outputs[GetProcessesPlugin.HasMoreOutput]);
            Assert.Equal(string.Empty, outputs[GetProcessesPlugin.NextTokenOutput]);
            Assert.Empty(((EntityCollection)outputs[GetProcessesPlugin.ProcessesOutput]).Entities);
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Exactly(2));
            service.VerifyNoOtherCalls();
        }

        public static IEnumerable<object[]> InvalidInputs()
        {
            yield return new object[] { GetProcessesPlugin.StatusInput, "Running" };
            yield return new object[] { GetProcessesPlugin.StatusInput, new OptionSetValue(324010001) };
            yield return new object[] { GetProcessesPlugin.StatusInput, -1 };
            yield return new object[] { GetProcessesPlugin.StatusInput, 324010008 };
            yield return new object[] { GetProcessesPlugin.PageSizeInput, "100" };
            yield return new object[] { GetProcessesPlugin.PageSizeInput, -1 };
            yield return new object[] { GetProcessesPlugin.PageSizeInput, 501 };
            yield return new object[] { GetProcessesPlugin.TokenInput, 12 };
            yield return new object[] { GetProcessesPlugin.TokenInput, "invalid" };
            yield return new object[] { GetProcessesPlugin.TokenInput, new string('A', ContinuationTokenCodec.MaximumTokenLength + 1) };
            yield return new object[] { GetProcessesPlugin.TokenInput, Convert.ToBase64String(Encoding.UTF8.GetBytes("null")) };
        }

        [Theory]
        [MemberData(nameof(InvalidInputs))]
        public void InvalidInputDoesNotQueryOrPublishOutputs(string name, object value)
        {
            inputs[name] = value;
            Assert.Throws<InvalidPluginExecutionException>(() => new GetProcessesPlugin().Execute(provider.Object));
            Assert.Empty(outputs);
            service.VerifyNoOtherCalls();
        }

        [Theory]
        [InlineData(null)]
        [InlineData(0)]
        public void NullAndPlatformDefaultInputsUseDefaults(int? optionalValue)
        {
            inputs[GetProcessesPlugin.StatusInput] = optionalValue;
            inputs[GetProcessesPlugin.PageSizeInput] = optionalValue;
            inputs[GetProcessesPlugin.TokenInput] = null;
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase supplied) =>
            {
                var query = Assert.IsType<QueryExpression>(supplied);
                Assert.Equal(100, query.PageInfo.Count);
                Assert.Empty(query.Criteria.Conditions);
                return new EntityCollection();
            });
            new GetProcessesPlugin().Execute(provider.Object);
            Assert.Equal(false, outputs[GetProcessesPlugin.HasMoreOutput]);
        }

        [Theory]
        [InlineData("status")]
        [InlineData("pageSize")]
        [InlineData("caller")]
        [InlineData("organization")]
        [InlineData("taskApi")]
        public void ChangedTokenContextIsRejectedBeforeQuery(string change)
        {
            var codec = new ContinuationTokenCodec();
            inputs[GetProcessesPlugin.TokenInput] = change == "taskApi"
                ? codec.Encode(new TaskQuery(), caller, organization, 2, "cookie")
                : codec.Encode(new ProcessQuery(), caller, organization, 2, "cookie");
            if (change == "status") inputs[GetProcessesPlugin.StatusInput] = (int)BusinessProcessStatus.Running;
            if (change == "pageSize") inputs[GetProcessesPlugin.PageSizeInput] = 1;
            if (change == "organization") context.SetupGet(value => value.OrganizationId).Returns(Guid.NewGuid());
            if (change == "caller")
            {
                var otherCaller = Guid.NewGuid();
                context.SetupGet(value => value.UserId).Returns(otherCaller);
                factory.Setup(value => value.CreateOrganizationService(otherCaller)).Returns(service.Object);
            }
            Assert.Throws<InvalidPluginExecutionException>(() => new GetProcessesPlugin().Execute(provider.Object));
            Assert.Empty(outputs);
            service.VerifyNoOtherCalls();
        }

        [Fact]
        public void TaskApiRejectsProcessTokenAndLegacyTaskTokensStillWork()
        {
            var codec = new ContinuationTokenCodec();
            var token = codec.Encode(new ProcessQuery(), caller, organization, 2, "cookie");
            Assert.Throws<InvalidPluginExecutionException>(() => codec.Decode(
                new TaskQuery { ContinuationToken = token }, caller, organization));
            var legacyToken = codec.Encode(new TaskQuery(), caller, organization, 2, "cookie");
            Assert.DoesNotContain("Scope", Encoding.UTF8.GetString(Convert.FromBase64String(legacyToken)));
            var cursor = codec.Decode(new TaskQuery { ContinuationToken = legacyToken }, caller, organization);
            Assert.Equal(2, cursor.PageNumber);
            Assert.Equal("cookie", cursor.Cookie);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        public void MissingServerCookieDoesNotPublishPartialResults(string cookie)
        {
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(
                new EntityCollection(new[] { new Entity(DataverseProcessRepository.TableName, Guid.NewGuid()) })
                { MoreRecords = true, PagingCookie = cookie });
            Assert.Throws<InvalidPluginExecutionException>(() => new GetProcessesPlugin().Execute(provider.Object));
            Assert.Empty(outputs);
        }

        [Fact]
        public void AccessFaultDoesNotElevateOrReturnEmptySuccess()
        {
            var fault = new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = -2147220960 });
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Throws(fault);
            var error = Assert.Throws<InvalidPluginExecutionException>(() => new GetProcessesPlugin().Execute(provider.Object));
            Assert.Same(fault, error.InnerException);
            Assert.Empty(outputs);
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Once);
            service.VerifyNoOtherCalls();
            factory.Verify(value => value.CreateOrganizationService(caller), Times.Once);
            factory.VerifyNoOtherCalls();
        }

        [Theory]
        [InlineData("faf001_GetTasks", 30, 0)]
        [InlineData("faf001_GetProcesses", 20, 0)]
        [InlineData("faf001_GetProcesses", 30, 1)]
        public void WrongRegistrationDoesNotCreateService(string message, int stage, int mode)
        {
            context.SetupGet(value => value.MessageName).Returns(message);
            context.SetupGet(value => value.Stage).Returns(stage);
            context.SetupGet(value => value.Mode).Returns(mode);
            Assert.Throws<InvalidPluginExecutionException>(() => new GetProcessesPlugin().Execute(provider.Object));
            factory.VerifyNoOtherCalls();
            service.VerifyNoOtherCalls();
            Assert.Empty(outputs);
        }

        [Theory]
        [InlineData(true)]
        [InlineData(false)]
        public void MissingExecutionIdentityDoesNotQuery(bool missingCaller)
        {
            if (missingCaller) context.SetupGet(value => value.UserId).Returns(Guid.Empty);
            else context.SetupGet(value => value.OrganizationId).Returns(Guid.Empty);
            Assert.Throws<InvalidPluginExecutionException>(() => new GetProcessesPlugin().Execute(provider.Object));
            Assert.Empty(outputs);
            service.VerifyNoOtherCalls();
        }

        [Fact]
        public void ProcessStatusesMatchCommittedMetadata()
        {
            var metadata = XDocument.Load(Path.Combine(AppContext.BaseDirectory, "metadata", "faf001_bpinstancestatus.xml"));
            var statuses = metadata.Descendants("option").Select(value => (int)value.Attribute("value"));
            Assert.Equal(statuses.OrderBy(value => value), Enum.GetValues(typeof(BusinessProcessStatus)).Cast<int>().OrderBy(value => value));
        }
    }
}