import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";

/**
 * AnnotationCanvas
 * Props:
 *   imageRef  – ref to the underlying <img>
 *   brushSize – current brush size
 *   drawTool  – "pen" | "rect" | "text" | "eraser"
 *   onHasContent – called with true/false when annotation content changes
 *
 * Ref methods exposed:
 *   clear()
 *   toBlob(cb) – same as canvas.toBlob
 *   loadFromUrl(url) – draw saved annotation image
 */
const AnnotationCanvas = forwardRef(function AnnotationCanvas(
  { imageRef, brushSize, drawTool, onHasContent },
  ref
) {
  // --- state ----------------------------------------------------------
  const canvasRef = useRef(null);
  // pen strokes are burned into a bg canvas, rects/texts stay as objects
  const bgCanvasRef = useRef(null); // holds burned-in pen strokes
  const [rects, setRects] = useState([]);
  const [texts, setTexts] = useState([]);
  const [selectedId, setSelectedId] = useState(null); // "r-0", "t-0" …
  const [pendingTextPos, setPendingTextPos] = useState(null);
  const [pendingTextInput, setPendingTextInput] = useState("");

  // drag / resize state (not in React state to avoid re-render during mouse move)
  const interactRef = useRef(null); // { type, id, mode, startX, startY, origObj }

  // pen drawing
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef(null);

  // rect preview while drawing
  const rectPreviewRef = useRef(null); // { x, y, w, h } during draw
  const snapshotRef = useRef(null);

  // -----------------------------------------------------------------------
  // helpers
  // -----------------------------------------------------------------------
  const getCanvasPos = useCallback((e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }, []);

  // init canvas size from image
  const initSize = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    const bg = bgCanvasRef.current;
    if (!img || !canvas || !bg) return;
    const w = img.naturalWidth || img.offsetWidth;
    const h = img.naturalHeight || img.offsetHeight;
    canvas.width = w;
    canvas.height = h;
    bg.width = w;
    bg.height = h;
  }, [imageRef]);

  // -----------------------------------------------------------------------
  // re-render the composite canvas
  // -----------------------------------------------------------------------
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const bg = bgCanvasRef.current;
    if (!canvas || !bg) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. pen strokes (background canvas)
    ctx.drawImage(bg, 0, 0);

    // 2. rect preview during drawing
    if (rectPreviewRef.current) {
      const { x, y, w, h, lw } = rectPreviewRef.current;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.strokeRect(x, y, w, h);
    }

    // 3. saved rects
    rects.forEach((r, i) => {
      const isSelected = selectedId === `r-${i}`;
      ctx.strokeStyle = isSelected ? "#f97316" : "#ef4444";
      ctx.lineWidth = r.lw;
      ctx.beginPath();
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      if (isSelected) {
        // draw handles
        const handles = getRectHandles(r);
        handles.forEach(([hx, hy]) => {
          ctx.fillStyle = "#f97316";
          ctx.fillRect(hx - 5, hy - 5, 10, 10);
        });
      }
    });

    // 4. saved texts
    texts.forEach((t, i) => {
      const isSelected = selectedId === `t-${i}`;
      ctx.font = `bold ${t.size}px sans-serif`;
      ctx.fillStyle = isSelected ? "#f97316" : "#ef4444";
      ctx.fillText(t.text, t.x, t.y);

      if (isSelected) {
        // bounding box
        const m = ctx.measureText(t.text);
        const th = t.size;
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(t.x - 2, t.y - th, m.width + 4, th + 4);
        ctx.setLineDash([]);
        // move handle dot
        ctx.fillStyle = "#f97316";
        ctx.fillRect(t.x + m.width + 4, t.y - th, 10, 10);
      }
    });
  }, [rects, texts, selectedId]);

  useEffect(() => { redraw(); }, [redraw]);

  // -----------------------------------------------------------------------
  // rect handle positions (corners + mid-edges)
  // -----------------------------------------------------------------------
  const getRectHandles = (r) => {
    const { x, y, w, h } = r;
    return [
      [x, y],           // 0 TL
      [x + w / 2, y],   // 1 TM
      [x + w, y],       // 2 TR
      [x + w, y + h / 2], // 3 MR
      [x + w, y + h],   // 4 BR
      [x + w / 2, y + h], // 5 BM
      [x, y + h],       // 6 BL
      [x, y + h / 2],   // 7 ML
    ];
  };

  // which handle is near a point?
  const hitHandle = (r, px, py) => {
    const handles = getRectHandles(r);
    for (let i = 0; i < handles.length; i++) {
      const [hx, hy] = handles[i];
      if (Math.abs(px - hx) <= 7 && Math.abs(py - hy) <= 7) return i;
    }
    return -1;
  };

  const hitRect = (r, px, py) => {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  };

  const hitText = useCallback((t, px, py) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");
    ctx.font = `bold ${t.size}px sans-serif`;
    const m = ctx.measureText(t.text);
    return (
      px >= t.x - 2 && px <= t.x + m.width + 6 &&
      py >= t.y - t.size && py <= t.y + 4
    );
  }, []);

  // -----------------------------------------------------------------------
  // notify parent of content changes
  // -----------------------------------------------------------------------
  const notifyContent = useCallback((newRects, newTexts) => {
    const bg = bgCanvasRef.current;
    let hasBg = false;
    if (bg) {
      const data = bg.getContext("2d").getImageData(0, 0, bg.width, bg.height).data;
      hasBg = data.some((v, i) => i % 4 === 3 && v > 0);
    }
    onHasContent?.(hasBg || newRects.length > 0 || newTexts.length > 0);
  }, [onHasContent]);

  // -----------------------------------------------------------------------
  // flatten everything to the main canvas for export
  // -----------------------------------------------------------------------
  const flattenToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bg = bgCanvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bg, 0, 0);
    rects.forEach(r => {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = r.lw;
      ctx.beginPath();
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    });
    texts.forEach(t => {
      ctx.font = `bold ${t.size}px sans-serif`;
      ctx.fillStyle = "#ef4444";
      ctx.fillText(t.text, t.x, t.y);
    });
  }, [rects, texts]);

  // -----------------------------------------------------------------------
  // imperative handle
  // -----------------------------------------------------------------------
  useImperativeHandle(ref, () => ({
    clear() {
      const bg = bgCanvasRef.current;
      const canvas = canvasRef.current;
      if (bg) bg.getContext("2d").clearRect(0, 0, bg.width, bg.height);
      if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      setRects([]);
      setTexts([]);
      setSelectedId(null);
      onHasContent?.(false);
    },
    toBlob(cb, type = "image/png") {
      flattenToCanvas();
      canvasRef.current?.toBlob(cb, type);
    },
    loadFromUrl(url) {
      if (!url) return;
      initSize();
      setTimeout(() => {
        const bg = bgCanvasRef.current;
        if (!bg) return;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          bg.getContext("2d").drawImage(img, 0, 0, bg.width, bg.height);
          redraw();
        };
        img.src = url;
      }, 50);
    },
  }), [flattenToCanvas, initSize, redraw, onHasContent]);

  // -----------------------------------------------------------------------
  // mouse / touch handlers
  // -----------------------------------------------------------------------
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pos = getCanvasPos(e, canvas);

    // ---- select / interact mode (not pen/eraser) ----
    if (drawTool === "rect" || drawTool === "text") {
      // check existing objects for selection/handle hit
      // check rects first
      for (let i = rects.length - 1; i >= 0; i--) {
        const r = rects[i];
        const handleIdx = hitHandle(r, pos.x, pos.y);
        if (handleIdx >= 0) {
          setSelectedId(`r-${i}`);
          interactRef.current = { type: "rect", id: i, mode: "resize", handleIdx, startX: pos.x, startY: pos.y, origObj: { ...r } };
          return;
        }
        if (hitRect(r, pos.x, pos.y)) {
          setSelectedId(`r-${i}`);
          interactRef.current = { type: "rect", id: i, mode: "move", startX: pos.x, startY: pos.y, origObj: { ...r } };
          return;
        }
      }
      // check texts
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        if (hitText(t, pos.x, pos.y)) {
          setSelectedId(`t-${i}`);
          interactRef.current = { type: "text", id: i, mode: "move", startX: pos.x, startY: pos.y, origObj: { ...t } };
          return;
        }
      }

      // no hit → deselect
      setSelectedId(null);

      // start drawing new object
      if (drawTool === "rect") {
        isDrawingRef.current = true;
        lastPosRef.current = pos;
        rectPreviewRef.current = { x: pos.x, y: pos.y, w: 0, h: 0, lw: brushSize };
        snapshotRef.current = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      } else if (drawTool === "text") {
        setPendingTextPos(pos);
        setPendingTextInput("");
      }
      return;
    }

    // ---- pen / eraser ----
    isDrawingRef.current = true;
    lastPosRef.current = pos;
  }, [drawTool, rects, texts, brushSize, getCanvasPos, hitText]);

  const handleMouseMove = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pos = getCanvasPos(e, canvas);

    // dragging/resizing an existing object
    if (interactRef.current) {
      const ia = interactRef.current;
      const dx = pos.x - ia.startX;
      const dy = pos.y - ia.startY;

      if (ia.type === "rect") {
        setRects(prev => {
          const arr = [...prev];
          const orig = ia.origObj;
          if (ia.mode === "move") {
            arr[ia.id] = { ...orig, x: orig.x + dx, y: orig.y + dy };
          } else {
            // resize by handle
            let { x, y, w, h } = orig;
            const hi = ia.handleIdx;
            if (hi === 0) { x += dx; y += dy; w -= dx; h -= dy; }
            else if (hi === 1) { y += dy; h -= dy; }
            else if (hi === 2) { y += dy; w += dx; h -= dy; }
            else if (hi === 3) { w += dx; }
            else if (hi === 4) { w += dx; h += dy; }
            else if (hi === 5) { h += dy; }
            else if (hi === 6) { x += dx; w -= dx; h += dy; }
            else if (hi === 7) { x += dx; w -= dx; }
            arr[ia.id] = { ...orig, x, y, w, h };
          }
          return arr;
        });
      } else if (ia.type === "text") {
        if (ia.mode === "move") {
          setTexts(prev => {
            const arr = [...prev];
            arr[ia.id] = { ...ia.origObj, x: ia.origObj.x + dx, y: ia.origObj.y + dy };
            return arr;
          });
        }
      }
      return;
    }

    if (!isDrawingRef.current) return;

    const bg = bgCanvasRef.current;
    if (!bg) return;
    const bgCtx = bg.getContext("2d");

    if (drawTool === "eraser") {
      bgCtx.clearRect(pos.x - brushSize * 2, pos.y - brushSize * 2, brushSize * 4, brushSize * 4);
      redraw();
    } else if (drawTool === "rect") {
      rectPreviewRef.current = {
        x: lastPosRef.current.x,
        y: lastPosRef.current.y,
        w: pos.x - lastPosRef.current.x,
        h: pos.y - lastPosRef.current.y,
        lw: brushSize,
      };
      redraw();
    } else if (drawTool === "pen") {
      bgCtx.strokeStyle = "#ef4444";
      bgCtx.lineWidth = brushSize;
      bgCtx.lineCap = "round";
      bgCtx.lineJoin = "round";
      bgCtx.beginPath();
      bgCtx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      bgCtx.lineTo(pos.x, pos.y);
      bgCtx.stroke();
      lastPosRef.current = pos;
      redraw();
    }
  }, [drawTool, brushSize, getCanvasPos, redraw]);

  const handleMouseUp = useCallback((e) => {
    e.preventDefault();
    const pos = e.type.startsWith("touch")
      ? (() => { const t = e.changedTouches[0]; const r = canvasRef.current.getBoundingClientRect(); const sx = canvasRef.current.width / r.width; const sy = canvasRef.current.height / r.height; return { x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy }; })()
      : getCanvasPos(e, canvasRef.current);

    if (interactRef.current) {
      interactRef.current = null;
      notifyContent(rects, texts);
      return;
    }

    if (isDrawingRef.current && drawTool === "rect" && rectPreviewRef.current) {
      const { x, y, w, h, lw } = rectPreviewRef.current;
      if (Math.abs(w) > 3 || Math.abs(h) > 3) {
        const newRects = [...rects, { x, y, w, h, lw }];
        setRects(newRects);
        setSelectedId(`r-${newRects.length - 1}`);
        notifyContent(newRects, texts);
      }
      rectPreviewRef.current = null;
    }

    isDrawingRef.current = false;

    if (drawTool === "pen" || drawTool === "eraser") {
      const bg = bgCanvasRef.current;
      if (bg) {
        const data = bg.getContext("2d").getImageData(0, 0, bg.width, bg.height).data;
        const hasBg = data.some((v, i) => i % 4 === 3 && v > 0);
        notifyContent(rects, texts);
      }
    }
    redraw();
  }, [drawTool, rects, texts, getCanvasPos, redraw, notifyContent]);

  // commit text input
  const commitText = useCallback(() => {
    if (!pendingTextInput.trim() || !pendingTextPos) { setPendingTextPos(null); return; }
    const newTexts = [...texts, { text: pendingTextInput.trim(), x: pendingTextPos.x, y: pendingTextPos.y, size: brushSize }];
    setTexts(newTexts);
    setSelectedId(`t-${newTexts.length - 1}`);
    notifyContent(rects, newTexts);
    setPendingTextPos(null);
    setPendingTextInput("");
  }, [pendingTextInput, pendingTextPos, brushSize, texts, rects, notifyContent]);

  // delete selected
  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    if (selectedId.startsWith("r-")) {
      const idx = parseInt(selectedId.split("-")[1]);
      const newRects = rects.filter((_, i) => i !== idx);
      setRects(newRects);
      setSelectedId(null);
      notifyContent(newRects, texts);
    } else if (selectedId.startsWith("t-")) {
      const idx = parseInt(selectedId.split("-")[1]);
      const newTexts = texts.filter((_, i) => i !== idx);
      setTexts(newTexts);
      setSelectedId(null);
      notifyContent(rects, newTexts);
    }
  }, [selectedId, rects, texts, notifyContent]);

  // font size change for selected text
  const changeSelectedTextSize = useCallback((newSize) => {
    if (!selectedId?.startsWith("t-")) return;
    const idx = parseInt(selectedId.split("-")[1]);
    setTexts(prev => { const arr = [...prev]; arr[idx] = { ...arr[idx], size: newSize }; return arr; });
  }, [selectedId]);

  // line width change for selected rect
  const changeSelectedRectLw = useCallback((newLw) => {
    if (!selectedId?.startsWith("r-")) return;
    const idx = parseInt(selectedId.split("-")[1]);
    setRects(prev => { const arr = [...prev]; arr[idx] = { ...arr[idx], lw: newLw }; return arr; });
  }, [selectedId]);

  // init on image load
  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;
    if (img.complete) initSize();
    img.addEventListener("load", initSize);
    return () => img.removeEventListener("load", initSize);
  }, [imageRef, initSize]);

  // keyboard: Delete / Backspace to remove selected
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteSelected]);

  // cursor style
  const getCursor = () => {
    if (drawTool === "eraser") return "cell";
    if (drawTool === "text") return "text";
    return "crosshair";
  };

  const selectedRectObj = selectedId?.startsWith("r-") ? rects[parseInt(selectedId.split("-")[1])] : null;
  const selectedTextObj = selectedId?.startsWith("t-") ? texts[parseInt(selectedId.split("-")[1])] : null;

  return (
    <>
      {/* hidden bg canvas */}
      <canvas ref={bgCanvasRef} style={{ display: "none" }} />

      {/* visible composite canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full rounded-lg"
        style={{ cursor: getCursor(), touchAction: "none" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
      />

      {/* text input popup */}
      {pendingTextPos && (
        <div className="absolute left-0 right-0 bottom-0 z-20 bg-white border-t border-red-200 p-2 flex gap-2 items-center rounded-b-lg">
          <input
            autoFocus
            value={pendingTextInput}
            onChange={e => setPendingTextInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commitText(); if (e.key === "Escape") { setPendingTextPos(null); setPendingTextInput(""); } }}
            placeholder="輸入文字，Enter 確認，Esc 取消"
            className="flex-1 px-3 py-1.5 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-red-50"
            style={{ color: "#dc2626" }}
          />
          <button onClick={commitText} className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg font-medium hover:bg-red-700 transition">確認</button>
          <button onClick={() => { setPendingTextPos(null); setPendingTextInput(""); }} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition">取消</button>
        </div>
      )}

      {/* selected-object toolbar */}
      {(selectedRectObj || selectedTextObj) && (
        <div className="absolute top-0 left-0 right-0 z-20 bg-white/90 border-b border-orange-200 px-3 py-1.5 flex gap-3 items-center rounded-t-lg flex-wrap">
          {selectedRectObj && (
            <>
              <span className="text-xs text-orange-600 font-semibold">⬜ 選中方框</span>
              <span className="text-xs text-gray-500">框線：</span>
              {[1, 2, 4, 8, 14].map(size => (
                <button
                  key={size}
                  onClick={() => changeSelectedRectLw(size)}
                  className="rounded-full border-2 transition"
                  style={{
                    width: size + 12, height: size + 12,
                    background: selectedRectObj.lw === size ? "#f97316" : "#e5e7eb",
                    borderColor: selectedRectObj.lw === size ? "#f97316" : "#d1d5db",
                  }}
                />
              ))}
            </>
          )}
          {selectedTextObj && (
            <>
              <span className="text-xs text-orange-600 font-semibold">T 選中文字</span>
              <span className="text-xs text-gray-500">字級：</span>
              {[12, 16, 20, 28, 40].map(size => (
                <button
                  key={size}
                  onClick={() => changeSelectedTextSize(size)}
                  className={`px-2 py-0.5 rounded border text-xs font-medium transition ${selectedTextObj.size === size ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                >
                  {size}
                </button>
              ))}
              <span className="text-xs text-gray-400 ml-2">（拖曳移動）</span>
            </>
          )}
          <button
            onClick={deleteSelected}
            className="ml-auto px-2 py-0.5 text-xs rounded border border-red-300 text-red-500 hover:bg-red-50 transition"
          >
            🗑 刪除
          </button>
          <button
            onClick={() => setSelectedId(null)}
            className="px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition"
          >
            取消選取
          </button>
        </div>
      )}
    </>
  );
});

export default AnnotationCanvas;