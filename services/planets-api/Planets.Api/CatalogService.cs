using System.Text.Json;

namespace Planets.Api;

public sealed class CatalogService(
    IWebHostEnvironment environment,
    IHttpClientFactory httpClientFactory,
    ILogger<CatalogService> logger) : BackgroundService
{
    private const string Source = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
    private const string Query = "select pl_name,hostname,pl_rade,pl_radeerr1,pl_radeerr2,pl_bmasse,pl_bmasseerr1,pl_bmasseerr2,pl_bmassprov,pl_insol,pl_insolerr1,pl_insolerr2,st_teff,st_tefferr1,st_tefferr2,st_lum,st_lumerr1,st_lumerr2,pl_orbsmax,pl_orbsmaxerr1,pl_orbsmaxerr2,pl_orbeccen,pl_orbeccenerr1,pl_orbeccenerr2,pl_orbper,pl_orbper_reflink,pl_orbincl,pl_dens,pl_eqt,st_rad,pl_rade_reflink,pl_bmasse_reflink,pl_insol_reflink,pl_radelim,pl_bmasselim,pl_insollim,pl_orbeccenlim,pl_controv_flag,cb_flag,sy_dist,ra,dec,st_spectype,gaia_dr3_id,tic_id,st_age,st_rotp,pl_tsm,pl_esm from pscomppars";
    private readonly string _cachePath = Path.Combine(environment.ContentRootPath, "data", "nasa-planets.json");
    private CatalogSnapshot? _current;

    public CatalogSnapshot? Current => Volatile.Read(ref _current);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        await LoadCacheAsync(stoppingToken);
        await RefreshAsync(stoppingToken);

        using var timer = new PeriodicTimer(TimeSpan.FromHours(6));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
                await RefreshAsync(stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }

    private async Task LoadCacheAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_cachePath)) return;
        try
        {
            await using var file = File.OpenRead(_cachePath);
            var saved = await JsonSerializer.DeserializeAsync<SavedCatalog>(file, cancellationToken: cancellationToken);
            if (saved is not null && saved.Planets.Length > 0)
                Publish(saved.FetchedAt, saved.Planets);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not load NASA cache");
        }
    }

    private async Task RefreshAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var client = httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(90);
            var url = $"{Source}?query={Uri.EscapeDataString(Query)}&format=json";
            using var response = await client.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var planets = await JsonSerializer.DeserializeAsync<NasaPlanet[]>(stream, cancellationToken: cancellationToken);
            if (planets is null || planets.Length < 1000)
                throw new InvalidDataException("NASA returned an unexpectedly small catalog");

            var fetchedAt = DateTimeOffset.UtcNow;
            Publish(fetchedAt, planets);
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_cachePath)!);
                var temporaryPath = _cachePath + ".tmp";
                await using (var file = File.Create(temporaryPath))
                    await JsonSerializer.SerializeAsync(file, new SavedCatalog(fetchedAt, planets), cancellationToken: cancellationToken);
                File.Move(temporaryPath, _cachePath, true);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Fresh catalog loaded, but could not save cache");
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "NASA refresh failed; keeping the last successful catalog");
        }
    }

    private void Publish(DateTimeOffset fetchedAt, NasaPlanet[] planets)
    {
        var candidates = planets.Select(Habitability.Score)
            .OfType<Candidate>()
            .OrderByDescending(c => c.Score)
            .ThenBy(c => c.Name, StringComparer.Ordinal)
            .ToArray();
        var withStability = RankingUncertainty.Calculate(planets, candidates);
        Volatile.Write(ref _current, new CatalogSnapshot(fetchedAt, planets.Length, withStability));
        logger.LogInformation("Catalog ready: {Planets} planets, {Candidates} candidates", planets.Length, candidates.Length);
    }
}
