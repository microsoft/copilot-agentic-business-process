using System;
using Faf001.BusinessProcessApi.Infrastructure.Paging;
using Faf001.BusinessProcessApi.Repositories;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Services
{
    public sealed class TaskService
    {
        private readonly ITaskRepository repository;
        private readonly ContinuationTokenCodec tokens;

        public TaskService(ITaskRepository repository, ContinuationTokenCodec tokens = null)
        {
            this.repository = repository ?? throw new ArgumentNullException(nameof(repository));
            this.tokens = tokens ?? new ContinuationTokenCodec();
        }

        public EntityCollection GetAll()
        {
            return repository.GetAll();
        }

        public TaskPage GetPage(TaskQuery query, Guid userId, Guid organizationId)
        {
            if (query == null) throw new ArgumentNullException(nameof(query));
            if (query.PageSize < 1 || query.PageSize > 500)
            {
                throw new InvalidPluginExecutionException("faf001_PageSize must be between 1 and 500.");
            }
            if (query.ProcessInstanceId == Guid.Empty || query.AssignedUserId == Guid.Empty || query.AssignedTeamId == Guid.Empty)
            {
                throw new InvalidPluginExecutionException("Task filter IDs must not be empty GUIDs.");
            }
            if (query.Status.HasValue && !Enum.IsDefined(typeof(BusinessTaskStatus), query.Status.Value))
            {
                throw new InvalidPluginExecutionException("faf001_Status must be a supported BP Task Status value.");
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
            var tasks = new EntityCollection { EntityName = DataverseTaskRepository.TableName };
            tasks.Entities.AddRange(page.Entities);
            return new TaskPage(tasks, page.MoreRecords, nextToken);
        }
    }
}