using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Repositories
{
    public interface IProcessRepository
    {
        EntityCollection GetPage(ProcessQuery query, int pageNumber, string pagingCookie);
    }
}