using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Faf001.BusinessProcessApi.Repositories
{
    internal static class DataverseQuery
    {
        public static EntityCollection ReadAll(IOrganizationService service, QueryExpression query)
        {
            query.PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 };
            var result = new EntityCollection { EntityName = query.EntityName };
            while (true)
            {
                var page = service.RetrieveMultiple(query);
                result.Entities.AddRange(page.Entities);
                if (!page.MoreRecords) return result;
                if (string.IsNullOrEmpty(page.PagingCookie))
                    throw new InvalidPluginExecutionException("Dataverse did not return a paging cookie. No partial result was returned.");
                query.PageInfo.PageNumber = checked(query.PageInfo.PageNumber + 1);
                query.PageInfo.PagingCookie = page.PagingCookie;
            }
        }
    }
}