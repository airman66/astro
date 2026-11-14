using System.Text.Json;

namespace Planets.Api;

public sealed record CatalogRefreshStatus(DateTimeOffset? LastAttemptAt, DateTimeOffset? LastSuccessAt,
    string? LastError, DateTimeOffset? NextAttemptAt);

public sealed class CatalogService(
    IWebHostEnvironment environment,
    IHttpClientFactory httpClientFactory,
    ILogger<CatalogService> logger) : BackgroundService
{
    private const string Source = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
    private const string Query = "select pl_name,hostname,pl_rade,pl_radeerr1,pl_radeerr2,pl_bmasse,pl_bmasseerr1,pl_bmasseerr2,pl_bmassprov,pl_insol,pl_insolerr1,pl_insolerr2,st_teff,st_tefferr1,st_tefferr2,st_tefflim,st_lum,st_lumerr1,st_lumerr2,st_lumlim,pl_orbsmax,pl_orbsmaxerr1,pl_orbsmaxerr2,pl_orbsmaxlim,pl_orbeccen,pl_orbeccenerr1,pl_orbeccenerr2,pl_orbper,pl_orbper_reflink,pl_orbincl,pl_dens,pl_eqt,st_rad,pl_rade_reflink,pl_bmasse_reflink,pl_insol_reflink,pl_radelim,pl_bmasselim,pl_insollim,pl_orbeccenlim,pl_controv_flag,cb_flag,sy_dist,ra,dec,st_spectype,gaia_dr3_id,tic_id,st_age,st_rotp,pl_tsm,pl_esm,disc_year,discoverymethod,sy_pnum from pscomppars";
    public static readonly TimeSpan RefreshInterval = TimeSpan.FromHours(6);
    private static readonly TimeSpan RetryWithSnapshot = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan MaxColdRetry = TimeSpan.FromMinutes(30);
    private readonly string _cachePath = Path.Combine(environment.ContentRootPath, "data", "nasa-planets.json");
    private CatalogSnapshot? _current;
    private CatalogRefreshStatus _status = new(null, null, null, null);

    public CatalogSnapshot? Current => Volatile.Read(ref _current);
    public CatalogRefreshStatus Status => Volatile.Read(ref _status);

    /// <summary>Request timeout for the TAP call; tests shorten it.</summary>
    public TimeSpan RequestTimeout { get; init; } = TimeSpan.FromSeconds(90);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        await LoadCacheAsync(stoppingToken);
        var failures = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            var success = await RefreshAsync(stoppingToken);
            failures = success ? 0 : failures + 1;
            // Until the first catalog exists, retry quickly (1, 2, 4 … 30 min) instead of waiting 6 h.
            var delay = success ? RefreshInterval
                : Current is null ? TimeSpan.FromMinutes(Math.Min(MaxColdRetry.TotalMinutes, Math.Pow(2, failures - 1)))
                : RetryWithSnapshot;
            Volatile.Write(ref _status, Status with { NextAttemptAt = DateTimeOffset.UtcNow + delay });
            try
            {
                await Task.Delay(delay, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task LoadCacheAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_cachePath)) return;
        try
        {
            await using var file = File.OpenRead(_cachePath);
            var saved = await JsonSerializer.DeserializeAsync<SavedCatalog>(file, cancellationToken: cancellationToken);
            if (saved is not null && saved.Planets.Length > 0)
                Publish(saved.FetchedAt, saved.Planets, fromCache: true);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not load NASA cache");
        }
    }

    /// <summary>One refresh attempt. Source outages and timeouts are reported, never thrown.</summary>
    public async Task<bool> RefreshAsync(CancellationToken cancellationToken)
    {
        var attemptAt = DateTimeOffset.UtcNow;
        try
        {
            using var client = httpClientFactory.CreateClient();
            client.Timeout = RequestTimeout;
            var url = $"{Source}?query={Uri.EscapeDataString(Query)}&format=json";
            using var response = await client.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var planets = await JsonSerializer.DeserializeAsync<NasaPlanet[]>(stream, cancellationToken: cancellationToken);
            if (planets is null || planets.Length < 1000)
                throw new InvalidDataException("NASA returned an unexpectedly small catalog");

            var fetchedAt = DateTimeOffset.UtcNow;
            Publish(fetchedAt, planets, fromCache: false);
            Volatile.Write(ref _status, new CatalogRefreshStatus(attemptAt, fetchedAt, null, null));
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_cachePath)!);
                var temporaryPath = _cachePath + ".tmp";
                await using (var file = File.Create(temporaryPath))
                    await JsonSerializer.SerializeAsync(file, new SavedCatalog(fetchedAt, planets), cancellationToken: cancellationToken);
                File.Move(temporaryPath, _cachePath, true);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Fresh catalog loaded, but could not save cache");
            }
            return true;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            // HttpClient.Timeout surfaces as TaskCanceledException without our token being cancelled.
            var reason = ex is OperationCanceledException ? "timeout" : ex is HttpRequestException http
                ? $"http {(int?)http.StatusCode ?? 0}" : ex.GetType().Name;
            logger.LogWarning(ex, "NASA refresh failed ({Reason}); keeping the last successful catalog", reason);
            Volatile.Write(ref _status, Status with { LastAttemptAt = attemptAt, LastError = reason });
            return false;
        }
    }

    private void Publish(DateTimeOffset fetchedAt, NasaPlanet[] planets, bool fromCache)
    {
        var evaluations = planets.Select(planet => (planet, evaluation: Habitability.Evaluate(planet))).ToArray();
        var candidates = evaluations.Select(item => item.evaluation.Candidate)
            .OfType<Candidate>()
            .OrderByDescending(c => c.Score)
            .ThenBy(c => c.Name, StringComparer.Ordinal)
            .Select((candidate, index) => candidate with { Rank = index + 1 })
            .ToArray();
        var withStability = RankingUncertainty.Calculate(planets, candidates);
        var scores = withStability.ToDictionary(c => c.Name, c => c.Score, StringComparer.Ordinal);
        var points = evaluations.Where(item => !string.IsNullOrWhiteSpace(item.planet.Name))
            .Select(item => new CatalogPoint(
                item.planet.Name!, item.planet.HostName,
                item.planet.RadiusLimit is null or 0 ? item.planet.RadiusEarth : null,
                Habitability.IsArchiveCalculated(item.planet.RadiusReference),
                item.planet.MassLimit is null or 0 ? item.planet.MassEarth : null,
                Habitability.MassMayBeMinimum(item.planet),
                item.evaluation.FluxEarth is double flux ? Math.Round(flux, 4) : null, item.evaluation.FluxProvenance,
                item.planet.StellarTemperatureLimit is null or 0 ? item.planet.StellarTemperatureK : null,
                item.planet.DistanceParsec, item.planet.RightAscensionDegrees, item.planet.DeclinationDegrees,
                item.planet.DiscoveryYear, item.planet.DiscoveryMethod, item.evaluation.HabitableZone,
                item.evaluation.Candidate is not null, item.evaluation.Exclusion,
                scores.TryGetValue(item.planet.Name!, out var score) ? score : null))
            .ToArray();
        Volatile.Write(ref _current, new CatalogSnapshot(fetchedAt, planets.Length, withStability)
        {
            Points = points,
            FromCache = fromCache
        });
        logger.LogInformation("Catalog ready: {Planets} planets, {Candidates} candidates", planets.Length, candidates.Length);
    }
}
