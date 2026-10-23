/**
 * Speech-to-Text (STT) Engine
 * Integrates Web Speech Recognition API and optional Whisper Cloud API.
 */

const STTEngine = {
  recognition: null,
  isListening: false,
  accumulatedTranscript: '',

  /**
   * Initialize or start browser Web Speech API
   */
  startBrowserRecognition(langCode, onResultCallback, onErrorCallback, onStatusCallback) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      if (onErrorCallback) onErrorCallback('NO_BROWSER_SUPPORT');
      return;
    }

    this.stopBrowserRecognition();

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = langCode;
      this.accumulatedTranscript = '';
      this.isListening = true;

      this.recognition.onstart = () => {
        if (onStatusCallback) onStatusCallback('LISTENING');
      };

      this.recognition.onresult = (event) => {
        let sessionFinal = '';
        let sessionInterim = '';

        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          const transcript = item[0]?.transcript || '';
          if (item.isFinal) {
            sessionFinal = this._mergeText(sessionFinal, transcript, langCode);
          } else {
            sessionInterim = this._mergeText(sessionInterim, transcript, langCode);
          }
        }

        // Merge accumulated text with current session results
        let fullText = this._mergeText(this.accumulatedTranscript, sessionFinal, langCode);
        fullText = this._mergeText(fullText, sessionInterim, langCode);

        this.currentLiveTranscript = fullText;
        if (onResultCallback) onResultCallback(fullText);
      };

      this.recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          return;
        }
        if (onErrorCallback) {
          onErrorCallback(event.error);
        }
      };

      this.recognition.onend = () => {
        // Save current progress before restart
        if (this.currentLiveTranscript) {
          this.accumulatedTranscript = this.currentLiveTranscript;
        }

        // Seamless auto-restart if user has not actively stopped listening
        if (this.isListening) {
          setTimeout(() => {
            if (this.isListening) {
              try {
                this.recognition.start();
              } catch (e) {
                // Audio HAL buffer safety delay
                setTimeout(() => {
                  if (this.isListening) {
                    try { this.recognition.start(); } catch (err) {}
                  }
                }, 150);
              }
            }
          }, 60);
        }
      };

      this.recognition.start();
    } catch (e) {
      this.isListening = false;
      if (onErrorCallback) onErrorCallback(e.message || 'START_FAILED');
    }
  },

  /**
   * Smart stream text merging with prefix overlap deduplication
   */
  _mergeText(base, incoming, langCode) {
    base = (base || '').trim();
    incoming = (incoming || '').trim();

    if (!base) return incoming;
    if (!incoming) return base;

    // 1. Direct superset / prefix replacement (e.g. "測試測試" replaced by "測試測試123")
    if (incoming.startsWith(base)) {
      return incoming;
    }
    if (base.endsWith(incoming) || base.includes(incoming)) {
      return base;
    }

    // 2. Overlap detection (finding maximum overlapping suffix/prefix)
    const maxOverlap = Math.min(base.length, incoming.length);
    for (let len = maxOverlap; len > 0; len--) {
      const baseSuffix = base.slice(-len);
      const incomingPrefix = incoming.slice(0, len);
      if (baseSuffix === incomingPrefix) {
        const nonOverlap = incoming.slice(len);
        return base + nonOverlap;
      }
    }

    // 3. Natural appending based on language conventions
    const isCjk = langCode && (langCode.startsWith('zh') || langCode.startsWith('ja'));
    if (isCjk) {
      return base + incoming;
    } else {
      return base + ' ' + incoming;
    }
  },

  /**
   * Stop browser recognition and return accumulated text
   */
  stopBrowserRecognition() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    const result = this.currentLiveTranscript || this.accumulatedTranscript;
    this.accumulatedTranscript = '';
    this.currentLiveTranscript = '';
    return result;
  },

  /**
   * Process recorded audio blob with Whisper API (if user set OpenAI Key)
   */
  async transcribeWithWhisper(audioBlob, apiKey, langCode) {
    if (!apiKey) {
      throw new Error('使用 Whisper 高精準轉寫需在 API 設定中填寫 OpenAI Key。');
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'speech.webm');
    formData.append('model', 'whisper-1');

    // Language code mapping for whisper
    let whisperLang = 'zh';
    if (langCode.startsWith('en')) whisperLang = 'en';
    if (langCode.startsWith('ja')) whisperLang = 'ja';
    formData.append('language', whisperLang);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || 'Whisper 語音轉寫失敗');
    }

    const data = await response.json();
    return data.text || '';
  },

  /**
   * Process recorded audio blob with Gemini 1.5 Multimodal API
   */
  async transcribeWithGemini(audioBlob, apiKey, langCode) {
    if (!apiKey) {
      throw new Error('使用 Gemini 語音轉寫需在 API 設定中填寫 Gemini Key。');
    }

    const base64Audio = await this._blobToBase64(audioBlob);
    const rawMime = audioBlob.type || 'audio/webm';
    const cleanMime = rawMime.split(';')[0];

    const promptText = `Please accurately transcribe the following audio recording into written text in its natural spoken language (${langCode}). Provide ONLY the exact transcribed text, without commentary, markdown wrappers, or timestamps.`;

    const requestBody = {
      contents: [{
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: cleanMime,
              data: base64Audio
            }
          }
        ]
      }]
    };

    let modelName = 'gemini-1.5-flash-latest';
    if (typeof TranslatorEngine !== 'undefined' && typeof TranslatorEngine._resolveGeminiModel === 'function') {
      modelName = await TranslatorEngine._resolveGeminiModel(apiKey);
    }

    let url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    let response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok && (response.status === 404 || response.status === 400)) {
      const candidates = ['gemini-1.5-flash-latest', 'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-pro'];
      for (const cand of candidates) {
        if (cand === modelName) continue;
        const candUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cand}:generateContent?key=${apiKey}`;
        const candRes = await fetch(candUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        if (candRes.ok) {
          response = candRes;
          if (typeof TranslatorEngine !== 'undefined') TranslatorEngine.cachedGeminiModel = cand;
          break;
        }
      }
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || 'Gemini 語音轉寫失敗');
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  },

  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
};
