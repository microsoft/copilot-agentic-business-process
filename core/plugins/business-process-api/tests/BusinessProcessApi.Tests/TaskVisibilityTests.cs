using System;
using System.Linq;
using Faf001.BusinessProcessApi.Repositories;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Xunit;

namespace Faf001.BusinessProcessApi.Tests
{
    public sealed class TaskVisibilityTests
    {
        [Theory]
        [InlineData(0, false, false, false)]
        [InlineData(0, true, false, true)]
        [InlineData(0, false, true, true)]
        [InlineData(0, true, true, true)]
        [InlineData(1, false, false, true)]
        [InlineData(2, true, true, false)]
        public void AssignmentTakesPrecedenceOverRouting(int assignment, bool teamMember, bool roleMember, bool expected)
        {
            var caller = Guid.NewGuid();
            var team = Guid.NewGuid();
            var role = Guid.NewGuid();
            var task = new Entity("faf001_bptask");
            if (assignment != 0) task["faf001_assignedto"] = new EntityReference("systemuser", assignment == 1 ? caller : Guid.NewGuid());
            if (teamMember) task["faf001_assignedteam"] = new EntityReference("team", team);
            if (roleMember) task["faf001_requiredrole"] = new EntityReference("role", role);
            var visibility = new TaskVisibility(caller, new[] { team }, new[] { role });
            Assert.Equal(expected, visibility.Allows(task));
        }

        [Fact]
        public void RequiredRoleCannotBeBypassedByTeamMembership()
        {
            var team = Guid.NewGuid();
            var task = new Entity("faf001_bptask")
            {
                ["faf001_assignedteam"] = new EntityReference("team", team),
                ["faf001_requiredrole"] = new EntityReference("role", Guid.NewGuid())
            };
            Assert.False(new TaskVisibility(Guid.NewGuid(), new[] { team }, new Guid[0]).Allows(task));
        }

        [Fact]
        public void QueryPredicateMatchesClaimPolicyForEveryAssignmentTeamRoleCombination()
        {
            var caller = Guid.NewGuid();
            var team = Guid.NewGuid();
            var role = Guid.NewGuid();
            foreach (var memberships in new[] { false, true })
            {
                var policy = new TaskVisibility(caller, memberships ? new[] { team } : new Guid[0], memberships ? new[] { role } : new Guid[0]);
                foreach (var assigned in new Guid?[] { null, caller, Guid.NewGuid() })
                foreach (var assignedTeam in new Guid?[] { null, team, Guid.NewGuid() })
                foreach (var requiredRole in new Guid?[] { null, role, Guid.NewGuid() })
                {
                    var task = new Entity("faf001_bptask");
                    if (assigned.HasValue) task["faf001_assignedto"] = new EntityReference("systemuser", assigned.Value);
                    if (assignedTeam.HasValue) task["faf001_assignedteam"] = new EntityReference("team", assignedTeam.Value);
                    if (requiredRole.HasValue) task["faf001_requiredrole"] = new EntityReference("role", requiredRole.Value);
                    Assert.Equal(policy.Allows(task), Matches(policy.CreateFilter(), task));
                }
            }
        }

        [Fact]
        public void ResolvesDirectAndTeamInheritedRolesWithCallerScopedJoinsAndPaging()
        {
            var caller = Guid.NewGuid();
            var team = Guid.NewGuid();
            var directRole = Guid.NewGuid();
            var inheritedRole = Guid.NewGuid();
            var service = new Mock<IOrganizationService>(MockBehavior.Strict);
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase request) =>
            {
                var query = Assert.IsType<QueryExpression>(request);
                Assert.True(query.Distinct);
                Assert.False(query.ColumnSet.AllColumns);
                var link = Assert.Single(query.LinkEntities);
                if (query.EntityName == "team")
                {
                    Assert.Equal("teammembership", link.LinkToEntityName);
                    Assert.Equal(caller, Assert.Single(link.LinkCriteria.Conditions).Values[0]);
                    return new EntityCollection(new[] { new Entity("team", team) });
                }
                Assert.Equal("role", query.EntityName);
                if (link.LinkToEntityName == "systemuserroles")
                {
                    Assert.Equal(caller, Assert.Single(link.LinkCriteria.Conditions).Values[0]);
                    return new EntityCollection(new[] { new Entity("role", directRole) });
                }
                Assert.Equal("teamroles", link.LinkToEntityName);
                var membership = Assert.Single(link.LinkEntities);
                Assert.Equal("teammembership", membership.LinkToEntityName);
                Assert.Equal(caller, Assert.Single(membership.LinkCriteria.Conditions).Values[0]);
                if (query.PageInfo.PageNumber == 1)
                    return new EntityCollection { MoreRecords = true, PagingCookie = "roles-next" };
                Assert.Equal("roles-next", query.PageInfo.PagingCookie);
                return new EntityCollection(new[] { new Entity("role", inheritedRole) });
            });
            var policy = new DataverseTaskAccessRepository(service.Object).GetVisibility(caller);
            foreach (var role in new[] { directRole, inheritedRole })
                Assert.True(policy.Allows(new Entity("faf001_bptask") { ["faf001_requiredrole"] = new EntityReference("role", role) }));
            Assert.True(policy.Allows(new Entity("faf001_bptask") { ["faf001_assignedteam"] = new EntityReference("team", team) }));
            Assert.False(policy.Allows(new Entity("faf001_bptask") { ["faf001_requiredrole"] = new EntityReference("role", Guid.NewGuid()) }));
            service.Verify(value => value.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Exactly(4));
        }

        private static bool Matches(FilterExpression filter, Entity task)
        {
            var results = filter.Conditions.Select(condition =>
            {
                var reference = task.GetAttributeValue<EntityReference>(condition.AttributeName);
                if (condition.Operator == ConditionOperator.Null) return reference == null;
                Assert.True(condition.Operator == ConditionOperator.Equal || condition.Operator == ConditionOperator.In);
                return reference != null && condition.Values.Contains(reference.Id);
            }).Concat(filter.Filters.Select(child => Matches(child, task)));
            return filter.FilterOperator == LogicalOperator.And ? results.All(result => result) : results.Any(result => result);
        }
    }
}