using System.Text.Json;
using FF14Card.Class;

namespace FF14Card.Services;   // ← 記得改成你的 namespace

public class CanvasStateService
{
    public List<LayerItem> Layers { get; private set; } = new();
    public Guid? SelectedLayerId { get; set; }

    public event Action? OnStateChanged;

    public void SetLayers(List<LayerItem> layers)
    {
        Layers = layers ?? new List<LayerItem>();
        NotifyStateChanged();
    }

    public void AddLayer(LayerItem layer)
    {
        Layers.Add(layer);
        NotifyStateChanged();
    }

    public void RemoveLayer(Guid id)
    {
        Layers.RemoveAll(l => l.Id == id);
        if (SelectedLayerId == id) SelectedLayerId = null;
        NotifyStateChanged();
    }

    public void UpdateLayer(LayerItem layer)
    {
        var index = Layers.FindIndex(l => l.Id == layer.Id);
        if (index >= 0)
        {
            Layers[index] = layer;
            NotifyStateChanged();
        }
    }

    public void Clear()
    {
        Layers.Clear();
        SelectedLayerId = null;
        NotifyStateChanged();
    }

    public string ExportToJson() => JsonSerializer.Serialize(Layers, new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    });

    public void ImportFromJson(string json)
    {
        if (!string.IsNullOrWhiteSpace(json))
        {
            var list = JsonSerializer.Deserialize<List<LayerItem>>(json);
            if (list != null) Layers = list;
        }
        NotifyStateChanged();
    }

    private void NotifyStateChanged() => OnStateChanged?.Invoke();
}
