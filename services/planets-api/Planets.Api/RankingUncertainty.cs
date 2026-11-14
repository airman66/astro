namespace Planets.Api;

public static class RankingUncertainty
{
    private const int Samples = 160;

    public static Candidate[] Calculate(NasaPlanet[] planets, Candidate[] candidates)
    {
        var random = new Random(20261114);
        var results = candidates.ToDictionary(candidate => candidate.Name,
            _ => new SampledRank(), StringComparer.Ordinal);

        for (var sample = 0; sample < Samples; sample++)
        {
            var ranked = planets.Select(planet => Habitability.Score(Perturb(planet, random)))
                .OfType<Candidate>()
                .OrderByDescending(candidate => candidate.Score)
                .ThenBy(candidate => candidate.Name, StringComparer.Ordinal);
            var rank = 0;
            foreach (var candidate in ranked)
            {
                rank++;
                if (!results.TryGetValue(candidate.Name, out var result)) continue;
                result.Ranks.Add(rank);
                result.Scores.Add(candidate.Score);
                if (rank <= 50) result.Top50Count++;
            }
        }

        var source = planets.Where(planet => planet.Name is not null)
            .ToDictionary(planet => planet.Name!, StringComparer.Ordinal);
        return candidates.Select((candidate, index) =>
        {
            var sampled = results[candidate.Name];
            var (knownErrors, inputs) = Coverage(source[candidate.Name]);
            sampled.Ranks.Sort();
            sampled.Scores.Sort();
            return candidate with
            {
                Stability = new RankStability(Samples, knownErrors, inputs,
                    Math.Round(Percentile(sampled.Scores, .1, candidate.Score), 1),
                    Math.Round(Percentile(sampled.Scores, .9, candidate.Score), 1),
                    (int)Math.Round(Percentile(sampled.Ranks, .1, index + 1)),
                    (int)Math.Round(Percentile(sampled.Ranks, .9, index + 1)),
                    Math.Round(100.0 * sampled.Top50Count / Samples, 1),
                    Math.Round(100.0 * sampled.Ranks.Count / Samples, 1))
            };
        }).ToArray();
    }

    private static NasaPlanet Perturb(NasaPlanet planet, Random random) => planet with
    {
        RadiusEarth = Positive(Pick(planet.RadiusEarth, planet.RadiusErrorHigh, planet.RadiusErrorLow, random)),
        MassEarth = Positive(Pick(planet.MassEarth, planet.MassErrorHigh, planet.MassErrorLow, random)),
        FluxEarth = Positive(Pick(planet.FluxEarth, planet.FluxErrorHigh, planet.FluxErrorLow, random)),
        StellarTemperatureK = Pick(planet.StellarTemperatureK, planet.StellarTemperatureErrorHigh, planet.StellarTemperatureErrorLow, random),
        StellarLogLuminosity = Pick(planet.StellarLogLuminosity, planet.StellarLogLuminosityErrorHigh, planet.StellarLogLuminosityErrorLow, random),
        SemiMajorAxisAu = Positive(Pick(planet.SemiMajorAxisAu, planet.SemiMajorAxisErrorHigh, planet.SemiMajorAxisErrorLow, random)),
        Eccentricity = planet.Eccentricity is null ? null :
            Math.Clamp(Pick(planet.Eccentricity, planet.EccentricityErrorHigh, planet.EccentricityErrorLow, random)!.Value, 0, .999)
    };

    private static double? Pick(double? value, double? high, double? low, Random random)
    {
        if (value is null || !HasError(high, low)) return value;
        var z = Math.Sqrt(-2 * Math.Log(1 - random.NextDouble())) * Math.Cos(2 * Math.PI * random.NextDouble());
        var sigma = z >= 0
            ? high is > 0 ? high.Value : Math.Abs(low!.Value)
            : low is < 0 ? Math.Abs(low.Value) : high!.Value;
        return value + z * sigma;
    }

    private static double? Positive(double? value) => value is null ? null : Math.Max(value.Value, .000001);
    private static bool HasError(double? high, double? low) =>
        high is > 0 && double.IsFinite(high.Value) || low is < 0 && double.IsFinite(low.Value);

    private static (int known, int total) Coverage(NasaPlanet planet)
    {
        var fields = new List<(double? value, double? high, double? low)>
        {
            (planet.RadiusEarth, planet.RadiusErrorHigh, planet.RadiusErrorLow),
            (planet.MassEarth, planet.MassErrorHigh, planet.MassErrorLow),
            (planet.StellarTemperatureK, planet.StellarTemperatureErrorHigh, planet.StellarTemperatureErrorLow),
            (planet.Eccentricity, planet.EccentricityErrorHigh, planet.EccentricityErrorLow)
        };
        if (planet.FluxEarth is > 0 && planet.FluxLimit is null or 0)
            fields.Add((planet.FluxEarth, planet.FluxErrorHigh, planet.FluxErrorLow));
        else
        {
            fields.Add((planet.StellarLogLuminosity, planet.StellarLogLuminosityErrorHigh, planet.StellarLogLuminosityErrorLow));
            fields.Add((planet.SemiMajorAxisAu, planet.SemiMajorAxisErrorHigh, planet.SemiMajorAxisErrorLow));
        }
        var present = fields.Where(field => field.value is not null).ToArray();
        return (present.Count(field => HasError(field.high, field.low)), present.Length);
    }

    private static double Percentile(IReadOnlyList<double> sorted, double fraction, double fallback) =>
        sorted.Count == 0 ? fallback : sorted[(int)Math.Round((sorted.Count - 1) * fraction)];
    private static double Percentile(IReadOnlyList<int> sorted, double fraction, double fallback) =>
        sorted.Count == 0 ? fallback : sorted[(int)Math.Round((sorted.Count - 1) * fraction)];

    private sealed class SampledRank
    {
        public List<int> Ranks { get; } = [];
        public List<double> Scores { get; } = [];
        public int Top50Count { get; set; }
    }
}
