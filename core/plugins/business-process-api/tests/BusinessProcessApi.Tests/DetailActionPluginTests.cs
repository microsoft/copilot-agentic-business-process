using System;
using Faf001.BusinessProcessApi.Api;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Xunit;

namespace Faf001.BusinessProcessApi.Tests
{
    public sealed class DetailActionPluginTests
    {
        [Theory]
        [InlineData("GetProcess", "faf001_ProcessInstanceId")]
        [InlineData("GetAttachments", "faf001_ProcessInstanceId")]
        [InlineData("GetArtifacts", "faf001_ProcessInstanceId")]
        [InlineData("GetOutputs", "faf001_ProcessInstanceId")]
        [InlineData("GetTask", "faf001_TaskId")]
        [InlineData("AssignTask", "faf001_TaskId")]
        [InlineData("CompleteTask", "faf001_TaskId")]
        public void RequiredIdsRejectMissingEmptyAndWrongTypesWithoutDataAccess(string operation, string input)
        {
            foreach (var invalid in new object[] { null, Guid.Empty, "not-a-guid", 42 })
            {
                var service = new Mock<IOrganizationService>(MockBehavior.Strict);
                var outputs = new ParameterCollection();
                var provider = Provider(operation, service.Object, new ParameterCollection { [input] = invalid }, outputs);
                var plugin = (IPlugin)Activator.CreateInstance(typeof(GetTasksPlugin).Assembly.GetType("Faf001.BusinessProcessApi.Api." + operation + "Plugin", true));
                Assert.Throws<InvalidPluginExecutionException>(() => plugin.Execute(provider));
                Assert.Empty(outputs);
                service.VerifyNoOtherCalls();
            }
        }

        [Theory]
        [InlineData("GetProcess", "faf001_Process", "faf001_bpinstance")]
        [InlineData("GetAttachments", "faf001_Attachments", "faf001_bpattachment")]
        [InlineData("GetArtifacts", "faf001_Artifacts", "faf001_bpartifact")]
        [InlineData("GetOutputs", "faf001_Outputs", "faf001_bpdatavalue")]
        public void ReadEntryPointsPublishDeclaredOutputs(string operation, string output, string table)
        {
            var processId = Guid.NewGuid();
            var service = new Mock<IOrganizationService>(MockBehavior.Strict);
            service.Setup(value => value.Retrieve("faf001_bpinstance", processId, It.IsAny<ColumnSet>())).Returns(new Entity("faf001_bpinstance", processId));
            service.Setup(value => value.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());
            var outputs = new ParameterCollection();
            var plugin = (IPlugin)Activator.CreateInstance(typeof(GetTasksPlugin).Assembly.GetType("Faf001.BusinessProcessApi.Api." + operation + "Plugin", true));
            plugin.Execute(Provider(operation, service.Object, new ParameterCollection { ["faf001_ProcessInstanceId"] = processId }, outputs));
            if (operation == "GetProcess")
            {
                Assert.Equal(processId, Assert.IsType<Entity>(outputs[output]).Id);
                Assert.Equal("[]", outputs["faf001_StepsJson"]);
            }
            else Assert.Equal(table, Assert.IsType<EntityCollection>(outputs[output]).EntityName);
        }

        private static IServiceProvider Provider(string operation, IOrganizationService service, ParameterCollection inputs, ParameterCollection outputs)
        {
            var caller = Guid.NewGuid();
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(value => value.MessageName).Returns("faf001_" + operation);
            context.SetupGet(value => value.Stage).Returns(30);
            context.SetupGet(value => value.Mode).Returns(0);
            context.SetupGet(value => value.UserId).Returns(caller);
            context.SetupGet(value => value.IsInTransaction).Returns(true);
            context.SetupGet(value => value.InputParameters).Returns(inputs);
            context.SetupGet(value => value.OutputParameters).Returns(outputs);
            var factory = new Mock<IOrganizationServiceFactory>(MockBehavior.Strict);
            factory.Setup(value => value.CreateOrganizationService(caller)).Returns(service);
            var provider = new Mock<IServiceProvider>();
            provider.Setup(value => value.GetService(typeof(IPluginExecutionContext))).Returns(context.Object);
            provider.Setup(value => value.GetService(typeof(IOrganizationServiceFactory))).Returns(factory.Object);
            return provider.Object;
        }
    }
}