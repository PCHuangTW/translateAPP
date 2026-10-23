/**
 * Voice Recording & Audio Waveform Visualizer Module
 * Handles microphone capture via MediaRecorder and Web Audio API canvas visualizer.
 * Supports "Record -> Press Finished -> Stop & Process" workflow.
 */

class AudioRecorder {
  constructor(canvasId, timerId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.timerElement = document.getElementById(timerId);

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioStream = null;

    this.audioCtx = null;
    this.analyser = null;
    this.animFrameId = null;

    this.isRecording = false;
    this.startTime = 0;
    this.timerInterval = null;
  }

  /**
   * Start recording audio and initialize waveform animation
   */
  async start() {
    if (this.isRecording) return;

    // Check Secure Context (HTTPS or localhost)
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocal) {
      throw new Error('手機瀏覽器強制要求 HTTPS 加密連線才能啟用麥克風。目前為 HTTP 區網連線，瀏覽器已依規範限制存取，請改用 HTTPS 網址測試。');
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('目前瀏覽器環境未提供媒體存取介面（可能因非安全連線或瀏覽器不支援）。');
    }

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];

      // Determine supported MIME type for cross-platform mobile compatibility
      let recorderOptions = {};
      if (typeof MediaRecorder !== 'undefined') {
        if (typeof MediaRecorder.isTypeSupported === 'function') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            recorderOptions = { mimeType: 'audio/webm;codecs=opus' };
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            recorderOptions = { mimeType: 'audio/webm' };
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            recorderOptions = { mimeType: 'audio/mp4' };
          }
        }
      }

      this.mediaRecorder = Object.keys(recorderOptions).length > 0 
        ? new MediaRecorder(this.audioStream, recorderOptions)
        : new MediaRecorder(this.audioStream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100);
      this.isRecording = true;
      this.startTime = Date.now();

      // Start timer
      this._startTimer();

      // Setup Web Audio API Visualizer
      this._initVisualizer();

      return true;
    } catch (err) {
      console.error('Microphone access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('麥克風存取已被拒絕，請在瀏覽器網址列左側點擊圖示允許麥克風權限。');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('未偵測到可用的麥克風輸入裝置。');
      }
      throw new Error(err.message || '無法存取麥克風。');
    }
  }

  /**
   * Stop recording audio and return audio Blob and duration
   */
  stop() {
    return new Promise((resolve) => {
      if (!this.isRecording || !this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
        const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);

        this._cleanup();
        resolve({ blob: audioBlob, duration: durationSeconds });
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Internal timer count up
   */
  _startTimer() {
    this._updateTimerDisplay(0);
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this._updateTimerDisplay(elapsed);
    }, 1000);
  }

  _updateTimerDisplay(seconds) {
    if (!this.timerElement) return;
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    this.timerElement.textContent = `${mins}:${secs}`;
  }

  /**
   * Initialize Web Audio API Waveform Canvas Rendering
   */
  _initVisualizer() {
    if (!this.canvas || !this.ctx || !this.audioStream) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.audioCtx = new AudioContextClass();
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const source = this.audioCtx.createMediaStreamSource(this.audioStream);
    this.analyser = this.audioCtx.createAnalyser();

    this.analyser.fftSize = 64;
    source.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!this.isRecording) return;
      this.animFrameId = requestAnimationFrame(draw);

      this.analyser.getByteFrequencyData(dataArray);

      const width = this.canvas.width;
      const height = this.canvas.height;

      this.ctx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;

        // Gradient color for visualizer bars (Indigo -> Pink -> Teal)
        const gradient = this.ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(0.5, '#ec4899');
        gradient.addColorStop(1, '#14b8a6');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);

        x += barWidth;
      }
    };

    draw();
  }

  _cleanup() {
    this.isRecording = false;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }

    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}
