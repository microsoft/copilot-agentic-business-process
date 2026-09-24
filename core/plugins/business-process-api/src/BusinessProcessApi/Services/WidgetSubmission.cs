using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Xrm.Sdk;

namespace Faf001.BusinessProcessApi.Services
{
    public sealed class WidgetSubmission
    {
        public int Outcome { get; private set; }
        public string Notes { get; private set; }
        public List<Entity> Outputs { get; } = new List<Entity>();

        public static WidgetSubmission Parse(string json, Entity task)
        {
            if (string.IsNullOrWhiteSpace(json) || json.Length > 500000) throw Invalid();
            try
            {
                using (var reader = JsonReaderWriterFactory.CreateJsonReader(Encoding.UTF8.GetBytes(json),
                    new XmlDictionaryReaderQuotas { MaxDepth = 32, MaxStringContentLength = 500000, MaxArrayLength = 500000 }))
                {
                    var root = XElement.Load(reader);
                    if (Type(root) != "object") throw Invalid();
                    EnsureFields(root, "outcome", "notes", "values");
                    var outcome = root.Element("outcome");
                    if (Type(outcome) != "number" || !int.TryParse(outcome.Value, out var choice) || choice < 324010000 || choice > 324010002)
                        throw Invalid();
                    var notes = root.Element("notes");
                    if (notes != null && Type(notes) != "string") throw Invalid();
                    var result = new WidgetSubmission { Outcome = choice, Notes = notes?.Value ?? string.Empty };
                    if (result.Notes.Length > 4000) throw Invalid();
                    var widget = task.GetAttributeValue<string>("faf001_widgetid");
                    var prefix = !string.IsNullOrEmpty(widget) ? Regex.Replace(widget, "-ui$", "")
                        : Regex.Replace((task.GetAttributeValue<string>("faf001_taskname") ?? "task").ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
                    if (string.IsNullOrEmpty(prefix)) throw Invalid();
                    var values = root.Element("values");
                    if (values != null && Type(values) != "array") throw Invalid();
                    var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "decision", "notes" };
                    foreach (var value in values?.Elements() ?? Enumerable.Empty<XElement>())
                    {
                        if (result.Outputs.Count >= 100 || Type(value) != "object") throw Invalid();
                        EnsureFields(value, "key", "type", "value");
                        if (Type(value.Element("key")) != "string" || Type(value.Element("type")) != "string") throw Invalid();
                        var key = value.Element("key").Value;
                        if (string.IsNullOrWhiteSpace(key) || !keys.Add(key)) throw Invalid();
                        result.Outputs.Add(ToOutput(prefix + "." + key, value.Element("type").Value, value.Element("value")));
                    }
                    var decisions = new[] { "approved", "rejected", "needs_info" };
                    result.Outputs.Add(ToOutput(prefix + ".decision", "text", Text(decisions[choice - 324010000])));
                    result.Outputs.Add(ToOutput(prefix + ".notes", "text", Text(result.Notes)));
                    return result;
                }
            }
            catch (XmlException) { throw Invalid(); }
            catch (FormatException) { throw Invalid(); }
            catch (OverflowException) { throw Invalid(); }
        }

        private static Entity ToOutput(string key, string type, XElement value)
        {
            if (key.Length > 100 || value == null) throw Invalid();
            var row = new Entity("faf001_bpdatavalue") { ["faf001_datakey"] = key };
            foreach (var column in new[] { "faf001_valuetext", "faf001_valuenumber", "faf001_valueboolean", "faf001_valuedatetime", "faf001_valuejson" }) row[column] = null;
            switch (type)
            {
                case "text":
                    if (Type(value) != "string" || value.Value.Length > 4000) throw Invalid();
                    row["faf001_datatype"] = new OptionSetValue(324010000);
                    row["faf001_valuetext"] = value.Value;
                    break;
                case "number":
                    if (Type(value) != "number" || !decimal.TryParse(value.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number)
                        || number < -100000000000M || number > 100000000000M || decimal.Round(number, 10) != number) throw Invalid();
                    row["faf001_datatype"] = new OptionSetValue(324010001);
                    row["faf001_valuenumber"] = number;
                    break;
                case "boolean":
                    if (Type(value) != "boolean") throw Invalid();
                    row["faf001_datatype"] = new OptionSetValue(324010002);
                    row["faf001_valueboolean"] = XmlConvert.ToBoolean(value.Value);
                    break;
                case "datetime":
                    if (Type(value) != "string" || !Regex.IsMatch(value.Value, @"T.*(Z|[+-]\d{2}:\d{2})$")
                        || !DateTimeOffset.TryParse(value.Value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
                        || date.UtcDateTime < new DateTime(1753, 1, 1)) throw Invalid();
                    row["faf001_datatype"] = new OptionSetValue(324010003);
                    row["faf001_valuedatetime"] = date.UtcDateTime;
                    break;
                case "json":
                    using (var stream = new MemoryStream())
                    {
                        using (var writer = JsonReaderWriterFactory.CreateJsonWriter(stream, Encoding.UTF8, false))
                        {
                            var jsonRoot = new XElement(value) { Name = "root" };
                            foreach (var element in jsonRoot.DescendantsAndSelf().Where(element => !element.HasElements
                                && (Type(element) == "null" || Type(element) == "object" || Type(element) == "array"))) element.RemoveNodes();
                            jsonRoot.WriteTo(writer);
                            writer.Flush();
                        }
                        var content = Encoding.UTF8.GetString(stream.ToArray());
                        if (content.Length > 100000) throw Invalid();
                        row["faf001_datatype"] = new OptionSetValue(324010004);
                        row["faf001_valuejson"] = content;
                    }
                    break;
                default: throw Invalid();
            }
            return row;
        }

        private static XElement Text(string value) { return new XElement("value", new XAttribute("type", "string"), value); }
        private static string Type(XElement element) { return (string)element?.Attribute("type"); }
        private static void EnsureFields(XElement element, params string[] allowed)
        {
            if (element.Elements().Any(child => !allowed.Contains(child.Name.LocalName))
                || element.Elements().GroupBy(child => child.Name).Any(group => group.Count() > 1)) throw Invalid();
        }
        private static InvalidPluginExecutionException Invalid()
        {
            return new InvalidPluginExecutionException("Invalid widget submission. Check outcome, notes, unique output keys, value types and field limits.");
        }
    }
}