using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace Planets.Api;

public sealed record SourceResult<T>(string Status, T? Value);
public sealed record GaiaInfo(long SourceId, double? ParallaxMas, double? ParallaxErrorMas,
    double? TemperatureK, double? LuminositySolar, double? LuminosityLowerSolar,
    double? LuminosityUpperSolar, double? RadiusSolar);
public sealed record TessInfo(int ObservationCount, int[] Sectors);
public sealed record SpectrumInfo(string Type, string? Facility, string? Instrument, string? Bibcode);
public sealed record CandidateSources(SourceResult<GaiaInfo> Gaia, SourceResult<TessInfo> Tess,
    SourceResult<SpectrumInfo[]> Spectra);

public sealed class EnrichmentService(IHttpClientFactory clients, IMemoryCache cache, ILogger<EnrichmentService> logger)
{
    public async Task<CandidateSources> GetAsync(Candidate candidate, CancellationToken cancellationToken)
    {
        if (cache.TryGetValue<CandidateSources>(candidate.Name, out var saved) && saved is not null)
            return saved;

        var gaia = GaiaAsync(candidate.GaiaDr3Id, cancellationToken);
        var tess = TessAsync(candidate.TicId, cancellationToken);
        var spectra = SpectraAsync(candidate.Name, cancellationToken);
        var result = new CandidateSources(await gaia, await tess, await spectra);
        cache.Set(candidate.Name, result, TimeSpan.FromMinutes(15));
        return result;
    }

    private async Task<SourceResult<GaiaInfo>> GaiaAsync(string? id, CancellationToken cancellationToken)
    {
        if (id?.StartsWith("Gaia DR3 ", StringComparison.Ordinal) != true ||
            !long.TryParse(id[9..], out var sourceId) || sourceId <= 0)
            return new("missing_id", null);

        const string columns = "g.source_id,g.parallax,g.parallax_error,a.teff_gspphot,a.lum_flame,a.lum_flame_lower,a.lum_flame_upper,a.radius_flame";
        var query = $"SELECT TOP 1 {columns} FROM gaiadr3.gaia_source AS g LEFT OUTER JOIN gaiadr3.astrophysical_parameters AS a ON g.source_id=a.source_id WHERE g.source_id={sourceId}";
        var url = "https://gaia.ari.uni-heidelberg.de/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=" + Uri.EscapeDataString(query);
        try
        {
            using var document = await ReadAsync(url, cancellationToken);
            var data = document.RootElement.GetProperty("data");
            if (data.GetArrayLength() == 0) return new("not_found", null);
            var row = data[0];
            return new("available", new GaiaInfo(sourceId, Number(row, "parallax"), Number(row, "parallax_error"),
                Number(row, "teff_gspphot"), Number(row, "lum_flame"), Number(row, "lum_flame_lower"),
                Number(row, "lum_flame_upper"), Number(row, "radius_flame")));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Gaia lookup failed for {SourceId}", sourceId);
            return new("unavailable", null);
        }
    }

    private async Task<SourceResult<TessInfo>> TessAsync(string? id, CancellationToken cancellationToken)
    {
        if (id?.StartsWith("TIC ", StringComparison.Ordinal) != true ||
            !long.TryParse(id[4..], out var ticId) || ticId <= 0)
            return new("missing_id", null);

        var request = JsonSerializer.Serialize(new
        {
            service = "Mast.Caom.Filtered",
            @params = new
            {
                columns = "obs_id,sequence_number,dataproduct_type",
                filters = new[]
                {
                    new { paramName = "obs_collection", values = new[] { "TESS" } },
                    new { paramName = "target_name", values = new[] { ticId.ToString() } },
                    new { paramName = "dataproduct_type", values = new[] { "timeseries" } }
                }
            },
            format = "json",
            pagesize = 100
        });
        var url = "https://mast.stsci.edu/api/v0/invoke?request=" + Uri.EscapeDataString(request);
        try
        {
            using var document = await ReadAsync(url, cancellationToken);
            var root = document.RootElement;
            if (root.GetProperty("status").GetString() != "COMPLETE") return new("unavailable", null);
            var rows = root.GetProperty("data");
            if (rows.GetArrayLength() == 0) return new("not_found", null);
            var count = root.GetProperty("paging").GetProperty("rowsFiltered").GetInt32();
            var sectors = rows.EnumerateArray()
                .Select(row => row.TryGetProperty("sequence_number", out var value) && value.ValueKind == JsonValueKind.Number ? value.GetInt32() : 0)
                .Where(value => value > 0).Distinct().Order().ToArray();
            return new("available", new TessInfo(count, sectors));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "MAST lookup failed for TIC {TicId}", ticId);
            return new("unavailable", null);
        }
    }

    private async Task<SourceResult<SpectrumInfo[]>> SpectraAsync(string name, CancellationToken cancellationToken)
    {
        var escapedName = name.Replace("'", "''", StringComparison.Ordinal);
        var query = $"select distinct top 8 spec_type,facility,instrument,bibcode from spectra where pl_name='{escapedName}'";
        var url = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=" + Uri.EscapeDataString(query) + "&format=json";
        try
        {
            using var document = await ReadAsync(url, cancellationToken);
            var rows = document.RootElement;
            if (rows.GetArrayLength() == 0) return new("not_found", null);
            var spectra = rows.EnumerateArray().Select(row => new SpectrumInfo(
                String(row, "spec_type") ?? "Unknown", String(row, "facility"),
                String(row, "instrument"), String(row, "bibcode"))).ToArray();
            return new("available", spectra);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "NASA spectra lookup failed for {Planet}", name);
            return new("unavailable", null);
        }
    }

    private async Task<JsonDocument> ReadAsync(string url, CancellationToken cancellationToken)
    {
        using var client = clients.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(18);
        using var response = await client.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
    }

    private static double? Number(JsonElement row, string name) =>
        row.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetDouble() : null;
    private static string? String(JsonElement row, string name) =>
        row.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
