export async function restoreCanvasState(json) {
    try {
        const layers = JSON.parse(json);
        const canvas = document.getElementById('myCanvas');
        if (!canvas) {
            console.error("找不到 myCanvas");
            return;
        }

        if (!layers || layers.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // 清空全域 images 陣列，準備重新加載
        if (window.__ff14card_images) {
            window.__ff14card_images.length = 0;
        }

        // 清空 canvas
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 確保 canvas 已正確初始化
        if (typeof init === 'function') {
            init();
        }

        // 按照 zIndex 排序圖層
        const sortedLayers = [...layers].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        // 使用全域函數來重新加載圖片
        for (const layer of sortedLayers) {
            const imageUrl = layer.imageUrl;
            if (!imageUrl) continue;

            const isBuiltIn = layer.isBuiltIn || false;
            const jsLayerId = layer.jsLayerId || layer.id || Date.now() + Math.random();

            // 等待圖片加載完成
            await new Promise((resolve) => {
                const img = new Image();

                img.onload = () => {
                    // 使用 addFullSizeImage 函數來添加圖片（確保與初始加載邏輯一致）
                    if (typeof addFullSizeImage === 'function') {
                        addFullSizeImage('myCanvas', imageUrl, jsLayerId, isBuiltIn);
                    } else {
                        // 備用方案：直接操作全域 images 陣列
                        const canvasWidth = canvas.width;
                        const canvasHeight = canvas.height;
                        const scaleX = canvasWidth / img.width;
                        const scaleY = canvasHeight / img.height;
                        const scale = Math.min(scaleX, scaleY);

                        const imgData = {
                            id: jsLayerId,
                            element: img,
                            x: (canvasWidth - img.width * scale) / 2,
                            y: (canvasHeight - img.height * scale) / 2,
                            width: img.width,
                            height: img.height,
                            scale: scale,
                            rotation: layer.rotation || 0,
                            opacity: layer.opacity || 1,
                            visible: layer.isVisible !== false,
                            builtIn: !!isBuiltIn,
                            zIndex: layer.zIndex || 0,
                            Name: layer.name || imageUrl
                        };

                        if (window.__ff14card_images) {
                            window.__ff14card_images.push(imgData);
                        }
                    }
                    resolve();
                };

                img.onerror = () => {
                    console.error("圖片載入失敗:", imageUrl);
                    resolve();
                };

                img.src = imageUrl;
            });
        }

        // 重新繪製（如果備用方案被使用）
        if (typeof redraw === 'function') {
            redraw();
        }

    } catch (e) {
        console.error("restoreCanvasState 發生錯誤", e);
    }
}

export function notifyStateChangedToDotNet(layers) {
    if (window.dotNetRef) {
        const json = JSON.stringify(layers);
        window.dotNetRef.invokeMethodAsync('UpdateLayerFromJs', json)
            .catch(err => console.error("通知 C# 失敗", err));
    }
}

// 如果之後需要，也可以再加其他工具函式
export function clearCanvas() {
    const canvas = document.getElementById('mainCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}
