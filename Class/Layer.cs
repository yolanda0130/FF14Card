namespace FF14Card.Class
{
    public class Layer
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = "";
        public string DataUrl { get; set; } = "";
        public bool Visible { get; set; } = true;   // 新增
    }
    public class LayerItem
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = "";
        public string ImageUrl { get; set; } = "";        // SVG 路徑或 base64
        public double X { get; set; } = 100;
        public double Y { get; set; } = 100;
        public double Rotation { get; set; } = 0;
        public double Scale { get; set; } = 1.0;
        public double Opacity { get; set; } = 1.0;
        public int ZIndex { get; set; } = 0;
        public bool IsVisible { get; set; } = true;
        public bool IsBuiltIn { get; set; } = false;
        /// <summary>
        /// 用於存儲 JavaScript 側的圖層 ID（確保同步）
        /// </summary>
        public string JsLayerId { get; set; } = "";
    }
}
