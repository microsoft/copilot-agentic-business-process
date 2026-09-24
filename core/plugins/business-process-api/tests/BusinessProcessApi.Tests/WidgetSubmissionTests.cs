using System;
using System.Linq;
using System.Web.Script.Serialization;
using Faf001.BusinessProcessApi.Services;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Faf001.BusinessProcessApi.Tests
{
    public sealed class WidgetSubmissionTests
    {
        [Theory]
        [InlineData("text", "\"hello\"", "faf001_valuetext")]
        [InlineData("number", "12.3456789012", "faf001_valuenumber")]
        [InlineData("boolean", "false", "faf001_valueboolean")]
        [InlineData("datetime", "\"2026-09-10T12:00:00+02:00\"", "faf001_valuedatetime")]
        [InlineData("json", "{\"order\":[1,true,null,\"<test>\"]}", "faf001_valuejson")]
        [InlineData("json", "null", "faf001_valuejson")]
        [InlineData("json", "{}", "faf001_valuejson")]
        [InlineData("json", "[]", "faf001_valuejson")]
        public void ParsesTypedWidgetValuesAndClearsOtherValueColumns(string type, string value, string column)
        {
            var task = new Entity("faf001_bptask") { ["faf001_widgetid"] = "review-ui" };
            var result = WidgetSubmission.Parse("{\"outcome\":324010000,\"values\":[{\"key\":\"test\",\"type\":\"" + type + "\",\"value\":" + value + "}]}", task);
            Assert.Equal(3, result.Outputs.Count);
            var output = result.Outputs[0];
            Assert.Equal("review.test", output["faf001_datakey"]);
            Assert.Single(output.Attributes, attribute => attribute.Key.StartsWith("faf001_value") && attribute.Value != null);
            Assert.NotNull(output[column]);
            if (type == "json")
            {
                var serializer = new JavaScriptSerializer();
                Assert.Equal(serializer.Serialize(serializer.DeserializeObject(value)), serializer.Serialize(serializer.DeserializeObject((string)output[column])));
            }
            if (type == "datetime") Assert.Equal(new DateTime(2026, 9, 10, 10, 0, 0, DateTimeKind.Utc), output[column]);
        }

        [Theory]
        [InlineData("{}")]
        [InlineData("null")]
        [InlineData("{\"outcome\":324010003}")]
        [InlineData("{\"outcome\":\"324010000\"}")]
        [InlineData("{\"outcome\":324010000,\"outcome\":324010001}")]
        [InlineData("{\"outcome\":324010000,\"notes\":4}")]
        [InlineData("{\"outcome\":324010000,\"unknown\":true}")]
        [InlineData("{\"outcome\":324010000,\"values\":{}}")]
        [InlineData("{\"outcome\":324010000,\"values\":[{\"key\":\"decision\",\"type\":\"text\",\"value\":\"x\"}]}")]
        [InlineData("{\"outcome\":324010000,\"values\":[{\"key\":\"x\",\"type\":\"number\",\"value\":\"12\"}]}")]
        [InlineData("{\"outcome\":324010000,\"values\":[{\"key\":\"x\",\"type\":\"number\",\"value\":0.00000000001}]}")]
        [InlineData("{\"outcome\":324010000,\"values\":[{\"key\":\"x\",\"type\":\"boolean\",\"value\":1}]}")]
        [InlineData("{\"outcome\":324010000,\"values\":[{\"key\":\"x\",\"type\":\"datetime\",\"value\":\"2026-09-10\"}]}")]
        public void RejectsMalformedOrAmbiguousSubmission(string json)
        {
            Assert.Throws<InvalidPluginExecutionException>(() => WidgetSubmission.Parse(json, new Entity("faf001_bptask")));
        }

        [Fact]
        public void EnforcesFieldLimitsAndFallbackNamespace()
        {
            var task = new Entity("faf001_bptask") { ["faf001_taskname"] = " Review Order! " };
            Assert.Equal("review-order.decision", WidgetSubmission.Parse("{\"outcome\":324010000}", task).Outputs[0]["faf001_datakey"]);
            Assert.Throws<InvalidPluginExecutionException>(() => WidgetSubmission.Parse("{\"outcome\":324010000,\"notes\":\"" + new string('n', 4001) + "\"}", task));
            task["faf001_widgetid"] = new string('w', 100);
            Assert.Throws<InvalidPluginExecutionException>(() => WidgetSubmission.Parse("{\"outcome\":324010000}", task));
        }
    }
}