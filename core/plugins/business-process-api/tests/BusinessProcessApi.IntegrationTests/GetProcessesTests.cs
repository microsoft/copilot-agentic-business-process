using System.Text.Json;
using Xunit;
using Xunit.Abstractions;

namespace BusinessProcessApi.IntegrationTests;

public sealed class GetProcessesTests
{
    private readonly ITestOutputHelper output;

    public GetProcessesTests(ITestOutputHelper output)
    {
        this.output = output;
    }

    [DataverseFact]
    [Trait("Category", "Integration")]
    public async Task GetProcessesReturnsNonemptyListWithRequiredFields()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        using var client = await DataverseTestClient.ConnectAsync(timeout.Token);
        using var response = await client.GetProcessesAsync(timeout.Token);

        Assert.True(response.RootElement.TryGetProperty("faf001_Processes", out var processes),
            "GetProcesses must return faf001_Processes.");
        Assert.Equal(JsonValueKind.Array, processes.ValueKind);
        Assert.True(processes.GetArrayLength() > 0,
            "The approved environment must contain at least one process visible to the signed-in caller.");

        output.WriteLine("Returned processes ({0}):", processes.GetArrayLength());
        output.WriteLine(JsonSerializer.Serialize(processes, new JsonSerializerOptions { WriteIndented = true }));

        foreach (var process in processes.EnumerateArray())
        {
            Assert.Equal(JsonValueKind.Object, process.ValueKind);
            AssertGuid(process, "faf001_bpinstanceid");
            var name = RequiredField(process, "faf001_processname");
            Assert.Equal(JsonValueKind.String, name.ValueKind);
            Assert.False(string.IsNullOrWhiteSpace(name.GetString()), "Process name must not be blank.");
            AssertInteger(process, "faf001_status");
            AssertGuid(process, "_ownerid_value");
            AssertInteger(process, "statecode");
        }
    }

    private static JsonElement RequiredField(JsonElement process, string field)
    {
        Assert.True(process.TryGetProperty(field, out var value), $"Required field '{field}' is missing.");
        Assert.NotEqual(JsonValueKind.Null, value.ValueKind);
        return value;
    }

    private static void AssertGuid(JsonElement process, string field)
    {
        var value = RequiredField(process, field);
        Assert.Equal(JsonValueKind.String, value.ValueKind);
        Assert.True(value.TryGetGuid(out var identifier) && identifier != Guid.Empty,
            $"Required field '{field}' must contain a nonempty GUID.");
    }

    private static void AssertInteger(JsonElement process, string field)
    {
        var value = RequiredField(process, field);
        Assert.Equal(JsonValueKind.Number, value.ValueKind);
        Assert.True(value.TryGetInt32(out _), $"Required field '{field}' must contain an integer.");
    }
}

public sealed class DataverseFactAttribute : FactAttribute
{
    public DataverseFactAttribute()
    {
        if (!string.Equals(Environment.GetEnvironmentVariable("DATAVERSE_INTEGRATION_TESTS"), "1", StringComparison.Ordinal))
        {
            Skip = "Live Dataverse test disabled. Set DATAVERSE_INTEGRATION_TESTS=1 to opt in.";
        }
    }
}