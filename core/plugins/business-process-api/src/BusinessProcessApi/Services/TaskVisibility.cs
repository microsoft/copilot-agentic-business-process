using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Faf001.BusinessProcessApi.Services
{
    public sealed class TaskVisibility
    {
        private readonly Guid caller;
        private readonly HashSet<Guid> teams;
        private readonly HashSet<Guid> roles;

        public TaskVisibility(Guid caller, IEnumerable<Guid> teams, IEnumerable<Guid> roles)
        {
            if (caller == Guid.Empty) throw new InvalidPluginExecutionException("A caller is required.");
            this.caller = caller;
            this.teams = new HashSet<Guid>(teams);
            this.roles = new HashSet<Guid>(roles);
        }

        public bool Allows(Entity task)
        {
            var assigned = task.GetAttributeValue<EntityReference>("faf001_assignedto");
            if (assigned != null) return assigned.Id == caller;
            var role = task.GetAttributeValue<EntityReference>("faf001_requiredrole");
            if (role != null) return roles.Contains(role.Id);
            var team = task.GetAttributeValue<EntityReference>("faf001_assignedteam");
            return team != null && teams.Contains(team.Id);
        }

        public FilterExpression CreateFilter()
        {
            var visible = new FilterExpression(LogicalOperator.Or);
            visible.AddCondition("faf001_assignedto", ConditionOperator.Equal, caller);
            var eligible = visible.AddFilter(LogicalOperator.And);
            eligible.AddCondition("faf001_assignedto", ConditionOperator.Null);
            var routing = eligible.AddFilter(LogicalOperator.Or);
            if (roles.Count > 0)
                routing.AddCondition("faf001_requiredrole", ConditionOperator.In, roles.Cast<object>().ToArray());
            var teamRouting = routing.AddFilter(LogicalOperator.And);
            teamRouting.AddCondition("faf001_requiredrole", ConditionOperator.Null);
            teamRouting.AddCondition("faf001_assignedteam", ConditionOperator.In,
                (teams.Count > 0 ? teams : new HashSet<Guid> { Guid.Empty }).Cast<object>().ToArray());
            return visible;
        }
    }
}