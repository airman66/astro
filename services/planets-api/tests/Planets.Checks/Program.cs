using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Planets.Api;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

var earth = new NasaPlanet
{
    Name = "Earth test", StellarTemperatureK = 5780, FluxEarth = 1,
    RadiusEarth = 1, MassEarth = 1, Eccentricity = 0,
    OrbitalPeriodDays = 365.25, SemiMajorAxisAu = 1, StellarRadiusSolar = 1,
    RightAscensionDegrees = 217.4, DeclinationDegrees = -62.7, DistanceParsec = 1.3
};
var candidate = Habitability.Score(earth) ?? throw new Exception("Earth analogue should be eligible");
Check(candidate is { Score: 100, Zone: "conservative" }, "Earth analogue should score 100");
Check(candidate.Score == candidate.HabitableZonePoints + candidate.SizePoints + candidate.OrbitPoints,
    "Displayed score should equal its components");
Check(candidate.ConservativeInnerFlux == 1.107 && candidate.ConservativeOuterFlux == 0.356,
    "Solar habitable-zone boundaries should match Kopparapu 2014");
Check(candidate is { OrbitalPeriodDays: 365.25, SemiMajorAxisAu: 1, StellarRadiusSolar: 1 },
    "Visualisation fields should pass through to the candidate API");
Check(candidate is { RightAscensionDegrees: 217.4, DeclinationDegrees: -62.7, DistanceParsec: 1.3 },
    "Sky coordinates should pass through to the candidate API");
var hwc = HwcService.Parse("P_NAME,P_HABITABLE,P_ESI,COMMENT\n\"TRAPPIST-1 e\",1,0.85,\"quoted, field\"\n\"Example b\",2,0.62,\"line one\nline two\"\n\"Hot b\",0,0.1,no\n");
Check(hwc.Count == 2 && hwc[0] is { Name: "TRAPPIST-1 e", Category: 1, Esi: 0.85 } &&
    hwc[1] is { Name: "Example b", Category: 2 }, "HWC parser should handle quoted rows and keep only catalog candidates");

Check(Habitability.Score(new NasaPlanet
{
    Name = "Hot planet", StellarTemperatureK = 5780, FluxEarth = 2, RadiusEarth = 1
}) is null, "Hot planets should be excluded");
var unknownOrbit = Habitability.Score(new NasaPlanet
{
    Name = "Unknown orbit", StellarTemperatureK = 5780, FluxEarth = 1, RadiusEarth = 1
});
Check(unknownOrbit?.Score == 92.5 && unknownOrbit.DataFlags.Contains("eccentricityUnknownOrLimited"),
    "Unknown eccentricity should receive neutral orbit points and a flag");
Check(Habitability.Score(new NasaPlanet
{
    Name = "Inconsistent size", StellarTemperatureK = 5780, FluxEarth = 1,
    RadiusEarth = 1, MassEarth = 15
}) is null, "Known contradictory mass should exclude a candidate");
Check(Habitability.Score(new NasaPlanet
{
    Name = "Derived flux", StellarTemperatureK = 5780, StellarLogLuminosity = -1,
    SemiMajorAxisAu = Math.Sqrt(0.1), RadiusEarth = 1, Eccentricity = 0
}) is { Zone: "conservative" }, "Negative log luminosity must be usable");

var uncertain = earth with
{
    Name = "Uncertain test", RadiusEarth = 1.2, RadiusErrorHigh = 0.15, RadiusErrorLow = -0.15,
    FluxErrorHigh = 0.2, FluxErrorLow = -0.2,
    StellarTemperatureErrorHigh = 100, StellarTemperatureErrorLow = -100
};
var uncertainBaseline = Habitability.Score(uncertain) ?? throw new Exception("Uncertain planet should be eligible");
var stable = RankingUncertainty.Calculate([uncertain], [uncertainBaseline])[0].Stability
    ?? throw new Exception("Stability should be calculated");
Check(stable.Samples == 160 && stable.InputsWithErrors == 3 && stable.ScoredInputs == 5,
    "Stability should report the sample count and published error coverage");
Check(stable.ScoreP10 < stable.ScoreP90 && stable.EligiblePercent is > 0 and <= 100,
    "Published errors should produce a plausible score range");
Check(stable == RankingUncertainty.Calculate([uncertain], [uncertainBaseline])[0].Stability,
    "Stability sampling should be reproducible for the same catalog");

// Score 1.1: NASA limit flags are bounds, not measurements.
Check(Habitability.Evaluate(earth with { StellarTemperatureLimit = 1 }).Exclusion == "starTemperatureUnknown",
    "A stellar temperature given only as a limit must not qualify a planet");
var derived = new NasaPlanet
{
    Name = "Derived only", StellarTemperatureK = 5780, StellarLogLuminosity = 0, SemiMajorAxisAu = 1,
    RadiusEarth = 1, Eccentricity = 0
};
Check(Habitability.Score(derived) is { Score: 100 }, "Flux derived from measured luminosity and orbit stays usable");
Check(Habitability.Evaluate(derived with { StellarLuminosityLimit = 1 }).Exclusion == "fluxUnknown",
    "A luminosity limit must not produce a point estimate of flux");
Check(Habitability.Evaluate(derived with { SemiMajorAxisLimit = -1 }).Exclusion == "fluxUnknown",
    "A semi-major-axis limit must not produce a point estimate of flux");

// The selection funnel reports the first failed stage in a fixed order.
Check(Habitability.Evaluate(new NasaPlanet { Name = "Hot", StellarTemperatureK = 5780, FluxEarth = 2, RadiusEarth = 1 }) is
    { Exclusion: "outsideHabitableZone", HabitableZone: "outside" }, "Hot planets are excluded by the zone stage");
Check(Habitability.Evaluate(new NasaPlanet { Name = "Big", StellarTemperatureK = 5780, FluxEarth = 1, RadiusEarth = 4 }) is
    { Exclusion: "radiusOutOfRange", HabitableZone: "conservative" }, "Zone class is kept for planets rejected by size");
Check(Habitability.Evaluate(new NasaPlanet { Name = "No size", StellarTemperatureK = 5780, FluxEarth = 1 }).Exclusion == "sizeUnknown",
    "Planets without radius and mass are excluded by the size stage");
Check(Habitability.Evaluate(new NasaPlanet { Name = "Cold star", StellarTemperatureK = 2000, FluxEarth = 1, RadiusEarth = 1 }).Exclusion ==
    "starTemperatureOutOfRange", "Stars outside 2600–7200 K are outside the Kopparapu fit");
Check(Habitability.Evaluate(new NasaPlanet { Name = "Disputed", ControversialFlag = 1 }).Exclusion == "controversial",
    "Controversial planets are excluded first");

// The four Kopparapu limits stay ordered over the whole fitted temperature range.
for (var teff = 2600.0; teff <= 7200; teff += 50)
{
    var b = Habitability.Boundaries(teff);
    Check(b.RecentVenus > b.RunawayGreenhouse && b.RunawayGreenhouse > b.MaximumGreenhouse && b.MaximumGreenhouse > b.EarlyMars && b.EarlyMars > 0,
        $"Habitable-zone limits must be ordered at {teff} K");
}
var cool = Habitability.Boundaries(3300);
var sun = Habitability.Boundaries(5780);
Check(cool.RunawayGreenhouse < sun.RunawayGreenhouse && cool.MaximumGreenhouse < sun.MaximumGreenhouse,
    "Cooler stars have their habitable zone at lower flux (redder light is absorbed more efficiently)");

// NASA timeouts are a source outage: the refresh reports it and never throws.
var temp = Directory.CreateTempSubdirectory("planets-checks-");
var environment = new CheckEnvironment(temp.FullName);
var slow = new StubFactory(_ => throw new TaskCanceledException("simulated HttpClient timeout"));
var catalog = new CatalogService(environment, slow, NullLogger<CatalogService>.Instance);
Check(await catalog.RefreshAsync(CancellationToken.None) == false && catalog.Status.LastError == "timeout" && catalog.Current is null,
    "A NASA timeout must be reported as unavailable, not crash the service");
var failing = new CatalogService(environment, new StubFactory(_ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)),
    NullLogger<CatalogService>.Instance);
Check(await failing.RefreshAsync(CancellationToken.None) == false && failing.Status.LastError == "http 503",
    "HTTP errors from NASA are reported with their status");

// HWC: a timeout after a cached snapshot returns the snapshot.
Directory.CreateDirectory(Path.Combine(temp.FullName, "data"));
await File.WriteAllTextAsync(Path.Combine(temp.FullName, "data", "hwc.json"),
    System.Text.Json.JsonSerializer.Serialize(new HwcSnapshot(DateTimeOffset.UnixEpoch, [new HwcWorld("Cached b", 1, 0.8)])));
var hwcService = new HwcService(environment, slow, NullLogger<HwcService>.Instance);
var cached = await hwcService.GetAsync(CancellationToken.None);
Check(cached?.Worlds.Single().Name == "Cached b", "A HWC timeout must fall back to the last saved snapshot");
temp.Delete(true);

Console.WriteLine("All scoring, limit, outage and stability checks passed.");

sealed class StubFactory(Func<HttpRequestMessage, HttpResponseMessage> respond) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) => new(new StubHandler(respond));
}

sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
        Task.FromResult(respond(request));
}

sealed class CheckEnvironment(string root) : IWebHostEnvironment
{
    public string ApplicationName { get; set; } = "Planets.Checks";
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    public string ContentRootPath { get; set; } = root;
    public string EnvironmentName { get; set; } = "Checks";
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    public string WebRootPath { get; set; } = root;
}
