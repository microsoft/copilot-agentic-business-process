using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Azure.Core;
using Azure.Identity;

namespace BusinessProcessApi.IntegrationTests;

internal sealed class DataverseTestClient : IDisposable
{
    private readonly HttpClient http;

    public Guid CallerId { get; private set; }

    private DataverseTestClient(HttpClient http)
    {
        this.http = http;
    }

    public static async Task<DataverseTestClient> ConnectAsync(CancellationToken cancellationToken)
    {
        var configuredUrl = Environment.GetEnvironmentVariable("DATAVERSE_URL");
        if (!Uri.TryCreate(configuredUrl, UriKind.Absolute, out var environment)
            || environment.Scheme != Uri.UriSchemeHttps || !environment.IsDefaultPort
            || environment.AbsolutePath != "/" || environment.Query.Length != 0
            || environment.Fragment.Length != 0 || environment.UserInfo.Length != 0)
        {
            throw new InvalidOperationException("Set DATAVERSE_URL to the HTTPS root URL of the approved test environment.");
        }

        if (!Guid.TryParse(Environment.GetEnvironmentVariable("DATAVERSE_EXPECTED_ORGANIZATION_ID"), out var expectedOrganization)
            || expectedOrganization == Guid.Empty)
        {
            throw new InvalidOperationException("Set DATAVERSE_EXPECTED_ORGANIZATION_ID to the approved test organization's GUID.");
        }

        var credential = new AzureCliCredential();
        var token = await credential.GetTokenAsync(
            new TokenRequestContext(new[] { environment.GetLeftPart(UriPartial.Authority) + "/.default" }),
            cancellationToken);
        var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
        {
            BaseAddress = new Uri(environment, "api/data/v9.2/"),
            Timeout = TimeSpan.FromSeconds(60)
        };
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        http.DefaultRequestHeaders.Add("OData-Version", "4.0");
        http.DefaultRequestHeaders.Add("OData-MaxVersion", "4.0");

        var client = new DataverseTestClient(http);
        try
        {
            using var response = await http.GetAsync("WhoAmI", cancellationToken);
            using var identity = await ReadResponseAsync(response, "WhoAmI", cancellationToken);
            if (!identity.RootElement.TryGetProperty("OrganizationId", out var organization)
                || !organization.TryGetGuid(out var actualOrganization) || actualOrganization != expectedOrganization)
            {
                throw new InvalidOperationException("Dataverse organization does not match DATAVERSE_EXPECTED_ORGANIZATION_ID. Test aborted.");
            }
            if (!identity.RootElement.TryGetProperty("UserId", out var user)
                || !user.TryGetGuid(out var userId) || userId == Guid.Empty)
            {
                throw new InvalidOperationException("WhoAmI did not return a valid Dataverse caller identity.");
            }
            client.CallerId = userId;
            return client;
        }
        catch
        {
            client.Dispose();
            throw;
        }
    }

    public Task<JsonDocument> GetProcessesAsync(CancellationToken cancellationToken)
    {
        return InvokeReadAsync("faf001_GetProcesses", new { faf001_PageSize = 100 }, cancellationToken);
    }

    public async Task<JsonDocument> InvokeReadAsync(string operation, object parameters, CancellationToken cancellationToken)
    {
        if (operation is not ("faf001_GetProcesses" or "faf001_GetTasks" or "faf001_GetTasksPage"
            or "faf001_GetProcess" or "faf001_GetAttachments" or "faf001_GetArtifacts"
            or "faf001_GetOutputs" or "faf001_GetTask"))
        {
            throw new ArgumentException("Only read-only Custom API Actions are allowed by this test client.", nameof(operation));
        }
        using var response = await http.PostAsJsonAsync(operation, parameters, cancellationToken);
        return await ReadResponseAsync(response, operation, cancellationToken);
    }

    private static async Task<JsonDocument> ReadResponseAsync(
        HttpResponseMessage response, string operation, CancellationToken cancellationToken)
    {
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"{operation} returned HTTP {(int)response.StatusCode}. Verify authentication, permissions, and Custom API deployment. Response body omitted to protect business data.");
        }
        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
    }

    public void Dispose() => http.Dispose();
}