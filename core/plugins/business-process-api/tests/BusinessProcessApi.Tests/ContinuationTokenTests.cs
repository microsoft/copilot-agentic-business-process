using System;
using System.Collections.Generic;
using System.Text;
using System.Web.Script.Serialization;
using Faf001.BusinessProcessApi.Infrastructure.Paging;
using Faf001.BusinessProcessApi.Repositories;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;
using Moq;
using Xunit;

namespace Faf001.BusinessProcessApi.Tests
{
    public sealed class ContinuationTokenTests
    {
        private readonly Guid userId = Guid.NewGuid();
        private readonly Guid organizationId = Guid.NewGuid();
        private readonly ContinuationTokenCodec codec = new ContinuationTokenCodec();

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        public void MissingTokenStartsAtPageOne(string token)
        {
            var cursor = codec.Decode(new TaskQuery { ContinuationToken = token }, userId, organizationId);
            Assert.Equal(1, cursor.PageNumber);
            Assert.Null(cursor.Cookie);
        }

        [Theory]
        [InlineData("not base64")]
        [InlineData("e30=")]
        [InlineData("bnVsbA==")]
        [InlineData("W10=")]
        [InlineData("ew==")]
        public void MalformedTokensFailBeforeRepositoryAccess(string token)
        {
            Reject(new TaskQuery { ContinuationToken = token }, userId, organizationId);
        }

        [Fact]
        public void OversizedTokenFailsBeforeRepositoryAccess()
        {
            Reject(new TaskQuery { ContinuationToken = new string('A', ContinuationTokenCodec.MaximumTokenLength + 1) },
                userId, organizationId);
        }

        [Theory]
        [InlineData("process")]
        [InlineData("status")]
        [InlineData("assignedUser")]
        [InlineData("team")]
        [InlineData("size")]
        [InlineData("caller")]
        [InlineData("organization")]
        public void ChangedQueryOrIdentityRequiresRestart(string change)
        {
            var request = new TaskQuery();
            request.ContinuationToken = codec.Encode(request, userId, organizationId, 2, "cookie");
            if (change == "process") request.ProcessInstanceId = Guid.NewGuid();
            if (change == "status") request.Status = (int)BusinessTaskStatus.Assigned;
            if (change == "assignedUser") request.AssignedUserId = Guid.NewGuid();
            if (change == "team") request.AssignedTeamId = Guid.NewGuid();
            if (change == "size") request.PageSize = 50;
            Reject(request, change == "caller" ? Guid.NewGuid() : userId,
                change == "organization" ? Guid.NewGuid() : organizationId);
        }

        [Theory]
        [InlineData("Version", 2)]
        [InlineData("NextPage", 0)]
        [InlineData("NextPage", -1)]
        [InlineData("NextPage", 1)]
        [InlineData("NextPage", int.MaxValue)]
        [InlineData("Cookie", "")]
        [InlineData("Cookie", null)]
        public void InvalidTokenStateIsRejected(string property, object replacement)
        {
            var request = new TaskQuery();
            var token = codec.Encode(request, userId, organizationId, 2, "cookie");
            var serializer = new JavaScriptSerializer();
            var state = serializer.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(Convert.FromBase64String(token)));
            state[property] = replacement;
            request.ContinuationToken = Convert.ToBase64String(Encoding.UTF8.GetBytes(serializer.Serialize(state)));
            Reject(request, userId, organizationId);
        }

        [Fact]
        public void FullQueryRoundTripsWithoutModifyingCookie()
        {
            const string cookie = "<cookie page=\"7\"><id last=\"x&amp;y&quot;z\" /></cookie>";
            var request = new TaskQuery
            {
                ProcessInstanceId = Guid.NewGuid(), Status = (int)BusinessTaskStatus.InProgress,
                AssignedUserId = Guid.NewGuid(), AssignedTeamId = Guid.NewGuid(), PageSize = 500
            };
            request.ContinuationToken = codec.Encode(request, userId, organizationId, 8, cookie);
            var cursor = codec.Decode(request, userId, organizationId);
            Assert.Equal(8, cursor.PageNumber);
            Assert.Equal(cookie, cursor.Cookie);
        }

        [Fact]
        public void OversizedGeneratedTokenFailsWithoutReturningAnUnusableToken()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => codec.Encode(new TaskQuery(), userId,
                organizationId, 2, new string('A', ContinuationTokenCodec.MaximumTokenLength)));
        }

        private static void Reject(TaskQuery query, Guid caller, Guid organization)
        {
            var repository = new Mock<ITaskRepository>(MockBehavior.Strict);
            var error = Assert.Throws<InvalidPluginExecutionException>(() =>
                new TaskService(repository.Object).GetPage(query, caller, organization));
            Assert.StartsWith("Invalid continuation token", error.Message);
            repository.VerifyNoOtherCalls();
        }
    }
}