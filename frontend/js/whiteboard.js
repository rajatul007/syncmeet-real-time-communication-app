/**
 * SyncMeet Collaborative Whiteboard Module
 * HTML5 Canvas + Real-Time Socket.IO Synchronization
 */

import { getSocket } from './socket.js';
import { showToast, showPromptDialog } from './api.js';

export class WhiteboardManager {
  constructor(canvasElement, meetingId) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.meetingId = meetingId;

    // Drawing state
    this.isDrawing = false;
    this.currentTool = 'pen'; // 'pen', 'eraser', 'line', 'rect', 'circle', 'text'
    this.currentColor = '#2563eb';
    this.currentSize = 4;
    this.startX = 0;
    this.startY = 0;
    this.snapshot = null;

    // History for Undo/Redo
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 30;

    // Setup Canvas dimensions
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.bindEvents();
    this.setupSocketListeners();
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    // Save existing content before resize
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx && this.canvas.width > 0 && this.canvas.height > 0) {
      tempCtx.drawImage(this.canvas, 0, 0);
    }

    const rect = parent.getBoundingClientRect();
    this.canvas.width = rect.width || 800;
    this.canvas.height = rect.height || 600;

    // Restore content
    if (tempCtx && tempCanvas.width > 0) {
      this.ctx.drawImage(tempCanvas, 0, 0);
    }
  }

  saveState() {
    if (this.undoStack.length >= this.maxHistory) {
      this.undoStack.shift();
    }
    this.undoStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
    this.redoStack = []; // Clear redo on new action
  }

  undo() {
    if (this.undoStack.length > 0) {
      this.redoStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
      const previous = this.undoStack.pop();
      this.ctx.putImageData(previous, 0, 0);
    }
  }

  redo() {
    if (this.redoStack.length > 0) {
      this.undoStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
      const next = this.redoStack.pop();
      this.ctx.putImageData(next, 0, 0);
    }
  }

  clearBoard(emit = true) {
    this.saveState();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (emit) {
      const socket = getSocket();
      if (socket && this.meetingId) {
        socket.emit('whiteboard-clear', { meetingId: this.meetingId });
      }
    }
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  bindEvents() {
    const start = (e) => {
      e.preventDefault();
      this.saveState();
      const pos = this.getPointerPos(e);
      this.isDrawing = true;
      this.startX = pos.x;
      this.startY = pos.y;

      if (this.currentTool === 'text') {
        this.isDrawing = false;
        showPromptDialog('Add Text to Board', 'Enter note, heading, or label...', '').then((text) => {
          if (text && text.trim()) {
            this.drawText(text.trim(), pos.x, pos.y, this.currentColor, this.currentSize * 4, true);
          }
        });
        return;
      }

      this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    };

    const move = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const pos = this.getPointerPos(e);

      if (this.currentTool === 'pen') {
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();

        this.emitDrawAction({
          type: 'freehand-point',
          tool: 'pen',
          x1: this.startX,
          y1: this.startY,
          x2: pos.x,
          y2: pos.y,
          color: this.currentColor,
          size: this.currentSize
        });
        this.startX = pos.x;
        this.startY = pos.y;
      } else if (this.currentTool === 'eraser') {
        this.ctx.clearRect(pos.x - this.currentSize * 2, pos.y - this.currentSize * 2, this.currentSize * 4, this.currentSize * 4);
        this.emitDrawAction({
          type: 'erase',
          x: pos.x,
          y: pos.y,
          size: this.currentSize * 4
        });
      } else {
        // Shapes preview (Line, Rect, Circle)
        this.ctx.putImageData(this.snapshot, 0, 0);
        this.drawShape(this.currentTool, this.startX, this.startY, pos.x, pos.y, this.currentColor, this.currentSize, false);
      }
    };

    const end = (e) => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      const pos = e.changedTouches ? this.getPointerPos(e.changedTouches[0]) : this.getPointerPos(e);

      if (['line', 'rect', 'circle'].includes(this.currentTool)) {
        this.drawShape(this.currentTool, this.startX, this.startY, pos.x, pos.y, this.currentColor, this.currentSize, true);
      }
    };

    this.canvas.addEventListener('mousedown', start);
    this.canvas.addEventListener('mousemove', move);
    this.canvas.addEventListener('mouseup', end);
    this.canvas.addEventListener('mouseleave', end);

    // Touch events for tablets & phones
    this.canvas.addEventListener('touchstart', start, { passive: false });
    this.canvas.addEventListener('touchmove', move, { passive: false });
    this.canvas.addEventListener('touchend', end);
  }

  drawShape(tool, x1, y1, x2, y2, color, size, emit = false) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = size;
    this.ctx.beginPath();

    if (tool === 'line') {
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    } else if (tool === 'rect') {
      this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    } else if (tool === 'circle') {
      const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      this.ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
      this.ctx.stroke();
    }

    if (emit) {
      this.emitDrawAction({
        type: 'shape',
        tool,
        x1,
        y1,
        x2,
        y2,
        color,
        size
      });
    }
  }

  drawText(text, x, y, color, size, emit = false) {
    this.ctx.fillStyle = color;
    this.ctx.font = `${Math.max(14, size)}px -apple-system, sans-serif`;
    this.ctx.fillText(text, x, y);

    if (emit) {
      this.emitDrawAction({
        type: 'text',
        text,
        x,
        y,
        color,
        size
      });
    }
  }

  emitDrawAction(action) {
    const socket = getSocket();
    if (socket && this.meetingId) {
      socket.emit('whiteboard-draw', {
        meetingId: this.meetingId,
        drawAction: action
      });
    }
  }

  setupSocketListeners() {
    const socket = getSocket();
    if (!socket) return;

    // Incoming remote draw event
    socket.on('whiteboard-draw', (action) => {
      this.applyRemoteAction(action);
    });

    // Incoming remote clear
    socket.on('whiteboard-clear', () => {
      this.clearBoard(false);
      showToast('Meeting host or participant cleared the whiteboard.', 'info');
    });

    // Replay history on join
    socket.on('whiteboard-init', ({ history }) => {
      if (Array.isArray(history)) {
        history.forEach((act) => this.applyRemoteAction(act));
      }
    });
  }

  applyRemoteAction(action) {
    if (!action) return;

    if (action.type === 'freehand-point') {
      this.ctx.strokeStyle = action.color;
      this.ctx.lineWidth = action.size;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(action.x1, action.y1);
      this.ctx.lineTo(action.x2, action.y2);
      this.ctx.stroke();
    } else if (action.type === 'erase') {
      this.ctx.clearRect(action.x - action.size / 2, action.y - action.size / 2, action.size, action.size);
    } else if (action.type === 'shape') {
      this.drawShape(action.tool, action.x1, action.y1, action.x2, action.y2, action.color, action.size, false);
    } else if (action.type === 'text') {
      this.drawText(action.text, action.x, action.y, action.color, action.size, false);
    }
  }

  downloadImage() {
    const link = document.createElement('a');
    link.download = `syncmeet-whiteboard-${this.meetingId}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }
}
