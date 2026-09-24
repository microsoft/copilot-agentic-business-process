using System;
using System.Collections.Generic;
using Faf001.BusinessProcessApi.Repositories;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Xunit;

namespace Faf001.BusinessProcessApi.Tests
{
    public sealed class TaskQueryTests
    {
        [Fact]
        public void FiltersUseAndWithAnOrAssignmentGroup()
        {
            var request = new TaskQuery
            {
                ProcessInstanceId = Guid.NewGuid(), Status = (int)BusinessTaskStatus.Assigned,
                AssignedUserId = Guid.NewGuid(), AssignedTeamId = Guid.NewGuid(), PageSize = 50
            };
            var service = new Mock<IOrganizationService>(MockBehavior.Strict);
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase supplied) =>
            {
                var query = Assert.IsType<QueryExpression>(supplied);
                Assert.Equal(LogicalOperator.And, query.Criteria.FilterOperator);
                Assert.Collection(query.Criteria.Conditions,
                    condition => CheckCondition(condition, "faf001_bpinstanceid", request.ProcessInstanceId.Value),
                    condition => CheckCondition(condition, "faf001_status", request.Status.Value));
                var assignment = Assert.Single(query.Criteria.Filters);
                Assert.Equal(LogicalOperator.Or, assignment.FilterOperator);
                Assert.Collection(assignment.Conditions,
                    condition => CheckCondition(condition, "faf001_assignedto", request.AssignedUserId.Value),
                    condition => CheckCondition(condition, "faf001_assignedteam", request.AssignedTeamId.Value));
                Assert.Equal(50, query.PageInfo.Count);
                Assert.Equal(1, query.PageInfo.PageNumber);
                Assert.Null(query.PageInfo.PagingCookie);
                Assert.Null(query.TopCount);
                Assert.False(query.ColumnSet.AllColumns);
                Assert.Equal("faf001_bptaskid", Assert.Single(query.Orders).AttributeName);
                Assert.Equal(OrderType.Ascending, query.Orders[0].OrderType);
                return new EntityCollection();
            });
            var result = new TaskService(new DataverseTaskRepository(service.Object))
                .GetPage(request, Guid.NewGuid(), Guid.NewGuid());
            Assert.False(result.HasMore);
            Assert.Empty(result.NextToken);
            Assert.Empty(result.Tasks.Entities);
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Once);
            service.VerifyNoOtherCalls();
        }

        [Theory]
        [InlineData(0)]
        [InlineData(-1)]
        [InlineData(501)]
        public void InvalidPageSizeFailsBeforeRepositoryAccess(int size)
        {
            var repository = new Mock<ITaskRepository>(MockBehavior.Strict);
            var service = new TaskService(repository.Object);
            Assert.Throws<InvalidPluginExecutionException>(() => service.GetPage(
                new TaskQuery { PageSize = size }, Guid.NewGuid(), Guid.NewGuid()));
            repository.VerifyNoOtherCalls();
        }

        [Fact]
        public void NextPageUsesTheUnmodifiedCookieAndNeverLeaksItInTaskCollection()
        {
            var userId = Guid.NewGuid();
            var organizationId = Guid.NewGuid();
            var request = new TaskQuery();
            const string cookie = "<cookie page=\"1\"><id last=\"A&amp;B\" /></cookie>";
            var repository = new Mock<ITaskRepository>(MockBehavior.Strict);
            repository.Setup(value => value.GetPage(request, 1, null))
                .Returns(new EntityCollection { MoreRecords = true, PagingCookie = cookie });
            repository.Setup(value => value.GetPage(request, 2, cookie)).Returns(new EntityCollection());
            var service = new TaskService(repository.Object);
            var first = service.GetPage(request, userId, organizationId);
            Assert.True(first.HasMore);
            Assert.NotEmpty(first.NextToken);
            Assert.Null(first.Tasks.PagingCookie);
            request.ContinuationToken = first.NextToken;
            var last = service.GetPage(request, userId, organizationId);
            Assert.False(last.HasMore);
            Assert.Empty(last.NextToken);
            repository.VerifyAll();
        }

        public static IEnumerable<object[]> FilterCombinations()
        {
            for (var mask = 0; mask < 16; mask++) yield return new object[] { mask };
        }

        [Theory]
        [MemberData(nameof(FilterCombinations))]
        public void OmittedFiltersDoNotIntroducePredicates(int mask)
        {
            var request = new TaskQuery
            {
                ProcessInstanceId = (mask & 1) != 0 ? Guid.NewGuid() : (Guid?)null,
                Status = (mask & 2) != 0 ? (int)BusinessTaskStatus.Completed : (int?)null,
                AssignedUserId = (mask & 4) != 0 ? Guid.NewGuid() : (Guid?)null,
                AssignedTeamId = (mask & 8) != 0 ? Guid.NewGuid() : (Guid?)null
            };
            var service = new Mock<IOrganizationService>(MockBehavior.Strict);
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase supplied) =>
            {
                var query = Assert.IsType<QueryExpression>(supplied);
                Assert.Equal(LogicalOperator.And, query.Criteria.FilterOperator);
                Assert.Equal(((mask & 1) != 0 ? 1 : 0) + ((mask & 2) != 0 ? 1 : 0), query.Criteria.Conditions.Count);
                var assignmentCount = ((mask & 4) != 0 ? 1 : 0) + ((mask & 8) != 0 ? 1 : 0);
                if (assignmentCount == 0) Assert.Empty(query.Criteria.Filters);
                else
                {
                    var filter = Assert.Single(query.Criteria.Filters);
                    Assert.Equal(LogicalOperator.Or, filter.FilterOperator);
                    Assert.Equal(assignmentCount, filter.Conditions.Count);
                }
                Assert.Equal(100, query.PageInfo.Count);
                return new EntityCollection();
            });
            new TaskService(new DataverseTaskRepository(service.Object)).GetPage(request, Guid.NewGuid(), Guid.NewGuid());
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Once);
        }

        [Theory]
        [InlineData(1)]
        [InlineData(100)]
        [InlineData(500)]
        public void SupportedPageSizesReachRepository(int size)
        {
            var request = new TaskQuery { PageSize = size };
            var repository = new Mock<ITaskRepository>(MockBehavior.Strict);
            repository.Setup(value => value.GetPage(request, 1, null)).Returns(new EntityCollection());
            new TaskService(repository.Object).GetPage(request, Guid.NewGuid(), Guid.NewGuid());
            repository.VerifyAll();
        }

        [Theory]
        [InlineData(0)]
        [InlineData(-1)]
        [InlineData(324010007)]
        public void InvalidStatusFailsBeforeRepositoryAccess(int status)
        {
            var repository = new Mock<ITaskRepository>(MockBehavior.Strict);
            Assert.Throws<InvalidPluginExecutionException>(() => new TaskService(repository.Object).GetPage(
                new TaskQuery { Status = status }, Guid.NewGuid(), Guid.NewGuid()));
            repository.VerifyNoOtherCalls();
        }

        [Theory]
        [InlineData("process")]
        [InlineData("user")]
        [InlineData("team")]
        public void EmptyFilterIdsAreRejected(string field)
        {
            var request = new TaskQuery();
            if (field == "process") request.ProcessInstanceId = Guid.Empty;
            if (field == "user") request.AssignedUserId = Guid.Empty;
            if (field == "team") request.AssignedTeamId = Guid.Empty;
            var repository = new Mock<ITaskRepository>(MockBehavior.Strict);
            Assert.Throws<InvalidPluginExecutionException>(() => new TaskService(repository.Object).GetPage(
                request, Guid.NewGuid(), Guid.NewGuid()));
            repository.VerifyNoOtherCalls();
        }

        [Fact]
        public void MoreRecordsWithoutCookieFailsRatherThanPretendingThePageIsFinal()
        {
            var request = new TaskQuery();
            var repository = new Mock<ITaskRepository>(MockBehavior.Strict);
            repository.Setup(value => value.GetPage(request, 1, null))
                .Returns(new EntityCollection { MoreRecords = true });
            Assert.Throws<InvalidPluginExecutionException>(() => new TaskService(repository.Object).GetPage(
                request, Guid.NewGuid(), Guid.NewGuid()));
        }

        private static void CheckCondition(ConditionExpression condition, string attribute, object value)
        {
            Assert.Equal(attribute, condition.AttributeName);
            Assert.Equal(ConditionOperator.Equal, condition.Operator);
            Assert.Equal(value, Assert.Single(condition.Values));
        }
    }
}