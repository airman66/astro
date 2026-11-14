namespace Planets.Api;

public static class Habitability
{
    // Kopparapu et al. (2014), Table 1, one-Earth-mass coefficients.
    private static readonly double[] RecentVenus = [1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15];
    private static readonly double[] RunawayGreenhouse = [1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15];
    private static readonly double[] MaximumGreenhouse = [0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16];
    private static readonly double[] EarlyMars = [0.320, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16];

    public static Candidate? Score(NasaPlanet planet)
    {
        if (string.IsNullOrWhiteSpace(planet.Name) || planet.ControversialFlag == 1 || planet.CircumbinaryFlag == 1)
            return null;

        var teff = planet.StellarTemperatureK;
        if (teff is null or < 2600 or > 7200 || !double.IsFinite(teff.Value))
            return null;

        var flags = new List<string>();
        var flux = planet.FluxLimit is null or 0 && IsPositiveFinite(planet.FluxEarth) ? planet.FluxEarth : null;
        if (flux is null && IsFinite(planet.StellarLogLuminosity) && IsPositiveFinite(planet.SemiMajorAxisAu))
        {
            flux = Math.Pow(10, planet.StellarLogLuminosity!.Value) / Math.Pow(planet.SemiMajorAxisAu!.Value, 2);
            flags.Add("fluxEstimatedFromStarLuminosityAndOrbit");
        }
        if (!IsPositiveFinite(flux))
            return null;

        var radius = planet.RadiusLimit is null or 0 && IsPositiveFinite(planet.RadiusEarth) ? planet.RadiusEarth : null;
        var mass = planet.MassLimit is null or 0 && IsPositiveFinite(planet.MassEarth) ? planet.MassEarth : null;
        if (radius is null && mass is null)
            return null;
        if (radius is < 0.5 or > 2.5 || mass is < 0.1 or > 10)
            return null;

        var t = teff.Value - 5780;
        var recentVenus = Boundary(RecentVenus, t);
        var runaway = Boundary(RunawayGreenhouse, t);
        var maximum = Boundary(MaximumGreenhouse, t);
        var earlyMars = Boundary(EarlyMars, t);
        if (flux < earlyMars || flux > recentVenus)
            return null;

        var conservative = flux >= maximum && flux <= runaway;
        var zone = conservative ? "conservative" : "optimistic";
        var hzPoints = conservative ? 50.0 : 25.0;
        var sizePoints = radius is not null
            ? 35 * Math.Max(0, 1 - Math.Abs(Math.Log(radius.Value)) / Math.Log(2.5))
            : 35 * Math.Max(0, 1 - Math.Abs(Math.Log(mass!.Value)) / Math.Log(10));

        double orbitPoints;
        if (planet.EccentricityLimit is null or 0 && planet.Eccentricity is double eccentricity and >= 0 and < 1)
            orbitPoints = 15 * (1 - Math.Min(eccentricity / 0.5, 1));
        else
        {
            orbitPoints = 7.5;
            flags.Add("eccentricityUnknownOrLimited");
        }

        if (radius is null) flags.Add("radiusMissingOrLimited");
        if (mass is null) flags.Add("massMissingOrLimited");
        if (IsCalculated(planet.RadiusReference)) flags.Add("radiusCalculatedByArchive");
        if (IsCalculated(planet.MassReference)) flags.Add("massCalculatedByArchive");
        if (IsCalculated(planet.FluxReference)) flags.Add("fluxCalculatedByArchive");
        if (planet.MassProvenance?.Contains("sin", StringComparison.OrdinalIgnoreCase) == true)
            flags.Add("massMayBeMinimum");

        sizePoints = Math.Round(sizePoints, 1);
        orbitPoints = Math.Round(orbitPoints, 1);
        return new Candidate(
            planet.Name, planet.HostName, Math.Round(hzPoints + sizePoints + orbitPoints, 1),
            hzPoints, sizePoints, orbitPoints, zone,
            radius, mass, Math.Round(flux!.Value, 4), teff.Value,
            planet.EccentricityLimit is null or 0 ? planet.Eccentricity : null,
            Math.Round(maximum, 4), Math.Round(runaway, 4),
            Math.Round(earlyMars, 4), Math.Round(recentVenus, 4),
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
            FluxProvenance = flags.Contains("fluxEstimatedFromStarLuminosityAndOrbit") ||
                             IsCalculated(planet.FluxReference) ? "calculated" : "published"
        };
    }

    private static double Boundary(double[] c, double t) =>
        c[0] + c[1] * t + c[2] * t * t + c[3] * t * t * t + c[4] * t * t * t * t;

    private static bool IsFinite(double? value) => value is not null && double.IsFinite(value.Value);
    private static bool IsPositiveFinite(double? value) => value is > 0 && double.IsFinite(value.Value);
    private static bool IsCalculated(string? reference) =>
        reference?.Contains("CALCULATED_VALUE", StringComparison.OrdinalIgnoreCase) == true;
}
