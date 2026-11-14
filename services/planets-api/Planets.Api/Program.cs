using Planets.Api;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyOrigin().WithMethods("GET").AllowAnyHeader()));
builder.Services.AddSingleton<CatalogService>();
builder.Services.AddSingleton<EnrichmentService>();
builder.Services.AddSingleton<HwcService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<CatalogService>());

var app = builder.Build();
app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/status", (CatalogService catalog) =>
{
    var snapshot = catalog.Current;
    return Results.Ok(new
    {
        ready = snapshot is not null,
        fetchedAt = snapshot?.FetchedAt,
        totalPlanets = snapshot?.TotalPlanets ?? 0,
        candidateCount = snapshot?.Candidates.Count ?? 0,
        source = "NASA Exoplanet Archive / pscomppars",
        scoreVersion = "1"
    });
});

app.MapGet("/api/candidates", (CatalogService catalog, int? limit, string? zone) =>
{
    if (limit is < 1 or > 100)
        return Results.BadRequest(new { error = "limit must be between 1 and 100" });
    if (zone is not null && zone is not ("all" or "conservative" or "optimistic"))
        return Results.BadRequest(new { error = "zone must be all, conservative, or optimistic" });

    var snapshot = catalog.Current;
    if (snapshot is null)
        return Results.Problem("Catalog has not loaded yet", statusCode: 503);

    var candidates = snapshot.Candidates
        .Where(c => zone is null or "all" || c.Zone == zone)
        .Take(limit ?? 50);
    return Results.Ok(new { fetchedAt = snapshot.FetchedAt, items = candidates });
});

app.MapGet("/api/candidates/{name}", (CatalogService catalog, string name) =>
{
    var snapshot = catalog.Current;
    if (snapshot is null)
        return Results.Problem("Catalog has not loaded yet", statusCode: 503);
    var candidate = snapshot.Candidates.FirstOrDefault(c =>
        string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));
    return candidate is null ? Results.NotFound() : Results.Ok(candidate);
});

app.MapGet("/api/candidates/{name}/sources", async (CatalogService catalog, EnrichmentService enrichment,
    string name, CancellationToken cancellationToken) =>
{
    var snapshot = catalog.Current;
    if (snapshot is null) return Results.Problem("Catalog has not loaded yet", statusCode: 503);
    var candidate = snapshot.Candidates.FirstOrDefault(c =>
        string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));
    return candidate is null ? Results.NotFound() : Results.Ok(await enrichment.GetAsync(candidate, cancellationToken));
});

app.MapGet("/api/hwc", async (HwcService hwc, CancellationToken cancellationToken) =>
{
    var snapshot = await hwc.GetAsync(cancellationToken);
    return Results.Ok(new
    {
        available = snapshot is not null,
        fetchedAt = snapshot?.FetchedAt,
        catalogUpdatedAt = "2024-03-21",
        source = "https://phl.upr.edu/hwc/data",
        worlds = snapshot?.Worlds ?? []
    });
});

app.MapGet("/api/methodology", () => Results.Ok(new
{
    scoreVersion = "1",
    description = "Heuristic ranking of Earth-like candidates, not a probability of life or a surface-temperature estimate.",
    components = new
    {
        habitableZone = "50 points in the conservative Kopparapu 2014 zone; 25 in the optimistic-only zone",
        size = "Up to 35 points for radius close to Earth's; mass used only when radius is unavailable",
        eccentricity = "Up to 15 points for low eccentricity; unknown eccentricity receives 7.5 neutral points and a data flag"
    },
    eligibility = "2600–7200 K host star; within optimistic zone; radius 0.5–2.5 Earth radii and/or mass 0.1–10 Earth masses; no contradictory known size, controversial or circumbinary flag",
    rankingStability = "160 deterministic catalog-wide resamples using published asymmetric NASA errors. The 10th–90th percentile intervals and top-50 frequency are conditional on this independent-error model; missing errors, correlations and systematic effects are not modeled.",
    visualisation = "Interactive orbit and habitable-zone schematic from NASA catalog parameters. Planet appearances are artistic hypotheses; body sizes and animation speed are adjusted for readability.",
    skyMap = "RA and Dec locate the host system on a flat sky map. Distance is shown separately from NASA sy_dist; orbital position is not reconstructed.",
    hwcComparison = "PHL Habitable Worlds Catalog is a dated comparison of selection methods and does not affect this score. Its conservative/optimistic samples concern likely size and composition, not the same label as our habitable-zone class.",
    orbitExperiment = "Educational flux scenario using inverse-square distance scaling. It does not recalculate climate or candidate scores.",
    sources = new[]
    {
        "https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html",
        "https://doi.org/10.1088/2041-8205/787/2/L29",
        "https://phl.upr.edu/hwc/data",
        "https://astroedu.iau.org/activities/1624/the-engine-of-life/"
    }
}));

app.Run();
