namespace Planets.Api;

public static class Habitability
{
    /// <summary>
    /// 1.1: values flagged by NASA as upper/lower limits (st_tefflim, st_lumlim, pl_orbsmaxlim)
    /// are bounds, not measurements, and are no longer used for selection or the derived flux.
    /// Weights and boundaries are unchanged from 1.
    /// </summary>
    public const string ScoreVersion = "1.1";

    public const double MinStellarTemperatureK = 2600, MaxStellarTemperatureK = 7200;
    public const double MinRadiusEarth = 0.5, MaxRadiusEarth = 2.5, MinMassEarth = 0.1, MaxMassEarth = 10;
    public const double ConservativeZonePoints = 50, OptimisticZonePoints = 25, MaxSizePoints = 35,
        MaxOrbitPoints = 15, UnknownOrbitPoints = 7.5, EccentricityForZeroPoints = 0.5;

    // Kopparapu et al. (2014), Table 1, one-Earth-mass coefficients.
    private static readonly double[] RecentVenus = [1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15];
    private static readonly double[] RunawayGreenhouse = [1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15];
    private static readonly double[] MaximumGreenhouse = [0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16];
    private static readonly double[] EarlyMars = [0.320, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16];

    public static Candidate? Score(NasaPlanet planet) => Evaluate(planet).Candidate;

    /// <summary>
    /// Applies the selection funnel in a fixed order (status → star → flux → zone → size) and
    /// reports the first failed stage. A planet is a candidate only when every stage passes.
    /// </summary>
    public static Evaluation Evaluate(NasaPlanet planet)
    {
        if (string.IsNullOrWhiteSpace(planet.Name))
            return new(null, "missingName", null, null, null);
        if (planet.ControversialFlag == 1)
            return new(null, "controversial", null, null, null);
        if (planet.CircumbinaryFlag == 1)
            return new(null, "circumbinary", null, null, null);

        var teff = planet.StellarTemperatureLimit is null or 0 ? planet.StellarTemperatureK : null;
        if (teff is null || !double.IsFinite(teff.Value))
            return new(null, "starTemperatureUnknown", null, null, null);
        if (teff is < MinStellarTemperatureK or > MaxStellarTemperatureK)
            return new(null, "starTemperatureOutOfRange", null, null, null);

        var flags = new List<string>();
        var flux = planet.FluxLimit is null or 0 && IsPositiveFinite(planet.FluxEarth) ? planet.FluxEarth : null;
        if (flux is null && IsFinite(planet.StellarLogLuminosity) && IsPositiveFinite(planet.SemiMajorAxisAu) &&
            planet.StellarLuminosityLimit is null or 0 && planet.SemiMajorAxisLimit is null or 0)
        {
            flux = Math.Pow(10, planet.StellarLogLuminosity!.Value) / Math.Pow(planet.SemiMajorAxisAu!.Value, 2);
            flags.Add("fluxEstimatedFromStarLuminosityAndOrbit");
        }
        if (!IsPositiveFinite(flux))
            return new(null, "fluxUnknown", null, null, null);
        var fluxProvenance = flags.Contains("fluxEstimatedFromStarLuminosityAndOrbit") || IsCalculated(planet.FluxReference)
            ? "calculated" : "published";

        var boundaries = Boundaries(teff.Value);
        var conservative = flux >= boundaries.MaximumGreenhouse && flux <= boundaries.RunawayGreenhouse;
        var optimistic = flux >= boundaries.EarlyMars && flux <= boundaries.RecentVenus;
        var zone = conservative ? "conservative" : optimistic ? "optimistic" : "outside";
        if (!optimistic)
            return new(null, "outsideHabitableZone", flux, fluxProvenance, zone);

        var radius = planet.RadiusLimit is null or 0 && IsPositiveFinite(planet.RadiusEarth) ? planet.RadiusEarth : null;
        var mass = planet.MassLimit is null or 0 && IsPositiveFinite(planet.MassEarth) ? planet.MassEarth : null;
        if (radius is null && mass is null)
            return new(null, "sizeUnknown", flux, fluxProvenance, zone);
        if (radius is < MinRadiusEarth or > MaxRadiusEarth)
            return new(null, "radiusOutOfRange", flux, fluxProvenance, zone);
        if (mass is < MinMassEarth or > MaxMassEarth)
            return new(null, "massOutOfRange", flux, fluxProvenance, zone);

        var hzPoints = conservative ? ConservativeZonePoints : OptimisticZonePoints;
        var sizePoints = radius is not null
            ? MaxSizePoints * Math.Max(0, 1 - Math.Abs(Math.Log(radius.Value)) / Math.Log(MaxRadiusEarth))
            : MaxSizePoints * Math.Max(0, 1 - Math.Abs(Math.Log(mass!.Value)) / Math.Log(MaxMassEarth));

        double orbitPoints;
        if (planet.EccentricityLimit is null or 0 && planet.Eccentricity is double eccentricity and >= 0 and < 1)
            orbitPoints = MaxOrbitPoints * (1 - Math.Min(eccentricity / EccentricityForZeroPoints, 1));
        else
        {
            orbitPoints = UnknownOrbitPoints;
            flags.Add("eccentricityUnknownOrLimited");
        }

        if (radius is null) flags.Add("radiusMissingOrLimited");
        if (mass is null) flags.Add("massMissingOrLimited");
        if (IsCalculated(planet.RadiusReference)) flags.Add("radiusCalculatedByArchive");
        if (IsCalculated(planet.MassReference)) flags.Add("massCalculatedByArchive");
        if (IsCalculated(planet.FluxReference)) flags.Add("fluxCalculatedByArchive");
        if (MassMayBeMinimum(planet)) flags.Add("massMayBeMinimum");

        sizePoints = Math.Round(sizePoints, 1);
        orbitPoints = Math.Round(orbitPoints, 1);
        var candidate = new Candidate(
            planet.Name!, planet.HostName, Math.Round(hzPoints + sizePoints + orbitPoints, 1),
            hzPoints, sizePoints, orbitPoints, zone,
            radius, mass, Math.Round(flux!.Value, 4), teff.Value,
            planet.EccentricityLimit is null or 0 ? planet.Eccentricity : null,
            Math.Round(boundaries.MaximumGreenhouse, 4), Math.Round(boundaries.RunawayGreenhouse, 4),
            Math.Round(boundaries.EarlyMars, 4), Math.Round(boundaries.RecentVenus, 4),
            planet.DistanceParsec, planet.SpectralType, planet.GaiaDr3Id, planet.TicId,
            planet.StarAgeGyr, planet.StarRotationDays,
            planet.TransmissionSpectroscopyMetric, planet.EmissionSpectroscopyMetric,
            flags.ToArray())
        {
            SemiMajorAxisAu = planet.SemiMajorAxisAu,
            OrbitalPeriodDays = planet.OrbitalPeriodDays,
            InclinationDegrees = planet.InclinationDegrees,
            DensityGramsCm3 = planet.DensityGramsCm3,
            EquilibriumTemperatureK = planet.EquilibriumTemperatureK,
            StellarRadiusSolar = planet.StellarRadiusSolar,
            RightAscensionDegrees = planet.RightAscensionDegrees,
            DeclinationDegrees = planet.DeclinationDegrees,
            OrbitalPeriodProvenance = IsCalculated(planet.OrbitalPeriodReference) ? "calculated" : "published",
            FluxProvenance = fluxProvenance,
            DiscoveryYear = planet.DiscoveryYear,
            DiscoveryMethod = planet.DiscoveryMethod,
            SystemPlanetCount = planet.SystemPlanetCount
        };
        return new(candidate, null, flux, fluxProvenance, zone);
    }

    public sealed record ZoneBoundaries(double RecentVenus, double RunawayGreenhouse, double MaximumGreenhouse, double EarlyMars);

    /// <summary>Effective stellar flux (Earth = 1) of the four Kopparapu 2014 limits for a star of temperature teff.</summary>
    public static ZoneBoundaries Boundaries(double teff)
    {
        var t = teff - 5780;
        return new(Boundary(RecentVenus, t), Boundary(RunawayGreenhouse, t), Boundary(MaximumGreenhouse, t), Boundary(EarlyMars, t));
    }

    /// <summary>NASA marks values derived by the archive (e.g. radius from a mass–radius relation) with CALCULATED_VALUE.</summary>
    public static bool IsArchiveCalculated(string? reference) => IsCalculated(reference);

    public static bool MassMayBeMinimum(NasaPlanet planet) =>
        planet.MassProvenance?.Contains("sin", StringComparison.OrdinalIgnoreCase) == true;

    private static double Boundary(double[] c, double t) =>
        c[0] + c[1] * t + c[2] * t * t + c[3] * t * t * t + c[4] * t * t * t * t;

    private static bool IsFinite(double? value) => value is not null && double.IsFinite(value.Value);
    private static bool IsPositiveFinite(double? value) => value is > 0 && double.IsFinite(value.Value);
    private static bool IsCalculated(string? reference) =>
        reference?.Contains("CALCULATED_VALUE", StringComparison.OrdinalIgnoreCase) == true;
}
