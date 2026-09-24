using System.Text.Json;
using Xunit;

namespace BusinessProcessApi.IntegrationTests;

[Trait("Category", "Integration")]
public sealed class ReadOnlyActionTests
{
    [DataverseFact]
    public async Task GetTasksReturnsMetadataCollection()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        using var client = await DataverseTestClient.ConnectAsync(timeout.Token);
        using var response = await client.InvokeReadAsync("faf001_GetTasks", new { }, timeout.Token);

        var tasks = AssertCollection(response.RootElement, "value", "faf001_bptaskid");
        foreach (var task in tasks.EnumerateArray())
            Assert.False(task.TryGetProperty("faf001_inputdata", out _), "Task lists must not expose input data.");
    }

    [DataverseFact]
    public async Task GetTasksPageReturnsBoundedPage()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        using var client = await DataverseTestClient.ConnectAsync(timeout.Token);
        using var response = await client.InvokeReadAsync("faf001_GetTasksPage", new { faf001_PageSize = 5 }, timeout.Token);

        var tasks = AssertCollection(response.RootElement, "faf001_Tasks", "faf001_bptaskid");
        Assert.InRange(tasks.GetArrayLength(), 0, 5);
        foreach (var task in tasks.EnumerateArray())
            Assert.False(task.TryGetProperty("faf001_inputdata", out _), "Task lists must not expose input data.");
        var hasMore = response.RootElement.GetProperty("faf001_HasMore").GetBoolean();
        var nextToken = response.RootElement.GetProperty("faf001_NextToken");
        Assert.True(nextToken.ValueKind is JsonValueKind.String or JsonValueKind.Null);
        if (hasMore) Assert.False(string.IsNullOrWhiteSpace(nextToken.GetString()));
    }

    [DataverseFact]
    public async Task GetProcessReturnsProcessAndSteps()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        using var client = await DataverseTestClient.ConnectAsync(timeout.Token);
        var processId = await GetExistingProcessIdAsync(client, timeout.Token);
        using var response = await client.InvokeReadAsync("faf001_GetProcess",
            new { faf001_ProcessInstanceId = processId }, timeout.Token);

        Assert.Equal(processId, response.RootElement.GetProperty("faf001_Process").GetProperty("faf001_bpinstanceid").GetGuid());
        using var steps = JsonDocument.Parse(response.RootElement.GetProperty("faf001_StepsJson").GetString()!);
        Assert.Equal(JsonValueKind.Array, steps.RootElement.ValueKind);
        foreach (var step in steps.RootElement.EnumerateArray())
        {
            Assert.NotEqual(Guid.Empty, step.GetProperty("id").GetGuid());
            Assert.Equal(JsonValueKind.Array, step.GetProperty("outputs").ValueKind);
            Assert.Equal(JsonValueKind.Array, step.GetProperty("artifacts").ValueKind);
        }
    }

    [DataverseFact]
    public Task GetAttachmentsReturnsMetadataCollection() =>
        AssertProcessCollectionAsync("faf001_GetAttachments", "faf001_bpattachmentid", "faf001_file");

    [DataverseFact]
    public Task GetArtifactsReturnsMetadataCollection() =>
        AssertProcessCollectionAsync("faf001_GetArtifacts", "faf001_bpartifactid", "faf001_file");

    [DataverseFact]
    public Task GetOutputsReturnsMetadataCollection() =>
        AssertProcessCollectionAsync("faf001_GetOutputs", "faf001_bpdatavalueid",
            "faf001_valuetext", "faf001_valuejson", "faf001_valuenumber", "faf001_valueboolean", "faf001_valuedatetime");

    [DataverseFact]
    public async Task GetTaskReturnsCallerAssignedTask()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        using var client = await DataverseTestClient.ConnectAsync(timeout.Token);
        using var list = await client.InvokeReadAsync("faf001_GetTasks", new { }, timeout.Token);
        var tasks = AssertCollection(list.RootElement, "value", "faf001_bptaskid");
        var assigned = tasks.EnumerateArray().FirstOrDefault(task =>
            task.TryGetProperty("_faf001_assignedto_value", out var assignee)
            && assignee.TryGetGuid(out var assigneeId) && assigneeId == client.CallerId);
        Assert.True(assigned.ValueKind == JsonValueKind.Object,
            "The approved environment must contain a task assigned to the signed-in caller. This test never claims or creates a task.");
        var taskId = assigned.GetProperty("faf001_bptaskid").GetGuid();
        using var response = await client.InvokeReadAsync("faf001_GetTask", new { faf001_TaskId = taskId }, timeout.Token);

        Assert.Equal(taskId, response.RootElement.GetProperty("faf001_bptaskid").GetGuid());
        Assert.Equal(client.CallerId, response.RootElement.GetProperty("_faf001_assignedto_value").GetGuid());
    }

    private static async Task AssertProcessCollectionAsync(string operation, string idProperty, params string[] excludedProperties)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        using var client = await DataverseTestClient.ConnectAsync(timeout.Token);
        var processId = await GetExistingProcessIdAsync(client, timeout.Token);
        using var response = await client.InvokeReadAsync(operation, new { faf001_ProcessInstanceId = processId }, timeout.Token);

        var records = AssertCollection(response.RootElement, "value", idProperty);
        foreach (var record in records.EnumerateArray())
        {
            Assert.Equal(processId, record.GetProperty("_faf001_bpinstanceid_value").GetGuid());
            foreach (var property in excludedProperties)
                Assert.False(record.TryGetProperty(property, out _), $"{operation} must not return content column {property}.");
        }
    }

    private static async Task<Guid> GetExistingProcessIdAsync(DataverseTestClient client, CancellationToken cancellationToken)
    {
        using var response = await client.GetProcessesAsync(cancellationToken);
        var processes = AssertCollection(response.RootElement, "faf001_Processes", "faf001_bpinstanceid");
        Assert.True(processes.GetArrayLength() > 0,
            "The approved environment must contain at least one process visible to the signed-in caller.");
        return processes[0].GetProperty("faf001_bpinstanceid").GetGuid();
    }

    private static JsonElement AssertCollection(JsonElement response, string property, string idProperty)
    {
        Assert.True(response.TryGetProperty(property, out var records), $"Response must contain '{property}'.");
        Assert.Equal(JsonValueKind.Array, records.ValueKind);
        foreach (var record in records.EnumerateArray())
        {
            Assert.Equal(JsonValueKind.Object, record.ValueKind);
            Assert.NotEqual(Guid.Empty, record.GetProperty(idProperty).GetGuid());
        }
        return records;
    }
}