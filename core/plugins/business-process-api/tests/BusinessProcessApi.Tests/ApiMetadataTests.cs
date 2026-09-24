using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;
using System.Xml.Linq;
using Faf001.BusinessProcessApi.Api;
using Faf001.BusinessProcessApi.Services;
using Xunit;

namespace Faf001.BusinessProcessApi.Tests
{
    public sealed class ApiMetadataTests
    {
        [Theory]
        [InlineData(GetTasksPlugin.MessageName)]
        [InlineData(GetTasksPagePlugin.MessageName)]
        [InlineData(GetProcessesPlugin.MessageName)]
        public void DefinitionsMatchReadOnlyActionContracts(string message)
        {
            var json = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "spec", message + ".json"));
            var definition = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
            Assert.Equal(message, definition["uniquename"]);
            var operation = message.Substring("faf001_".Length);
            Assert.Equal("Faf001.BusinessProcessApi.Api." + operation + "Plugin", definition["pluginTypeName"]);
            Assert.Equal(false, definition["isfunction"]);
            Assert.Equal(false, definition["workflowsdkstepenabled"]);
            Assert.Equal(false, definition["isprivate"]);
            Assert.Equal(0, definition["bindingtype"]);
            Assert.Equal(0, definition["allowedcustomprocessingsteptype"]);
            Assert.DoesNotContain(definition.Keys, key => key.Contains("@odata.bind"));
            var outputs = Records(definition["CustomAPIResponseProperties"]).ToArray();
            var collectionName = message == GetProcessesPlugin.MessageName
                ? GetProcessesPlugin.ProcessesOutput : GetTasksPlugin.TasksOutput;
            var tasks = Assert.Single(outputs, value => (string)value["uniquename"] == collectionName);
            Assert.Equal(4, tasks["type"]);
            Assert.False(tasks.ContainsKey("logicalentityname"));
            if (message == GetTasksPlugin.MessageName)
            {
                Assert.Single(outputs);
                Assert.False(definition.ContainsKey("CustomAPIRequestParameters"));
                return;
            }

            Assert.Equal(3, outputs.Length);
            Assert.Equal(0, outputs.Single(value => (string)value["uniquename"] == GetTasksPagePlugin.HasMoreOutput)["type"]);
            Assert.Equal(10, outputs.Single(value => (string)value["uniquename"] == GetTasksPagePlugin.NextTokenOutput)["type"]);
            var expectedInputs = new Dictionary<string, int>
            {
                [GetTasksPagePlugin.ProcessInstanceInput] = 12, [GetTasksPagePlugin.StatusInput] = 7,
                [GetTasksPagePlugin.AssignedUserInput] = 12, [GetTasksPagePlugin.AssignedTeamInput] = 12,
                [GetTasksPagePlugin.PageSizeInput] = 7, [GetTasksPagePlugin.TokenInput] = 10
            };
            if (message == GetProcessesPlugin.MessageName)
            {
                expectedInputs = new Dictionary<string, int>
                {
                    [GetProcessesPlugin.StatusInput] = 7,
                    [GetProcessesPlugin.PageSizeInput] = 7,
                    [GetProcessesPlugin.TokenInput] = 10
                };
            }
            var inputs = Records(definition["CustomAPIRequestParameters"]).ToArray();
            Assert.Equal(expectedInputs.Count, inputs.Length);
            Assert.Equal(expectedInputs.Keys.OrderBy(value => value), inputs.Select(value => (string)value["uniquename"]).OrderBy(value => value));
            foreach (var input in inputs)
            {
                Assert.Equal(expectedInputs[(string)input["uniquename"]], input["type"]);
                Assert.Equal(true, input["isoptional"]);
                Assert.Equal(message + "." + input["uniquename"], input["name"]);
            }
        }

        [Fact]
        public void StatusValidationMatchesCommittedChoiceMetadata()
        {
            var document = XDocument.Load(Path.Combine(AppContext.BaseDirectory, "metadata", "faf001_bptaskstatus.xml"));
            var statuses = document.Descendants("option").Select(option => (int)option.Attribute("value")).OrderBy(value => value);
            Assert.Equal(statuses, Enum.GetValues(typeof(BusinessTaskStatus)).Cast<int>().OrderBy(value => value));
        }

        [Theory]
        [InlineData("GetProcess", "faf001_ProcessInstanceId", "faf001_Process", 3)]
        [InlineData("GetAttachments", "faf001_ProcessInstanceId", "faf001_Attachments", 4)]
        [InlineData("GetArtifacts", "faf001_ProcessInstanceId", "faf001_Artifacts", 4)]
        [InlineData("GetOutputs", "faf001_ProcessInstanceId", "faf001_Outputs", 4)]
        [InlineData("GetTask", "faf001_TaskId", "faf001_Task", 3)]
        [InlineData("AssignTask", "faf001_TaskId", "faf001_TaskId", 12)]
        [InlineData("StartTask", "faf001_TaskId", "faf001_TaskId", 12)]
        [InlineData("CompleteTask", "faf001_TaskId", "faf001_StepId", 12)]
        public void NewActionContractsMatchEntryPoints(string operation, string input, string output, int outputType)
        {
            var message = "faf001_" + operation;
            var definition = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(
                File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "spec", message + ".json")));
            Assert.Equal(message, definition["uniquename"]);
            Assert.Equal(false, definition["isfunction"]);
            Assert.Equal(false, definition["isprivate"]);
            Assert.Equal(false, definition["workflowsdkstepenabled"]);
            Assert.Equal(0, definition["bindingtype"]);
            Assert.Equal(0, definition["allowedcustomprocessingsteptype"]);
            var plugin = typeof(GetTasksPlugin).Assembly.GetType("Faf001.BusinessProcessApi.Api." + operation + "Plugin", true);
            Assert.Equal(plugin.FullName, definition["pluginTypeName"]);
            Assert.Equal(message, plugin.GetField("MessageName").GetRawConstantValue());
            var parameters = Records(definition["CustomAPIRequestParameters"]).ToArray();
            Assert.Equal(operation == "CompleteTask" ? 2 : 1, parameters.Length);
            Assert.Equal(12, parameters.Single(parameter => (string)parameter["uniquename"] == input)["type"]);
            Assert.All(parameters, parameter => { Assert.Equal(false, parameter["isoptional"]); Assert.Equal(message + "." + parameter["uniquename"], parameter["name"]); });
            var responses = Records(definition["CustomAPIResponseProperties"]).ToArray();
            Assert.Equal(operation == "GetProcess" ? 2 : 1, responses.Length);
            Assert.Equal(outputType, responses.Single(response => (string)response["uniquename"] == output)["type"]);
            if (operation == "GetProcess") Assert.Equal(10, responses.Single(response => (string)response["uniquename"] == "faf001_StepsJson")["type"]);
            if (operation == "CompleteTask") Assert.Equal(10, parameters.Single(parameter => (string)parameter["uniquename"] == "faf001_SubmissionJson")["type"]);
        }

        [Fact]
        public void ParameterDescriptionsFitDataverseMetadataLimits()
        {
            var paths = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "spec"), "*.json");
            Assert.Equal(11, paths.Length);
            foreach (var path in paths)
            {
                var definition = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(path));
                if (definition.ContainsKey("CustomAPIRequestParameters"))
                    Assert.All(Records(definition["CustomAPIRequestParameters"]), parameter =>
                        Assert.InRange(((string)parameter["description"]).Length, 0, 300));
                Assert.All(Records(definition["CustomAPIResponseProperties"]), response =>
                    Assert.InRange(((string)response["description"]).Length, 0, 100));
            }
        }

        private static IEnumerable<Dictionary<string, object>> Records(object value)
        {
            return ((System.Collections.IEnumerable)value).Cast<Dictionary<string, object>>();
        }
    }
}