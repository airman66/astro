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

Console.WriteLine("All scoring and stability checks passed.");
