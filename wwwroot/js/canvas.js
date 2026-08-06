var canvas, ctx;
var images = window.__ff14card_images || [];
window.__ff14card_images = images;
var selectedImageId = null;
var currentImage = null;

// 裁切相關
var cropMode = false;
var isCropping = false;
var cropStart = null; // {x,y}
var cropRect = null;  // {x,y,w,h}
var cropDragging = false;
var cropResizing = false;
var cropResizeDir = null;
var cropDragOffsetX = 0;
var cropDragOffsetY = 0;

function init() {
    canvas = document.getElementById('myCanvas');
    ctx = canvas.getContext('2d');

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('wheel', onWheel);
}

// Normalize zIndex: assign continuous zIndex for non-built-in (0..n-1) then built-in (n..)
function normalizeZIndices() {
    const nonBuilt = images.filter(i => !i.builtIn).sort((a, b) => a.zIndex - b.zIndex);
    nonBuilt.forEach((img, idx) => img.zIndex = idx);
    const built = images.filter(i => i.builtIn).sort((a, b) => a.zIndex - b.zIndex);
    let base = nonBuilt.length;
    built.forEach((img, idx) => img.zIndex = base + idx);
}

// Helper: ensure newly pushed built-in images get upper zIndex by default
function ensureBuiltInTopOnAdd() {
    normalizeZIndices();
}

function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sortedImages = [...images].sort((a, b) => a.zIndex - b.zIndex);

    sortedImages.forEach(img => {
        ctx.drawImage(
            img.element,
            img.x,
            img.y,
            img.width * img.scale,
            img.height * img.scale
        );
    });

    // 畫選取框
    if (selectedImageId) {
        const img = images.find(i => i.id === selectedImageId);
        if (img) {
            const w = img.width * img.scale;
            const h = img.height * img.scale;

            ctx.strokeStyle = '#0066ff';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(img.x, img.y, w, h);
            ctx.setLineDash([]);

            // 畫四個角落控制點
            drawHandle(img.x, img.y);
            drawHandle(img.x + w, img.y);
            drawHandle(img.x, img.y + h);
            drawHandle(img.x + w, img.y + h);
        }
    }

    // 畫裁切框（若存在）
    if (cropRect && cropRect.w > 0 && cropRect.h > 0) {
        ctx.save();
        // 更深的半透明遮罩以便與裁切區對比
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 使用 composite 操作在遮罩上挖出透明洞
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fillRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
        ctx.globalCompositeOperation = 'source-over';

        // 內部保持透明（不再填白）

        // 裁切框邊線（更明顯的黃色）
        ctx.strokeStyle = '#ffff55';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(cropRect.x + 0.5, cropRect.y + 0.5, cropRect.w, cropRect.h);
        ctx.setLineDash([]);

        // 畫四個角落控制點（較明顯的黃色方塊）
        const handleSize = 12;
        const half = handleSize / 2;
        const corners = [
            { x: cropRect.x, y: cropRect.y },
            { x: cropRect.x + cropRect.w, y: cropRect.y },
            { x: cropRect.x, y: cropRect.y + cropRect.h },
            { x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h }
        ];
        corners.forEach(c => {
            ctx.fillStyle = '#ffff55';
            ctx.fillRect(Math.round(c.x - half), Math.round(c.y - half), handleSize, handleSize);
            ctx.strokeStyle = '#333300';
            ctx.lineWidth = 1;
            ctx.strokeRect(Math.round(c.x - half), Math.round(c.y - half), handleSize, handleSize);
        });

        ctx.restore();
    }
}

function drawHandle(x, y) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0066ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

window.addDraggableImage = function (canvasId, dataUrl, id) {
    if (!canvas) init();

    const img = new Image();
    img.onload = function () {
        const scale = Math.min(1.0, 700 / Math.max(img.width, img.height));

        const newImg = {
            id: id,
            element: img,
            x: 100 + Math.random() * 120,
            y: 80 + Math.random() * 80,
            width: img.width,
            height: img.height,
            scale: scale,
            // 預設 zIndex 為現有非內建圖層的最大值 + 1，使新圖位於使用者圖層最上方
            zIndex: (images.filter(i => !i.builtIn).reduce((m, it) => Math.max(m, it.zIndex ?? 0), -1) + 1)
        };

        images.push(newImg);
        normalizeZIndices();
        redraw();
    };
    img.src = dataUrl;
};

window.setSelectedLayer = function (id) {
    selectedImageId = id;
};

window.bringToFront = function (canvasId, id) {
    const img = images.find(i => i.id === id);
    if (img) {
        images = images.filter(i => i.id !== id);
        img.zIndex = images.length-2;
        images.push(img);
        redraw();
    }
};

window.sendToBack = function (canvasId, id) {
    const img = images.find(i => i.id === id);
    if (img) {
        images = images.filter(i => i.id !== id);
        img.zIndex = 0;
        images.unshift(img);
        redraw();
    }
};

window.addFullSizeImage = function (canvasId, dataUrl, id) {
    // backward-compatible: if 4th arg passed, treat as builtIn flag
    const builtIn = arguments.length >= 4 ? arguments[3] : false;

    // 只有非內建圖片才受限於 images.length >= 2 的檢查
    if (!builtIn && images.length >= 2) {
        console.warn("已達到最大圖片數量限制（2）");
        return;
    }

    if (!canvas) init();

    const img = new Image();
    img.onload = function () {


        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        // 計算填滿畫布的比例
        const scaleX = canvasWidth / img.width;
        const scaleY = canvasHeight / img.height;
        const scale = Math.min(scaleX, scaleY);  // 保持比例填滿

        const imgname = dataUrl.includes("刀模");

        const newImg = {
            id: id,
            element: img,
            x: (canvasWidth - img.width * scale) / 2,   // 置中
            y: (canvasHeight - img.height * scale) / 2,
            width: img.width,
            height: img.height,
            scale: scale,
            visible: true,
            builtIn: !!builtIn,
            zIndex: images.length,
            Name: imgname
        };

        images.push(newImg);
        normalizeZIndices();
        redraw();
    };
    img.onerror = function () {
        console.error("圖片載入失敗: " + dataUrl);
    };
    img.src = dataUrl;
};

window.replaceImage = function (canvasId, dataUrl, id) {
    if (!canvas) init();

    const img = new Image();
    img.onload = function () {


        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        // 計算填滿畫布的比例（保持原始比例）
        const scaleX = canvasWidth / img.width;
        const scaleY = canvasHeight / img.height;
        const scale = Math.min(scaleX, scaleY);

        // 找到原本的圖片並替換內容
        const existingImg = images.find(i => i.id === id);

        if (existingImg) {
            // 替換圖片內容，但保持原本的位置和 zIndex
            existingImg.element = img;
            existingImg.width = img.width;
            existingImg.height = img.height;
            existingImg.scale = scale;
            existingImg.x = (canvasWidth - img.width * scale) / 2;
            existingImg.y = (canvasHeight - img.height * scale) / 2;
        } else {
            // 如果找不到，就新增（保險）
            const newImg = {
                id: id,
                element: img,
                x: (canvasWidth - img.width * scale) / 2,
                y: (canvasHeight - img.height * scale) / 2,
                width: img.width,
                height: img.height,
                scale: scale,
                visible: true,
                zIndex: images.length
            };
            images.push(newImg);
            normalizeZIndices();
        }

        redraw();
    };
    img.onerror = function () {
        console.error("圖片載入失敗: " + dataUrl);
    };
    img.src = dataUrl;
};

window.clearCanvas = function () {
    // 只保留內建圖片 (builtIn === true)
    images = images.filter(img => img.builtIn === true);

    selectedImageId = null;

    if (canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        redraw();   // 重新繪製內建圖片
    }
};

// ===== 下載功能 =====
// 直接下載 Canvas 原始尺寸的 PNG 圖片（不縮放）
window.downloadImage = function (canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // 創建與 Canvas 相同尺寸的新 Canvas（直接複製，不縮放）
    const downloadCanvas = document.createElement('canvas');
    downloadCanvas.width = canvas.width;
    downloadCanvas.height = canvas.height;
    const ctx = downloadCanvas.getContext('2d', { alpha: false });

    // 白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, downloadCanvas.width, downloadCanvas.height);

    // 直接繪製所有圖片（按 zIndex 排序）
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const sortedImages = [...images].sort((a, b) => a.zIndex - b.zIndex);

    sortedImages.forEach((img) => {
        if (img.Name) return;  // 跳過內建圖片

        ctx.drawImage(img.element, img.x, img.y, img.width * img.scale, img.height * img.scale);
    });

    // 生成 PNG 資料
    let dataUrl = downloadCanvas.toDataURL('image/png', 1.0);

    // 壓縮直到小於 15MB（如果需要）
    let attempts = 0;
    while (dataUrl.length * 0.75 > 15 * 1024 * 1024 && attempts < 10) {
        attempts++;
        dataUrl = downloadCanvas.toDataURL('image/png', 1.0 - attempts * 0.1);
    }

    // 生成檔名（包含日期時間）
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const filename = `FF14Card_${year}${month}${day}_${hours}${minutes}.png`;

    // 下載
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
};

// 保留舊的 downloadHighResA4 函數以兼容性
window.downloadHighResA4 = function (canvasId, targetWidth, targetHeight) {
    window.downloadImage(canvasId);
};

// ==================== 拖曳 + 四角/四邊調整 + 游標提示 ====================
var isDragging = false;
var isResizing = false;
var resizeDirection = null;
var selectedImage = null;
var offsetX = 0, offsetY = 0;

function onMouseDown(e) {
    if (!selectedImageId && !cropMode) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    // 如果處於裁切模式，先檢查是否點在既有裁切框的邊/角/內部以做調整，否則開始畫裁切框
    if (cropMode) {
        // 如果已有有效裁切框，先做 hit test
        if (cropRect && cropRect.w > 0 && cropRect.h > 0) {
            const left = cropRect.x;
            const top = cropRect.y;
            const right = cropRect.x + cropRect.w;
            const bottom = cropRect.y + cropRect.h;
            const cornerSize = 12;
            const edgeSize = 10;

            // 角落
            if (Math.abs(mouseX - left) <= cornerSize && Math.abs(mouseY - top) <= cornerSize) {
                cropResizing = true; cropResizeDir = 'nw'; return;
            }
            if (Math.abs(mouseX - right) <= cornerSize && Math.abs(mouseY - top) <= cornerSize) {
                cropResizing = true; cropResizeDir = 'ne'; return;
            }
            if (Math.abs(mouseX - left) <= cornerSize && Math.abs(mouseY - bottom) <= cornerSize) {
                cropResizing = true; cropResizeDir = 'sw'; return;
            }
            if (Math.abs(mouseX - right) <= cornerSize && Math.abs(mouseY - bottom) <= cornerSize) {
                cropResizing = true; cropResizeDir = 'se'; return;
            }

            // 邊
            if (mouseY >= top - edgeSize && mouseY <= top + edgeSize && mouseX > left && mouseX < right) {
                cropResizing = true; cropResizeDir = 'n'; return;
            }
            if (mouseY >= bottom - edgeSize && mouseY <= bottom + edgeSize && mouseX > left && mouseX < right) {
                cropResizing = true; cropResizeDir = 's'; return;
            }
            if (mouseX >= left - edgeSize && mouseX <= left + edgeSize && mouseY > top && mouseY < bottom) {
                cropResizing = true; cropResizeDir = 'w'; return;
            }
            if (mouseX >= right - edgeSize && mouseX <= right + edgeSize && mouseY > top && mouseY < bottom) {
                cropResizing = true; cropResizeDir = 'e'; return;
            }

            // 框內則開始拖動
            if (mouseX >= left && mouseX <= right && mouseY >= top && mouseY <= bottom) {
                cropDragging = true;
                cropDragOffsetX = mouseX - cropRect.x;
                cropDragOffsetY = mouseY - cropRect.y;
                return;
            }
        }

        // 否則開始新裁切（限定在已選圖層範圍內）
        const selImg = images.find(i => i.id === selectedImageId);
        if (!selImg) return; // 必須有選取圖層
        const imgLeft = selImg.x;
        const imgTop = selImg.y;
        const imgRight = selImg.x + selImg.width * selImg.scale;
        const imgBottom = selImg.y + selImg.height * selImg.scale;

        // 如果點擊在圖像外則不開始
        if (mouseX < imgLeft || mouseX > imgRight || mouseY < imgTop || mouseY > imgBottom) {
            return;
        }

        // 將起點限制在圖像內
        const startX = Math.max(imgLeft, Math.min(imgRight, mouseX));
        const startY = Math.max(imgTop, Math.min(imgBottom, mouseY));
        isCropping = true;
        cropStart = { x: startX, y: startY };
        cropRect = { x: startX, y: startY, w: 0, h: 0 };
        redraw();
        return;
    }

    const img = images.find(i => i.id === selectedImageId);
    if (!img) return;

    const w = img.width * img.scale;
    const h = img.height * img.scale;
    const left = img.x;
    const top = img.y;
    const right = left + w;
    const bottom = top + h;

    const corner = 25;
    const edge = 12;

    // 四角
    if (Math.abs(mouseX - left) < corner && Math.abs(mouseY - top) < corner) {
        isResizing = true;
        resizeDirection = 'nw';
        selectedImage = img;
        return;
    }
    if (Math.abs(mouseX - right) < corner && Math.abs(mouseY - top) < corner) {
        isResizing = true;
        resizeDirection = 'ne';
        selectedImage = img;
        return;
    }
    if (Math.abs(mouseX - left) < corner && Math.abs(mouseY - bottom) < corner) {
        isResizing = true;
        resizeDirection = 'sw';
        selectedImage = img;
        return;
    }
    if (Math.abs(mouseX - right) < corner && Math.abs(mouseY - bottom) < corner) {
        isResizing = true;
        resizeDirection = 'se';
        selectedImage = img;
        return;
    }

    // 四邊
    if (mouseY >= top - edge && mouseY <= top + edge && mouseX > left && mouseX < right) {
        isResizing = true;
        resizeDirection = 'n';
        selectedImage = img;
        return;
    }
    if (mouseY >= bottom - edge && mouseY <= bottom + edge && mouseX > left && mouseX < right) {
        isResizing = true;
        resizeDirection = 's';
        selectedImage = img;
        return;
    }
    if (mouseX >= left - edge && mouseX <= left + edge && mouseY > top && mouseY < bottom) {
        isResizing = true;
        resizeDirection = 'w';
        selectedImage = img;
        return;
    }
    if (mouseX >= right - edge && mouseX <= right + edge && mouseY > top && mouseY < bottom) {
        isResizing = true;
        resizeDirection = 'e';
        selectedImage = img;
        return;
    }

    // 移動
    if (mouseX >= left && mouseX <= right && mouseY >= top && mouseY <= bottom) {
        isDragging = true;
        selectedImage = img;
        offsetX = mouseX - img.x;
        offsetY = mouseY - img.y;
    }
}

function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    updateCursor(mouseX, mouseY);   // 也要傳入修正後座標

    // 裁切模式下更新裁切框（限制在選取圖像範圍內）
    if (isCropping && cropStart) {
        const selImg = images.find(i => i.id === selectedImageId);
        if (!selImg) return;
        const imgLeft = selImg.x;
        const imgTop = selImg.y;
        const imgRight = selImg.x + selImg.width * selImg.scale;
        const imgBottom = selImg.y + selImg.height * selImg.scale;

        // 計算原始矩形，然後與影像邊界作交集
        let x = Math.min(cropStart.x, mouseX);
        let y = Math.min(cropStart.y, mouseY);
        let w = Math.abs(mouseX - cropStart.x);
        let h = Math.abs(mouseY - cropStart.y);

        // 交集：把 x,y,w,h 約束在 imgLeft..imgRight, imgTop..imgBottom
        const rx1 = Math.max(imgLeft, x);
        const ry1 = Math.max(imgTop, y);
        const rx2 = Math.min(imgRight, x + w);
        const ry2 = Math.min(imgBottom, y + h);

        const newW = Math.max(0, rx2 - rx1);
        const newH = Math.max(0, ry2 - ry1);

        cropRect = { x: Math.round(rx1), y: Math.round(ry1), w: Math.round(newW), h: Math.round(newH) };
        redraw();
        return;
    }

    // 調整或移動既有裁切框
    if (cropMode && (cropResizing || cropDragging)) {
        const selImg = images.find(i => i.id === selectedImageId);
        if (!selImg || !cropRect) return;
        const imgLeft = selImg.x;
        const imgTop = selImg.y;
        const imgRight = selImg.x + selImg.width * selImg.scale;
        const imgBottom = selImg.y + selImg.height * selImg.scale;

        if (cropResizing) {
            // 計算欲調整的暫時值，再做邊界限制
            let newX = cropRect.x;
            let newY = cropRect.y;
            let newW = cropRect.w;
            let newH = cropRect.h;

            switch (cropResizeDir) {
                case 'se':
                    newW = Math.max(5, mouseX - cropRect.x);
                    newH = Math.max(5, mouseY - cropRect.y);
                    break;
                case 'nw': {
                    newX = Math.min(cropRect.x + cropRect.w - 5, mouseX);
                    newY = Math.min(cropRect.y + cropRect.h - 5, mouseY);
                    newW = Math.max(5, cropRect.x + cropRect.w - newX);
                    newH = Math.max(5, cropRect.y + cropRect.h - newY);
                    break;
                }
                case 'ne': {
                    newY = Math.min(cropRect.y + cropRect.h - 5, mouseY);
                    newW = Math.max(5, mouseX - cropRect.x);
                    newH = Math.max(5, cropRect.y + cropRect.h - newY);
                    break;
                }
                case 'sw': {
                    newX = Math.min(cropRect.x + cropRect.w - 5, mouseX);
                    newW = Math.max(5, cropRect.x + cropRect.w - newX);
                    newH = Math.max(5, mouseY - cropRect.y);
                    break;
                }
                case 'n': {
                    newY = Math.min(cropRect.y + cropRect.h - 5, mouseY);
                    newH = Math.max(5, cropRect.y + cropRect.h - newY);
                    break;
                }
                case 's':
                    newH = Math.max(5, mouseY - cropRect.y);
                    break;
                case 'w': {
                    newX = Math.min(cropRect.x + cropRect.w - 5, mouseX);
                    newW = Math.max(5, cropRect.x + cropRect.w - newX);
                    break;
                }
                case 'e':
                    newW = Math.max(5, mouseX - cropRect.x);
                    break;
            }

            // Clamp to image bounds
            if (newX < imgLeft) {
                newW -= (imgLeft - newX);
                newX = imgLeft;
            }
            if (newY < imgTop) {
                newH -= (imgTop - newY);
                newY = imgTop;
            }
            if (newX + newW > imgRight) {
                newW = Math.max(5, imgRight - newX);
            }
            if (newY + newH > imgBottom) {
                newH = Math.max(5, imgBottom - newY);
            }

            cropRect.x = Math.round(newX);
            cropRect.y = Math.round(newY);
            cropRect.w = Math.round(newW);
            cropRect.h = Math.round(newH);
            redraw();
            return;
        }

        if (cropDragging) {
            // 拖移時限制在影像範圍內
            let newX = mouseX - cropDragOffsetX;
            let newY = mouseY - cropDragOffsetY;
            newX = Math.max(imgLeft, Math.min(imgRight - cropRect.w, newX));
            newY = Math.max(imgTop, Math.min(imgBottom - cropRect.h, newY));
            cropRect.x = Math.round(newX);
            cropRect.y = Math.round(newY);
            redraw();
            return;
        }
    }

    if (isResizing && selectedImage) {
        handleResize(selectedImage, mouseX, mouseY);
        redraw();
        return;
    }

    if (isDragging && selectedImage) {
        selectedImage.x = mouseX - offsetX;
        selectedImage.y = mouseY - offsetY;
        redraw();
    }
}

function updateCursor(mouseX, mouseY) {
    // 裁切模式下，依照游標位置顯示合適的游標（角落/邊/移動/十字）
    if (cropMode) {
        if (cropRect && cropRect.w > 0 && cropRect.h > 0) {
            const left = cropRect.x;
            const top = cropRect.y;
            const right = cropRect.x + cropRect.w;
            const bottom = cropRect.y + cropRect.h;
            const corner = 12;
            const edge = 10;

            if ((Math.abs(mouseX - left) <= corner && Math.abs(mouseY - top) <= corner) ||
                (Math.abs(mouseX - right) <= corner && Math.abs(mouseY - bottom) <= corner)) {
                canvas.style.cursor = 'nwse-resize';
                return;
            }
            if ((Math.abs(mouseX - right) <= corner && Math.abs(mouseY - top) <= corner) ||
                (Math.abs(mouseX - left) <= corner && Math.abs(mouseY - bottom) <= corner)) {
                canvas.style.cursor = 'nesw-resize';
                return;
            }

            if (mouseY >= top - edge && mouseY <= top + edge && mouseX > left && mouseX < right) {
                canvas.style.cursor = 'ns-resize';
                return;
            }
            if (mouseY >= bottom - edge && mouseY <= bottom + edge && mouseX > left && mouseX < right) {
                canvas.style.cursor = 'ns-resize';
                return;
            }
            if (mouseX >= left - edge && mouseX <= left + edge && mouseY > top && mouseY < bottom) {
                canvas.style.cursor = 'ew-resize';
                return;
            }
            if (mouseX >= right - edge && mouseX <= right + edge && mouseY > top && mouseY < bottom) {
                canvas.style.cursor = 'ew-resize';
                return;
            }

            if (mouseX >= left && mouseX <= right && mouseY >= top && mouseY <= bottom) {
                canvas.style.cursor = 'move';
                return;
            }
        }

        canvas.style.cursor = 'crosshair';
        return;
    }

    if (!selectedImageId) {
        canvas.style.cursor = 'default';
        return;
    }

    const img = images.find(i => i.id === selectedImageId);
    if (!img) {
        canvas.style.cursor = 'default';
        return;
    }

    const w = img.width * img.scale;
    const h = img.height * img.scale;
    const left = img.x;
    const top = img.y;
    const right = left + w;
    const bottom = top + h;

    const corner = 25;
    const edge = 12;

    // 四個角
    if ((Math.abs(mouseX - left) < corner && Math.abs(mouseY - top) < corner) ||
        (Math.abs(mouseX - right) < corner && Math.abs(mouseY - bottom) < corner)) {
        canvas.style.cursor = 'nwse-resize';
    }
    else if ((Math.abs(mouseX - right) < corner && Math.abs(mouseY - top) < corner) ||
        (Math.abs(mouseX - left) < corner && Math.abs(mouseY - bottom) < corner)) {
        canvas.style.cursor = 'nesw-resize';
    }
    // 四邊
    else if (mouseY >= top - edge && mouseY <= top + edge && mouseX > left && mouseX < right) {
        canvas.style.cursor = 'ns-resize';
    }
    else if (mouseY >= bottom - edge && mouseY <= bottom + edge && mouseX > left && mouseX < right) {
        canvas.style.cursor = 'ns-resize';
    }
    else if (mouseX >= left - edge && mouseX <= left + edge && mouseY > top && mouseY < bottom) {
        canvas.style.cursor = 'ew-resize';
    }
    else if (mouseX >= right - edge && mouseX <= right + edge && mouseY > top && mouseY < bottom) {
        canvas.style.cursor = 'ew-resize';
    }
    // // 圖片內部 = 普通移動游標
    // else if (mouseX >= left && mouseX <= right && mouseY >= top && mouseY <= bottom) {
    //     canvas.style.cursor = 'move';
    // }
    else {
        canvas.style.cursor = 'default';
    }
}

function handleResize(img, mouseX, mouseY) {
    // ... 保持上一個版本的 handleResize ...
    const currentW = img.width * img.scale;
    const currentH = img.height * img.scale;
    const ratio = currentW / currentH;   // 原始長寬比
    let newW, newH;

    switch (resizeDirection) {
        case 'se': // 右下角 - 等比
            newW = Math.max(50, mouseX - img.x);
            newH = newW / ratio;
            img.width = newW / img.scale;
            img.height = newH / img.scale;
            break;

        case 'nw': // 左上角 - 等比
            newW = Math.max(50, currentW - (mouseX - img.x));
            newH = newW / ratio;
            img.x = mouseX;
            img.y = mouseY;
            img.width = newW / img.scale;
            img.height = newH / img.scale;
            break;

        case 'ne': // 右上角 - 等比
            newW = Math.max(50, mouseX - img.x);
            newH = newW / ratio;
            img.y = mouseY;
            img.width = newW / img.scale;
            img.height = newH / img.scale;
            break;

        case 'sw': // 左下角 - 等比
            newW = Math.max(50, currentW - (mouseX - img.x));
            newH = newW / ratio;
            img.x = mouseX;
            img.width = newW / img.scale;
            img.height = newH / img.scale;
            break;
        // ... 其他方向保持不變 ...
        case 'n':
            const nH = Math.max(30, currentH - (mouseY - img.y));
            img.y = mouseY;
            img.height = nH / img.scale;
            break;
        case 's':
            img.height = Math.max(30, (mouseY - img.y) / img.scale);
            break;
        case 'w':
            const wW = Math.max(30, currentW - (mouseX - img.x));
            img.x = mouseX;
            img.width = wW / img.scale;
            break;
        case 'e':
            img.width = Math.max(30, (mouseX - img.x) / img.scale);
            break;
    }
}

function onMouseUp() {
    // 結束裁切或拖曳/調整
    if (isCropping) {
        isCropping = false;
        cropStart = null;
        // 保留 cropRect 直到使用者按下套用或取消
        canvas.style.cursor = 'crosshair';

        redraw();
        return;
    }

    // 結束裁切拖動/調整
    if (cropDragging || cropResizing) {
        cropDragging = false;
        cropResizing = false;
        cropResizeDir = null;

        redraw();
        // don't return; allow image drag state to reset below
    }

    isDragging = false;
    isResizing = false;
    resizeDirection = null;
    selectedImage = null;
    canvas.style.cursor = 'default';
}

function onWheel(e) {
    if (!selectedImageId) return;

    const img = images.find(i => i.id === selectedImageId);
    if (!img) return;

    e.preventDefault();

    // 決定縮放方向
    const zoomIn = e.deltaY < 0;
    const factor = zoomIn ? 1.08 : 0.925;   // 可調整縮放速度

    // === 關鍵：以圖片中心點縮放 ===
    const oldScale = img.scale;
    const newScale = oldScale * factor;

    // 限制縮放範圍
    img.scale = Math.max(0.1, Math.min(newScale, 10));

    // 計算縮放前後的中心點偏移，讓中心保持不動
    const centerX = img.x + (img.width * oldScale) / 2;
    const centerY = img.y + (img.height * oldScale) / 2;

    // 更新位置，讓中心點維持在相同位置
    img.x = centerX - (img.width * img.scale) / 2;
    img.y = centerY - (img.height * img.scale) / 2;

    redraw();
}

// 其他功能保持不變
window.deleteLayer = function (canvasId, id) {
    images = images.filter(img => img.id !== id);
    redraw();
};

window.resizeLayer = function (canvasId, id, newWidth, newHeight) {
    const img = images.find(i => i.id === id);
    if (img) {
        img.width = newWidth;
        img.height = newHeight;
        redraw();
    }
};

window.resetLayerSize = function (canvasId, id) {
    const img = images.find(i => i.id === id);
    if (img && img.element) {
        img.width = img.element.width;
        img.height = img.element.height;
        img.scale = 0.8;
        redraw();
    }
};

    // ==================== 圖層拖曳排序 ====================
window.makeLayerListSortable = function (listId) {
    // If user opted out of drag-to-sort, skip initialization
    const list = document.getElementById(listId);
    if (!list) return;
    if (list.dataset.sortable === 'false') return;
    // 確保所有的 .layer-item 都可被 HTML5 拖曳（draggable=true），否則 chrome 不會觸發 dragstart
    Array.from(list.querySelectorAll('.layer-item')).forEach(it => {
        try { it.setAttribute('draggable', 'true'); } catch (e) { }
    });

    // 清除殘留的 placeholder（若上次未正確移除）以避免一直新增空框
    Array.from(list.querySelectorAll('.layer-placeholder')).forEach(p => {
        try { p.parentNode && p.parentNode.removeChild(p); } catch (e) { }
    });
    // 只使用 container 層級的 dragstart/dragend 處理器（避免多重 handler 導致重複產生 placeholder）
    // 新增項目會由下面的 MutationObserver 自動設定 draggable 屬性
    // 為了避免重複綁定或無法移除先前的 handler，將 handler 存在 DOM element 的屬性上
    // 如果已存在則先移除
    if (list._sortableHandlers) {
        const h = list._sortableHandlers;
        try {
            list.removeEventListener('dragstart', h.handleDragStart);
            list.removeEventListener('dragend', h.handleDragEnd);
            list.removeEventListener('dragover', h.handleDragOver);
            list.removeEventListener('drop', h.handleDrop);
            // remove pointerdown handler if previously attached by pointer-based impl
            try { if (h.pointerDownHandler) list.removeEventListener('pointerdown', h.pointerDownHandler); } catch (e) { }
            // remove global handlers if present
            try { document.removeEventListener('drop', h.globalDrop); } catch (e) { }
            try { document.removeEventListener('dragend', h.globalDragEnd); } catch (e) { }
            // disconnect previous MutationObserver if exists
            try { if (h._mutationObserver && typeof h._mutationObserver.disconnect === 'function') h._mutationObserver.disconnect(); } catch (e) { }
        } catch (ex) {
            // ignore
        }
    }

    // pointer-based sortable implementation (more reliable than HTML5 drag/drop)
    var draggingEl = null;
   var placeholder = null;
    var ghost = null;
    var isDragging = false;
    var isPotentialDrag = false;
    var pointerStartX = 0;
    var pointerStartY = 0;
    const DRAG_THRESHOLD = 6; // pixels

    function createPlaceholder(height, margin) {
        const p = document.createElement('li');
        p.className = 'layer-placeholder';
        p.style.height = (height || 40) + 'px';
        if (margin) p.style.margin = margin;
        p.style.background = 'rgba(0,0,0,0.03)';
        p.style.border = '1px dashed rgba(0,0,0,0.08)';
        return p;
    }

    function createGhost(el, x, y) {
        const g = el.cloneNode(true);
        g.style.position = 'fixed';
        g.style.pointerEvents = 'none';
        g.style.zIndex = 9999;
        g.style.width = el.offsetWidth + 'px';
        g.style.opacity = '0.85';
        g.style.left = x + 'px';
        g.style.top = y + 'px';
        document.body.appendChild(g);
        return g;
    }

    function onPointerDown(e) {
        const target = e.target.closest && e.target.closest('.layer-item') || e.target;
        if (!target || !target.classList.contains('layer-item')) return;
        // don't prevent default so click events still fire when user just clicks
        draggingEl = target;
        isPotentialDrag = true;
        pointerStartX = e.clientX;
        pointerStartY = e.clientY;

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    }

    function onPointerMove(e) {
        // if we haven't decided it's a drag yet, check threshold
        if (!isDragging && isPotentialDrag && draggingEl) {
            const dx = e.clientX - pointerStartX;
            const dy = e.clientY - pointerStartY;
            if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
                // start actual drag
                isDragging = true;
                isPotentialDrag = false;
                const rect = draggingEl.getBoundingClientRect();
                const margin = getComputedStyle(draggingEl).margin;
                placeholder = createPlaceholder(rect.height, margin);
                ghost = createGhost(draggingEl, e.clientX - rect.width / 2, e.clientY - rect.height / 2);
                draggingEl.classList.add('dragging');
                draggingEl.style.opacity = '0.5';
            }
        }

        if (!isDragging || !draggingEl) return;

        if (ghost) {
            ghost.style.left = (e.clientX - ghost.offsetWidth/2) + 'px';
            ghost.style.top = (e.clientY - ghost.offsetHeight/2) + 'px';
        }

        const afterElement = getDragAfterElement(list, e.clientY);
        if (!placeholder.parentNode) {
            if (afterElement == null) list.appendChild(placeholder);
            else list.insertBefore(placeholder, afterElement);
        } else {
            if (afterElement == null) {
                if (placeholder.nextSibling) list.appendChild(placeholder);
            } else if (placeholder.nextSibling !== afterElement) {
                list.insertBefore(placeholder, afterElement);
            }
        }
    }

    function onPointerUp(e) {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);

        // if we never exceeded threshold, treat as click - do nothing here so click handlers run
        if (!isDragging) {
            // Some browsers suppress the native click after pointer listeners; if so,
            // dispatch a synthetic click on the LI to ensure Blazor @onclick runs.
            try {
                const el = draggingEl;
                isPotentialDrag = false;
                draggingEl = null;
                if (el) {
                    // schedule after event loop so native click (if any) fires first
                    setTimeout(() => {
                        try { el.click(); } catch (ex) { }
                    }, 0);
                }
            } catch (ex) {
                isPotentialDrag = false;
                draggingEl = null;
            }
            return;
        }

        // finish drag
        isDragging = false;

        try {
            if (placeholder && placeholder.parentNode === list) {
                list.insertBefore(draggingEl, placeholder);
                placeholder.remove();
            } else if (placeholder && !placeholder.parentNode) {
                list.appendChild(draggingEl);
            }
        } catch (ex) { }

        try { if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost); } catch (ex) { }
        ghost = null;
        placeholder = null;

        try { draggingEl.classList.remove('dragging'); draggingEl.style.opacity = ''; } catch (ex) { }

        try {
            const newOrder = Array.from(list.querySelectorAll('.layer-item')).map(el => el.dataset.id);
            window.updateLayerOrder(newOrder);
            if (window._dotNetRef && typeof window._dotNetRef.invokeMethodAsync === 'function') {
                // notify C# about new order
                window._dotNetRef.invokeMethodAsync('ReceiveLayerOrder', newOrder);
                // also directly tell C# to select the moved item (DOM may be re-rendered by Blazor)
                try {
                    const id = draggingEl && draggingEl.dataset && draggingEl.dataset.id;
                    if (id) {
                        window._dotNetRef.invokeMethodAsync('JsSelectLayer', id);
                    }
                } catch (e) { /* ignore */ }
            }
        } catch (ex) { }

        draggingEl = null;
    }

    const pointerDownHandler = function (e) { onPointerDown(e); };
    list.addEventListener('pointerdown', pointerDownHandler);

    const mo = new MutationObserver((mutations) => {
        mutations.forEach(m => {
            if (m.type === 'childList') {
                Array.from(list.querySelectorAll('.layer-item')).forEach(it => {
                    try { it.setAttribute('draggable', 'true'); } catch (e) { }
                });
            }
        });
    });
    mo.observe(list, { childList: true, subtree: true });

    list._sortableHandlers = { pointerDownHandler };
    list._sortableHandlers._mutationObserver = mo;

    // console.log('圖層拖曳排序功能已初始化');
};

// 供 Blazor 傳入 DotNetObjectReference
window.registerDotNetRef = function (dotNetRef) {
    window._dotNetRef = dotNetRef;
    // console.log('DotNetRef registered');
};

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.layer-item:not(.dragging)')];
    const containerRect = container.getBoundingClientRect();
    // 將 y (clientY) 轉為相對於 container 的座標
    const localY = y - containerRect.top;

    // 找出第一個其中點在游標下方的元素（closest 下一個元素）
    let closest = null;
    let closestOffset = Number.POSITIVE_INFINITY;

    draggableElements.forEach(child => {
        const box = child.getBoundingClientRect();
        const middle = (box.top - containerRect.top) + box.height / 2;
        const offset = middle - localY;
        if (offset > 0 && offset < closestOffset) {
            closestOffset = offset;
            closest = child;
        }
    });

    return closest;
}

// 更新圖層順序（同步 Canvas 顯示順序）
window.updateLayerOrder = function (newOrder) {

    // 重新建立 images 陣列：保持內建圖層（builtIn === true）在最前面，
    // 再依照 newOrder 排列使用者上傳的圖層，最後加入任何剩下的（安全保險）。
    const imageMap = {};
    images.forEach(img => { imageMap[img.id] = img; });

    const newImages = [];
    // 更安全的作法：只更新 zIndex，不重建 images 陣列，避免改變陣列順序導致整體位移
    if (!Array.isArray(newOrder)) return;

    // 建立 id => orderIndex 映射（只針對使用者圖層）
    const orderMap = {};
    newOrder.forEach((id, idx) => { orderMap[id] = idx; });

    // 計算非內建圖層數量
    const nonBuiltCount = images.filter(i => !i.builtIn).length;

    // 為非內建圖層指派 zIndex：將 newOrder 視為從 top 到 bottom，
    // 因此要反向指派 zIndex（index 越小代表越靠上，應該擁有較高的 zIndex）
    images.forEach(img => {
        if (!img.builtIn) {
            if (orderMap.hasOwnProperty(img.id)) {
                img.zIndex = (nonBuiltCount - 1) - orderMap[img.id];
            } else {
                // 尚未包含的非內建圖層放在尾端（靠近 built-in 之下）
                img.zIndex = 0;
            }
        }
    });

    // 為內建圖層指派較高的 zIndex，確保它們保持在最上方（如果設計為固定最上層）
    let builtIndex = nonBuiltCount;
    images.forEach(img => {
        if (img.builtIn) {
            img.zIndex = builtIndex++;
        }
    });

    console.log("images zIndex updated:", images.map(i => ({ id: i.id, z: i.zIndex, builtIn: !!i.builtIn })));
    normalizeZIndices();
    redraw();
    console.log("圖層 zIndex 更新完成");
};

// Move a layer one step up in the global images array (towards top)
window.moveLayerUp = function (canvasId, id) {
    // 以「從上到下」排序的非內建圖層清單作為參考（index 0 = topmost）
    const nonBuiltDesc = images.filter(i => !i.builtIn).sort((a, b) => b.zIndex - a.zIndex);
    const idx = nonBuiltDesc.findIndex(i => i.id === id);
    if (idx < 0) return;
    // 已是最上方則不處理
    if (idx === 0) return;

    const cur = nonBuiltDesc[idx];
    const above = nonBuiltDesc[idx - 1];
    // 交換 zIndex
    const tmpZ = cur.zIndex;
    cur.zIndex = above.zIndex;
    above.zIndex = tmpZ;

    normalizeZIndices();
    redraw();

    // 回報給 .NET：以 top->bottom 的順序
    try {
        if (window._dotNetRef && typeof window._dotNetRef.invokeMethodAsync === 'function') {
            const ordered = images.filter(i => !i.builtIn).sort((a, b) => b.zIndex - a.zIndex).map(i => i.id);
            window._dotNetRef.invokeMethodAsync('ReceiveLayerOrder', ordered);
        }
    } catch (e) { }
};

// Move a layer one step down in the global images array (towards bottom)
window.moveLayerDown = function (canvasId, id) {
    // 使用 zIndex 為準來在「非內建」圖層群中做下移，避免直接改動 images 陣列順序
    const nonBuilt = images.filter(i => !i.builtIn).sort((a, b) => a.zIndex - b.zIndex);
    const idx = nonBuilt.findIndex(i => i.id === id);
    if (idx < 0) return;
    // 若已經是最下方（在非內建群中），不處理
    if (idx <= 0) return;

    const cur = nonBuilt[idx];
    const prev = nonBuilt[idx - 1];
    // 交換 zIndex
    const tmpZ = cur.zIndex;
    cur.zIndex = prev.zIndex;
    prev.zIndex = tmpZ;

    redraw();

    try {
        if (window._dotNetRef && typeof window._dotNetRef.invokeMethodAsync === 'function') {
            const ordered = images.filter(i => !i.builtIn).sort((a, b) => a.zIndex - b.zIndex).map(i => i.id);
            window._dotNetRef.invokeMethodAsync('ReceiveLayerOrder', ordered);
        }
    } catch (e) { }

};

window.toggleLayerVisibility = function (canvasId, id, isVisible) {
    console.log("toggleLayerVisibility 被調用: id=", id, ", isVisible=", isVisible);
    console.log("當前 images 陣列:", images.map(i => ({id: i.id, name: i.Name, visible: i.visible, builtIn: i.builtIn})));

    const img = images.find(i => i.id === id);
    if (img) {
        console.log("找到圖層:", img.Name, "已將 visible 設為", isVisible);
        img.visible = isVisible;
        redraw();
    } else {
        console.error("無法找到 ID 為", id, "的圖層。可用 IDs:", images.map(i => i.id));
    }
};

// ===== 裁切功能 =====
window.enableCropMode = function (canvasId) {
    if (!canvas) init();
    cropMode = true;
    canvas.style.cursor = 'crosshair';
    cropRect = null;
    console.log('enableCropMode');
    redraw();
};

window.disableCropMode = function (canvasId) {
    cropMode = false;
    isCropping = false;
    cropStart = null;
    cropRect = null;
    canvas.style.cursor = 'default';
    redraw();
};

window.applyCropToSelected = function (canvasId, id) {
    if (!cropRect) return;
    const img = images.find(i => i.id === id);
    if (!img) return;

    // 計算裁切矩形與圖像交集
    const ix = Math.max(cropRect.x, img.x);
    const iy = Math.max(cropRect.y, img.y);
    const iright = Math.min(cropRect.x + cropRect.w, img.x + img.width * img.scale);
    const ibottom = Math.min(cropRect.y + cropRect.h, img.y + img.height * img.scale);

    const iwidth = iright - ix;
    const iheight = ibottom - iy;
    if (iwidth <= 0 || iheight <= 0) return; // 沒有交集

    // 轉換為原始影像的像素座標
    const sx = (ix - img.x) / img.scale;
    const sy = (iy - img.y) / img.scale;
    const sw = iwidth / img.scale;
    const sh = iheight / img.scale;

    const temp = document.createElement('canvas');
    temp.width = Math.max(1, Math.round(sw));
    temp.height = Math.max(1, Math.round(sh));
    const tctx = temp.getContext('2d');

    tctx.drawImage(img.element, sx, sy, sw, sh, 0, 0, temp.width, temp.height);

    const dataUrl = temp.toDataURL('image/png');

    // 用新的 Image 替換原本的 element，並重設尺寸/位置
    const newImg = new Image();
    newImg.onload = function () {
        img.element = newImg;
        img.width = newImg.width;
        img.height = newImg.height;
        // 保持裁切後在畫布上的顯示尺寸與裁切區相同
        const displayScaleX = iwidth / Math.max(1, newImg.width);
        const displayScaleY = iheight / Math.max(1, newImg.height);
        // 以較小的比例為準以避免拉伸
        img.scale = Math.min(displayScaleX, displayScaleY) || 1;
        img.x = ix;
        img.y = iy;
        // 清除裁切框
        cropRect = null;
        cropMode = false;
        isCropping = false;
        canvas.style.cursor = 'default';
        redraw();
    };
    newImg.src = dataUrl;
};

// 修改 redraw() 函數，加上可見性判斷
function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sortedImages = [...images].sort((a, b) => a.zIndex - b.zIndex);

    // 繪製所有圖層（尊重 visible 屬性）
    sortedImages.forEach(img => {
        if (img.visible !== false) {
            ctx.drawImage(
                img.element,
                img.x,
                img.y,
                img.width * img.scale,
                img.height * img.scale
            );
        }
    });

    // 繪製選取框（總是顯示）
    if (selectedImageId) {
        const img = images.find(i => i.id === selectedImageId);
        if (img) {
            const w = img.width * img.scale;
            const h = img.height * img.scale;

            ctx.strokeStyle = '#0066ff';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(img.x, img.y, w, h);
            ctx.setLineDash([]);

            // 畫四個角落控制點
            drawHandle(img.x, img.y);
            drawHandle(img.x + w, img.y);
            drawHandle(img.x, img.y + h);
            drawHandle(img.x + w, img.y + h);
        }
    }

    // 畫裁切框（若存在且非零尺寸）
    if (cropRect && cropRect.w > 0 && cropRect.h > 0) {
        // 使用離屏 canvas 繪製遮罩並挖洞，避免影響底下的圖像像素
        try {
            const ov = document.createElement('canvas');
            ov.width = canvas.width;
            ov.height = canvas.height;
            const octx = ov.getContext('2d');
            // 深色全罩
            octx.fillStyle = 'rgba(0,0,0,0.45)';
            octx.fillRect(0, 0, ov.width, ov.height);
            // 挖出透明洞
            octx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
            // 把離屏遮罩繪回主 canvas
            ctx.drawImage(ov, 0, 0);
        } catch (e) {
            // fallback to previous composite approach if offscreen fails
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0,0,0,1)';
            ctx.fillRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
            ctx.globalCompositeOperation = 'source-over';
            ctx.restore();
        }

        // 裁切框邊線（黃色）
        ctx.strokeStyle = '#ffff55';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(cropRect.x + 0.5, cropRect.y + 0.5, cropRect.w, cropRect.h);
        ctx.setLineDash([]);

        // 四個角落控制點（黃色方塊）
        const handleSize = 12;
        const half = handleSize / 2;
        const corners = [
            { x: cropRect.x, y: cropRect.y },
            { x: cropRect.x + cropRect.w, y: cropRect.y },
            { x: cropRect.x, y: cropRect.y + cropRect.h },
            { x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h }
        ];
        corners.forEach(c => {
            ctx.fillStyle = '#ffff55';
            ctx.fillRect(Math.round(c.x - half), Math.round(c.y - half), handleSize, handleSize);
            ctx.strokeStyle = '#333300';
            ctx.lineWidth = 1;
            ctx.strokeRect(Math.round(c.x - half), Math.round(c.y - half), handleSize, handleSize);
        });
    }
}

function drawHandle(x, y) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0066ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}
window.addImageBelow = function (canvasId, dataUrl, id) {
    if (!canvas) init();

    const img = new Image();
    img.onload = function () {
        const scale = Math.min(0.9, 600 / Math.max(img.width, img.height));
        const centerX = (canvas.width - img.width * scale) / 2;   // 注意：scale 要先計算
        const centerY = (canvas.height - img.height * scale) / 2;
        const newImg = {
            id: id,
            element: img,
            x: centerX,
            y: centerY,
            width: img.width,
            height: img.height,
            scale: scale,
            visible: true,
            // 預設 zIndex 為現有非內建圖層的最大值 + 1，使新圖位於使用者圖層最上方
            zIndex: (images.filter(i => !i.builtIn).reduce((m, it) => Math.max(m, it.zIndex ?? 0), -1) + 1)
        };

        // 把新圖片加入列表
        images.push(newImg);

        // 正規化 zIndex 並重繪
        normalizeZIndices();
        redraw();
    };
    img.src = dataUrl;
};
