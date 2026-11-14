using System.Text.Json.Serialization;

namespace Planets.Api;

public sealed record class NasaPlanet
{
    [JsonPropertyName("pl_name")] public string? Name { get; init; }
    [JsonPropertyName("hostname")] public string? HostName { get; init; }
    [JsonPropertyName("pl_rade")] public double? RadiusEarth { get; init; }
    [JsonPropertyName("pl_radeerr1")] public double? RadiusErrorHigh { get; init; }
    [JsonPropertyName("pl_radeerr2")] public double? RadiusErrorLow { get; init; }
    [JsonPropertyName("pl_bmasse")] public double? MassEarth { get; init; }
    [JsonPropertyName("pl_bmasseerr1")] public double? MassErrorHigh { get; init; }
    [JsonPropertyName("pl_bmasseerr2")] public double? MassErrorLow { get; init; }
    [JsonPropertyName("pl_bmassprov")] public string? MassProvenance { get; init; }
    [JsonPropertyName("pl_insol")] public double? FluxEarth { get; init; }
    [JsonPropertyName("pl_insolerr1")] public double? FluxErrorHigh { get; init; }
    [JsonPropertyName("pl_insolerr2")] public double? FluxErrorLow { get; init; }
    [JsonPropertyName("st_teff")] public double? StellarTemperatureK { get; init; }
    [JsonPropertyName("st_tefferr1")] public double? StellarTemperatureErrorHigh { get; init; }
    [JsonPropertyName("st_tefferr2")] public double? StellarTemperatureErrorLow { get; init; }
    [JsonPropertyName("st_lum")] public double? StellarLogLuminosity { get; init; }
    [JsonPropertyName("st_lumerr1")] public double? StellarLogLuminosityErrorHigh { get; init; }
    [JsonPropertyName("st_lumerr2")] public double? StellarLogLuminosityErrorLow { get; init; }
    [JsonPropertyName("pl_orbsmax")] public double? SemiMajorAxisAu { get; init; }
    [JsonPropertyName("pl_orbsmaxerr1")] public double? SemiMajorAxisErrorHigh { get; init; }
    [JsonPropertyName("pl_orbsmaxerr2")] public double? SemiMajorAxisErrorLow { get; init; }
    [JsonPropertyName("pl_orbeccen")] public double? Eccentricity { get; init; }
    [JsonPropertyName("pl_orbeccenerr1")] public double? EccentricityErrorHigh { get; init; }
    [JsonPropertyName("pl_orbeccenerr2")] public double? EccentricityErrorLow { get; init; }
    [JsonPropertyName("pl_orbper")] public double? OrbitalPeriodDays { get; init; }
    [JsonPropertyName("pl_orbper_reflink")] public string? OrbitalPeriodReference { get; init; }
    [JsonPropertyName("pl_orbincl")] public double? InclinationDegrees { get; init; }
    [JsonPropertyName("pl_dens")] public double? DensityGramsCm3 { get; init; }
    [JsonPropertyName("pl_eqt")] public double? EquilibriumTemperatureK { get; init; }
    [JsonPropertyName("st_rad")] public double? StellarRadiusSolar { get; init; }
    [JsonPropertyName("pl_rade_reflink")] public string? RadiusReference { get; init; }
    [JsonPropertyName("pl_bmasse_reflink")] public string? MassReference { get; init; }
    [JsonPropertyName("pl_insol_reflink")] public string? FluxReference { get; init; }
    [JsonPropertyName("pl_radelim")] public int? RadiusLimit { get; init; }
    [JsonPropertyName("pl_bmasselim")] public int? MassLimit { get; init; }
    [JsonPropertyName("pl_insollim")] public int? FluxLimit { get; init; }
    [JsonPropertyName("pl_orbeccenlim")] public int? EccentricityLimit { get; init; }
    [JsonPropertyName("pl_controv_flag")] public int? ControversialFlag { get; init; }
    [JsonPropertyName("cb_flag")] public int? CircumbinaryFlag { get; init; }
    [JsonPropertyName("sy_dist")] public double? DistanceParsec { get; init; }
    [JsonPropertyName("ra")] public double? RightAscensionDegrees { get; init; }
    [JsonPropertyName("dec")] public double? DeclinationDegrees { get; init; }
    [JsonPropertyName("st_spectype")] public string? SpectralType { get; init; }
    [JsonPropertyName("gaia_dr3_id")] public string? GaiaDr3Id { get; init; }
    [JsonPropertyName("tic_id")] public string? TicId { get; init; }
    [JsonPropertyName("st_age")] public double? StarAgeGyr { get; init; }
    [JsonPropertyName("st_rotp")] public double? StarRotationDays { get; init; }
    [JsonPropertyName("pl_tsm")] public double? TransmissionSpectroscopyMetric { get; init; }
    [JsonPropertyName("pl_esm")] public double? EmissionSpectroscopyMetric { get; init; }
}

public sealed record Candidate(
    string Name,
    string? HostName,
    double Score,
    double HabitableZonePoints,
    double SizePoints,
    double OrbitPoints,
    string Zone,
    double? RadiusEarth,
    double? MassEarth,
    double FluxEarth,
    double StellarTemperatureK,
    double? Eccentricity,
    double ConservativeOuterFlux,
    double ConservativeInnerFlux,
    double OptimisticOuterFlux,
    double OptimisticInnerFlux,
    double? DistanceParsec,
    string? SpectralType,
    string? GaiaDr3Id,
    string? TicId,
    double? StarAgeGyr,
    double? StarRotationDays,
    double? TransmissionSpectroscopyMetric,
    double? EmissionSpectroscopyMetric,
    string[] DataFlags)
{
    public double? SemiMajorAxisAu { get; init; }
    public double? OrbitalPeriodDays { get; init; }
    public double? InclinationDegrees { get; init; }
    public double? DensityGramsCm3 { get; init; }
    public double? EquilibriumTemperatureK { get; init; }
    public double? StellarRadiusSolar { get; init; }
    public double? RightAscensionDegrees { get; init; }
    public double? DeclinationDegrees { get; init; }
    public string? OrbitalPeriodProvenance { get; init; }
    public string? FluxProvenance { get; init; }
    public RankStability? Stability { get; init; }
}

public sealed record RankStability(int Samples, int InputsWithErrors, int ScoredInputs,
    double ScoreP10, double ScoreP90, int RankP10, int RankP90,
    double Top50Percent, double EligiblePercent);

public sealed record CatalogSnapshot(DateTimeOffset FetchedAt, int TotalPlanets, IReadOnlyList<Candidate> Candidates);
public sealed record SavedCatalog(DateTimeOffset FetchedAt, NasaPlanet[] Planets);
