using System.Globalization;
using System.Text.Json;
using Microsoft.VisualBasic.FileIO;

namespace Planets.Api;

public sealed record HwcWorld(string Name, int Category, double? Esi);
public sealed record HwcSnapshot(DateTimeOffset FetchedAt, IReadOnlyList<HwcWorld> Worlds);

public sealed class HwcService(IWebHostEnvironment environment, IHttpClientFactory clients,
    ILogger<HwcService> logger)
{
    private const string CsvUrl = "https://www.hpcf.upr.edu/~abel/phl/hwc/data/hwc.csv";
    private readonly string _cachePath = Path.Combine(environment.ContentRootPath, "data", "hwc.json");
    private readonly SemaphoreSlim _gate = new(1, 1);
    private volatile HwcSnapshot? _current;
    private DateTimeOffset _nextAttempt;

    /// <summary>Timeout of the CSV download; tests shorten it.</summary>
    public TimeSpan RequestTimeout { get; init; } = TimeSpan.FromSeconds(25);

    public async Task<HwcSnapshot?> GetAsync(CancellationToken cancellationToken)
    {
        if (_current is null && DateTimeOffset.UtcNow < _nextAttempt) return null;
        if (_current is not null && DateTimeOffset.UtcNow < _nextAttempt) return _current;
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_current is null && DateTimeOffset.UtcNow < _nextAttempt) return null;
            if (_current is not null && DateTimeOffset.UtcNow < _nextAttempt) return _current;
            if (_current is null && File.Exists(_cachePath))
            {
                try
                {
                    await using var file = File.OpenRead(_cachePath);
                    _current = await JsonSerializer.DeserializeAsync<HwcSnapshot>(file, cancellationToken: cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Could not load HWC cache");
                }
            }

            try
            {
                using var client = clients.CreateClient();
                client.Timeout = RequestTimeout;
                var csv = await client.GetStringAsync(CsvUrl, cancellationToken);
                var worlds = Parse(csv);
                if (worlds.Count < 20) throw new InvalidDataException("HWC returned too few habitable worlds");
                _current = new HwcSnapshot(DateTimeOffset.UtcNow, worlds);
                Directory.CreateDirectory(Path.GetDirectoryName(_cachePath)!);
                var tmp = _cachePath + ".tmp";
                await File.WriteAllTextAsync(tmp, JsonSerializer.Serialize(_current), cancellationToken);
                File.Move(tmp, _cachePath, true);
                _nextAttempt = DateTimeOffset.UtcNow.AddHours(24);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                // A 25 s HttpClient timeout is a TaskCanceledException with our token not cancelled.
                logger.LogWarning(ex, "HWC refresh failed; keeping last catalog");
                _nextAttempt = DateTimeOffset.UtcNow.AddMinutes(15);
            }
            return _current;
        }
        finally { _gate.Release(); }
    }

    public static IReadOnlyList<HwcWorld> Parse(string csv)
    {
        using var reader = new StringReader(csv);
        using var parser = new TextFieldParser(reader) { HasFieldsEnclosedInQuotes = true };
        parser.SetDelimiters(",");
        var header = parser.ReadFields() ?? throw new InvalidDataException("HWC CSV has no header");
        var names = header.Select((name, index) => (name: name.Trim().TrimStart('\uFEFF'), index))
            .ToDictionary(x => x.name, x => x.index, StringComparer.OrdinalIgnoreCase);
        int Column(string name) => names.TryGetValue(name, out var index) ? index : -1;
        var nameColumn = Column("P_NAME");
        var categoryColumn = Column("P_HABITABLE");
        var esiColumn = Column("P_ESI");
        if (nameColumn < 0 || categoryColumn < 0)
            throw new InvalidDataException("HWC CSV lacks P_NAME or P_HABITABLE");

        var worlds = new List<HwcWorld>();
        while (!parser.EndOfData)
        {
            var row = parser.ReadFields();
            if (row is null || row.Length <= Math.Max(nameColumn, categoryColumn)) continue;
            var name = row[nameColumn].Trim();
            if (name.Length == 0 || !int.TryParse(row[categoryColumn], out var category) || category is < 1 or > 2)
                continue;
            double? esi = esiColumn >= 0 && row.Length > esiColumn &&
                double.TryParse(row[esiColumn], NumberStyles.Float, CultureInfo.InvariantCulture, out var value) &&
                double.IsFinite(value) ? value : null;
            worlds.Add(new HwcWorld(name, category, esi));
        }
        return worlds;
    }
}
