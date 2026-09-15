
import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

interface DrawingCanvasProps {
  isDrawer: boolean;
  roomId: string;
}

interface Point { x: number; y: number; }
interface Stroke {
  type: "stroke";
  color: string;
  size: number;
  points: Point[];
}
interface DrawData {
  type: "start" | "move" | "end";
  x?: number;
  y?: number;
  color?: string;
  size?: number;
  isEraser?: boolean;
}

function DrawingCanvas({ isDrawer, roomId }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentRemoteStroke = useRef<Stroke | null>(null);
  const localStrokes = useRef<Stroke[]>([]);
  const activeLocalStroke = useRef<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(5);
  const [isEraser, setIsEraser] = useState(false);

  const clearCanvasLocally = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const drawStroke = (stroke: Stroke) => {
    const canvas = canvasRef.current;
    if (!canvas || stroke.points.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
    if (stroke.points.length === 1) {
      ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y + 0.01);
    }
    ctx.stroke();
    ctx.closePath();
  };

  const redraw = (strokes: Stroke[]) => {
    clearCanvasLocally();
    strokes.forEach(drawStroke);
  };

  useEffect(() => {
    clearCanvasLocally();

    const handleDrawData = (data: DrawData) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (data.type === "start" && data.x !== undefined && data.y !== undefined) {
        currentRemoteStroke.current = {
          type: "stroke",
          color: data.isEraser ? "#ffffff" : data.color || "#000000",
          size: data.size || 5,
          points: [{ x: data.x, y: data.y }],
        };
        ctx.beginPath();
        ctx.moveTo(data.x, data.y);
        ctx.lineWidth = data.size || 5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = data.isEraser ? "#ffffff" : data.color || "#000000";
      }

      if (data.type === "move" && data.x !== undefined && data.y !== undefined) {
        if (!currentRemoteStroke.current) return;
        currentRemoteStroke.current.points.push({ x: data.x, y: data.y });
        ctx.lineTo(data.x, data.y);
        ctx.stroke();
      }

      if (data.type === "end") {
        if (currentRemoteStroke.current) {
          const stroke = currentRemoteStroke.current;
          localStrokes.current.push(stroke);
          currentRemoteStroke.current = null;
        }
        ctx.closePath();
      }
    };

    const handleCanvasState = (data: { strokes: Stroke[] }) => {
      localStrokes.current = data.strokes || [];
      redraw(localStrokes.current);
    };

    const handleClear = () => {
      localStrokes.current = [];
      clearCanvasLocally();
    };

    socket.on("draw_data", handleDrawData);
    socket.on("canvas_state", handleCanvasState);
    socket.on("canvas_clear", handleClear);

    return () => {
      socket.off("draw_data", handleDrawData);
      socket.off("canvas_state", handleCanvasState);
      socket.off("canvas_clear", handleClear);
    };
  }, []);

  const getPosition = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawer) return;
    const { x, y } = getPosition(event);
    const stroke: Stroke = {
      type: "stroke",
      color: isEraser ? "#ffffff" : color,
      size: brushSize,
      points: [{ x, y }],
    };
    activeLocalStroke.current = stroke;
    setIsDrawing(true);

    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke.color;
    }

    socket.emit("draw_start", { roomId, x, y, color, size: brushSize, isEraser });
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawer || !isDrawing || !activeLocalStroke.current) return;
    const { x, y } = getPosition(event);
    activeLocalStroke.current.points.push({ x, y });

    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = isEraser ? "#ffffff" : color;
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    socket.emit("draw_move", { roomId, x, y });
  };

  const stopDrawing = () => {
    if (!isDrawer || !isDrawing) return;
    setIsDrawing(false);
    if (activeLocalStroke.current) {
      localStrokes.current.push(activeLocalStroke.current);
      activeLocalStroke.current = null;
    }
    socket.emit("draw_end", { roomId });
  };

  const clearCanvas = () => {
    if (!isDrawer) return;
    localStrokes.current = [];
    clearCanvasLocally();
    socket.emit("canvas_clear", { roomId });
  };

  const undo = () => {
    if (!isDrawer) return;
    localStrokes.current.pop();
    redraw(localStrokes.current);
    socket.emit("draw_undo", { roomId });
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-xl">
        <canvas
          ref={canvasRef}
          width={900}
          height={550}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className={`block h-auto w-full ${isDrawer ? "cursor-crosshair" : "cursor-not-allowed"}`}
        />
      </div>

      {isDrawer ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2">
            {["#000000", "#ffffff", "#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7"].map((option) => (
              <button key={option} onClick={() => { setColor(option); setIsEraser(false); }}
                className={`h-8 w-8 rounded-full border-2 ${color === option && !isEraser ? "border-purple-400 scale-110" : "border-white/20"}`}
                style={{ backgroundColor: option }} aria-label={`Color ${option}`} />
            ))}
          </div>
          <div className="h-8 w-px bg-white/10" />
          <label className="flex items-center gap-2 text-sm text-gray-400">
            Size <input type="range" min="2" max="30" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
            <span className="w-6 text-white">{brushSize}</span>
          </label>
          <div className="h-8 w-px bg-white/10" />
          <button onClick={() => setIsEraser(!isEraser)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${isEraser ? "bg-purple-500 text-white" : "bg-white/10 text-gray-300"}`}>🧽 Eraser</button>
          <button onClick={undo} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-gray-300">↶ Undo</button>
          <button onClick={clearCanvas} className="rounded-xl bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400">🗑 Clear</button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-gray-400">👀 Watch the drawer and try to guess the word!</div>
      )}
    </div>
  );
}

export default DrawingCanvas;
