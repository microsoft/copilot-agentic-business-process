using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Xml;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Infrastructure.Paging
{
    public sealed class ContinuationTokenCodec
    {
        public const int MaximumTokenLength = 65536;
        private const int CurrentVersion = 1;

        public PageCursor Decode(TaskQuery query, Guid userId, Guid organizationId)
        {
            return Decode(query.ContinuationToken, CreateState(query, userId, organizationId));
        }

        public string Encode(TaskQuery query, Guid userId, Guid organizationId, int nextPage, string cookie)
        {
            return Encode(CreateState(query, userId, organizationId), nextPage, cookie);
        }

        public PageCursor Decode(ProcessQuery query, Guid userId, Guid organizationId)
        {
            return Decode(query.ContinuationToken, CreateState(query, userId, organizationId));
        }

        public string Encode(ProcessQuery query, Guid userId, Guid organizationId, int nextPage, string cookie)
        {
            return Encode(CreateState(query, userId, organizationId), nextPage, cookie);
        }

        private static ContinuationState CreateState(TaskQuery query, Guid userId, Guid organizationId)
        {
            return new ContinuationState
            {
                UserId = userId, OrganizationId = organizationId,
                ProcessInstanceId = query.ProcessInstanceId, Status = query.Status,
                AssignedUserId = query.AssignedUserId, AssignedTeamId = query.AssignedTeamId,
                PageSize = query.PageSize
            };
        }

        private static ContinuationState CreateState(ProcessQuery query, Guid userId, Guid organizationId)
        {
            return new ContinuationState
            {
                Scope = "faf001_GetProcesses", UserId = userId, OrganizationId = organizationId,
                Status = query.Status, PageSize = query.PageSize
            };
        }

        private static PageCursor Decode(string token, ContinuationState expected)
        {
            if (string.IsNullOrEmpty(token)) return new PageCursor(1, null);
            if (token.Length > MaximumTokenLength) throw InvalidToken();

            ContinuationState state;
            try
            {
                var bytes = Convert.FromBase64String(token);
                using (var stream = new MemoryStream(bytes))
                {
                    state = (ContinuationState)CreateSerializer().ReadObject(stream);
                }
            }
            catch (FormatException) { throw InvalidToken(); }
            catch (SerializationException) { throw InvalidToken(); }
            catch (XmlException) { throw InvalidToken(); }

            if (state == null || state.Version != CurrentVersion || state.NextPage < 2
                || state.NextPage == int.MaxValue || string.IsNullOrEmpty(state.Cookie)
                || state.Cookie.Length > MaximumTokenLength
                || state.Scope != expected.Scope
                || state.UserId != expected.UserId || state.OrganizationId != expected.OrganizationId
                || state.ProcessInstanceId != expected.ProcessInstanceId || state.Status != expected.Status
                || state.AssignedUserId != expected.AssignedUserId || state.AssignedTeamId != expected.AssignedTeamId
                || state.PageSize != expected.PageSize)
            {
                throw InvalidToken();
            }

            return new PageCursor(state.NextPage, state.Cookie);
        }

        private static string Encode(ContinuationState state, int nextPage, string cookie)
        {
            if (nextPage < 2 || nextPage == int.MaxValue || string.IsNullOrEmpty(cookie)
                || cookie.Length > MaximumTokenLength)
            {
                throw new InvalidPluginExecutionException("Dataverse returned an unsupported paging state. No partial result was returned.");
            }

            state.Version = CurrentVersion;
            state.NextPage = nextPage;
            state.Cookie = cookie;
            using (var stream = new MemoryStream())
            {
                CreateSerializer().WriteObject(stream, state);
                var token = Convert.ToBase64String(stream.ToArray());
                if (token.Length > MaximumTokenLength)
                {
                    throw new InvalidPluginExecutionException("The continuation token exceeds the supported size. No partial result was returned.");
                }
                return token;
            }
        }

        private static DataContractJsonSerializer CreateSerializer()
        {
            return new DataContractJsonSerializer(typeof(ContinuationState),
                new DataContractJsonSerializerSettings { MaxItemsInObjectGraph = 64 });
        }

        private static InvalidPluginExecutionException InvalidToken()
        {
            return new InvalidPluginExecutionException("Invalid continuation token or changed query. Restart paging with the same filters and page size.");
        }

        [DataContract]
        public sealed class ContinuationState
        {
            [DataMember(EmitDefaultValue = false)] public string Scope { get; set; }
            [DataMember(IsRequired = true)] public int Version { get; set; }
            [DataMember(IsRequired = true)] public int NextPage { get; set; }
            [DataMember(IsRequired = true)] public string Cookie { get; set; }
            [DataMember(IsRequired = true)] public Guid UserId { get; set; }
            [DataMember(IsRequired = true)] public Guid OrganizationId { get; set; }
            [DataMember(IsRequired = true)] public Guid? ProcessInstanceId { get; set; }
            [DataMember(IsRequired = true)] public int? Status { get; set; }
            [DataMember(IsRequired = true)] public Guid? AssignedUserId { get; set; }
            [DataMember(IsRequired = true)] public Guid? AssignedTeamId { get; set; }
            [DataMember(IsRequired = true)] public int PageSize { get; set; }
        }
    }

    public sealed class PageCursor
    {
        public PageCursor(int pageNumber, string cookie)
        {
            PageNumber = pageNumber;
            Cookie = cookie;
        }

        public int PageNumber { get; }
        public string Cookie { get; }
    }
}