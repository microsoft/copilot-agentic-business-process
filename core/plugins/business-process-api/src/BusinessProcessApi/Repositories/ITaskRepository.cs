using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Repositories
{
    public interface ITaskRepository
    {
        EntityCollection GetAll();
        EntityCollection GetPage(TaskQuery query, int pageNumber, string pagingCookie);
    }
}