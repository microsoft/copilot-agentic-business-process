using System;
using Faf001.BusinessProcessApi.Infrastructure.Paging;
using Faf001.BusinessProcessApi.Repositories;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Services
{
    public sealed class ProcessService
    {
        private readonly IProcessRepository repository;
        private readonly ContinuationTokenCodec tokens;

        public ProcessService(IProcessRepository repository, ContinuationTokenCodec tokens = null)
        {
            this.repository = repository ?? throw new ArgumentNullException(nameof(repository));
            this.tokens = tokens ?? new ContinuationTokenCodec();
        }

        public ProcessPage GetPage(ProcessQuery query, Guid userId, Guid organizationId)
        {
            if (query == null) throw new ArgumentNullException(nameof(query));
            if (query.PageSize < 1 || query.PageSize > 500)
            {
                throw new InvalidPluginExecutionException("faf001_PageSize must be between 1 and 500.");
            }
            if (query.Status.HasValue && !Enum.IsDefined(typeof(BusinessProcessStatus), query.Status.Value))
            {
                throw new InvalidPluginExecutionException("faf001_Status must be a supported BP Instance Status value.");
            }
            if (userId == Guid.Empty || organizationId == Guid.Empty)
            {
                throw new InvalidPluginExecutionException("A Dataverse execution user and organization are required for paging.");
            }

            var cursor = tokens.Decode(query, userId, organizationId);
            var page = repository.GetPage(query, cursor.PageNumber, cursor.Cookie);
            var nextToken = page.MoreRecords
                ? tokens.Encode(query, userId, organizationId, checked(cursor.PageNumber + 1), page.PagingCookie)
                : string.Empty;
            var processes = new EntityCollection { EntityName = DataverseProcessRepository.TableName };
            processes.Entities.AddRange(page.Entities);
            return new ProcessPage(processes, page.MoreRecords, nextToken);
        }
    }
}