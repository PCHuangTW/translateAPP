/**
 * LinguaFlow Main Application Controller
 * Connects UI events, voice recording workflow, term detection, translation engine, and local storage.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const sourceLangSelect = document.getElementById('sourceLang');
  const targetLangSelect = document.getElementById('targetLang');
  const swapLangBtn = document.getElementById('swapLangBtn');
  const domainSelect = document.getElementById('domainSelect');

  const sourceTextarea = document.getElementById('sourceText');
  const targetTextDiv = document.getElementById('targetText');
  const charCountSpan = document.getElementById('charCount');
  const clearInputBtn = document.getElementById('clearInputBtn');

  // Recording Panel & Controls
  const recordingPanel = document.getElementById('recordingPanel');
  const recordBtn = document.getElementById('recordBtn');
  const recordBtnText = document.getElementById('recordBtnText');
  const finishRecordBtn = document.getElementById('finishRecordBtn');
  const translateBtn = document.getElementById('translateBtn');

  // Badges & Displays
  const detectedTermsBadge = document.getElementById('detectedTermsBadge');
  const termsListSpan = document.getElementById('termsList');
  const translationLoading = document.getElementById('translationLoading');
  const translationEngineBadge = document.getElementById('translationEngineBadge');
  const termBreakdownPanel = document.getElementById('termBreakdownPanel');
  const termTagsContainer = document.getElementById('termTagsContainer');

  // Result Action Buttons
  const speakResultBtn = document.getElementById('speakResultBtn');
  const copyResultBtn = document.getElementById('copyResultBtn');
  const favResultBtn = document.getElementById('favResultBtn');

  // History & Modals
  const historyListContainer = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  const customTermsBtn = document.getElementById('customTermsBtn');
  const glossaryModal = document.getElementById('glossaryModal');
  const addTermForm = document.getElementById('addTermForm');
  const glossaryTableBody = document.getElementById('glossaryTableBody');

  const apiSettingsBtn = document.getElementById('apiSettingsBtn');
  const apiModal = document.getElementById('apiModal');
  const aiProviderSelect = document.getElementById('aiProviderSelect');
  const apiKeyContainer = document.getElementById('apiKeyContainer');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const sttEngineSelect = document.getElementById('sttEngineSelect');
  const saveApiSettingsBtn = document.getElementById('saveApiSettingsBtn');

  // --- Instances ---
  const recorder = new AudioRecorder('waveformCanvas', 'recordingTimer');
  let isRecordingState = false;
  let currentTranslationResult = null;

  // --- Initial Setup ---
  initApp();

  function initApp() {
    loadSettingsIntoUI();
    renderGlossaryTable();
    renderHistory();
    updateTermDetection();

    // Register Service Worker for PWA support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('LinguaFlow PWA Service Worker Registered'))
        .catch(err => console.log('Service Worker registration failed:', err));
    }

    // Event Listeners
    setupEventListeners();
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // Character count & live term detection on text typing
    sourceTextarea.addEventListener('input', () => {
      const len = sourceTextarea.value.length;
      charCountSpan.textContent = len;
      updateTermDetection();
    });

    // Language swapping
    swapLangBtn.addEventListener('click', () => {
      const temp = sourceLangSelect.value;
      sourceLangSelect.value = targetLangSelect.value;
      targetLangSelect.value = temp;
      updateTermDetection();
      showToast('已對調來源與目標語言');
    });

    sourceLangSelect.addEventListener('change', updateTermDetection);
    targetLangSelect.addEventListener('change', updateTermDetection);
    domainSelect.addEventListener('change', updateTermDetection);

    // Clear input
    clearInputBtn.addEventListener('click', () => {
      sourceTextarea.value = '';
      charCountSpan.textContent = '0';
      targetTextDiv.textContent = '翻譯結果將顯示於此...';
      targetTextDiv.classList.add('placeholder-text');
      termBreakdownPanel.classList.add('hidden');
      disableResultButtons();
      updateTermDetection();
    });

    // Translate Button (Text)
    translateBtn.addEventListener('click', () => {
      handleTranslate();
    });

    // Keyboard shortcut Ctrl+Enter
    sourceTextarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleTranslate();
      }
    });

    // --- Voice Recording Flow ---
    recordBtn.addEventListener('click', toggleRecording);
    finishRecordBtn.addEventListener('click', finishRecordingAndTranslate);

    // Result Action Buttons
    speakResultBtn.addEventListener('click', speakTranslation);
    copyResultBtn.addEventListener('click', copyTranslation);
    favResultBtn.addEventListener('click', toggleFavorite);

    // History
    clearHistoryBtn.addEventListener('click', () => {
      StorageManager.clearHistory();
      renderHistory();
      showToast('已清空翻譯歷史紀錄');
    });

    // Modals
    customTermsBtn.addEventListener('click', () => openModal('glossaryModal'));
    apiSettingsBtn.addEventListener('click', () => openModal('apiModal'));

    document.querySelectorAll('.close-modal-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modalId = e.currentTarget.getAttribute('data-modal');
        closeModal(modalId);
      });
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal(modal.id);
        }
      });
    });

    // Add term form submit
    addTermForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const src = document.getElementById('termSrc').value;
      const tgt = document.getElementById('termTgt').value;
      const domain = document.getElementById('termDomain').value;

      if (src && tgt) {
        StorageManager.addCustomTerm(src, tgt, domain);
        renderGlossaryTable();
        updateTermDetection();
        addTermForm.reset();
        showToast(`已新增專有名詞: ${src} -> ${tgt}`, 'success');
      }
    });

    // API provider select change
    aiProviderSelect.addEventListener('change', () => {
      if (aiProviderSelect.value === 'builtin') {
        apiKeyContainer.classList.add('hidden');
      } else {
        apiKeyContainer.classList.remove('hidden');
        if (aiProviderSelect.value === 'gemini') {
          sttEngineSelect.value = 'gemini';
        } else if (aiProviderSelect.value === 'openai') {
          sttEngineSelect.value = 'whisper';
        }
      }
    });

    saveApiSettingsBtn.addEventListener('click', () => {
      const settings = {
        provider: aiProviderSelect.value,
        apiKey: apiKeyInput.value.trim(),
        sttEngine: sttEngineSelect.value
      };
      StorageManager.saveSettings(settings);
      closeModal('apiModal');
      showToast('API 設定已儲存', 'success');
    });
  }

  // --- Voice Recording Logic ---

  async function toggleRecording() {
    if (!isRecordingState) {
      const settings = StorageManager.getSettings();
      const hasBrowserSpeech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

      // Determine strategy: If user provided an API key (Gemini / OpenAI), always prefer Cloud Audio Recording
      const isCloudSTT = !!settings.apiKey && (settings.sttEngine === 'gemini' || settings.sttEngine === 'whisper' || settings.provider === 'gemini' || settings.provider === 'openai');
      const useBrowserSTT = !isCloudSTT && hasBrowserSpeech;

      if (!hasBrowserSpeech && !settings.apiKey) {
        showToast('提示：當前瀏覽器不支援免金鑰網頁語音辨識。請點擊右上角齒輪輸入 Gemini Key 以啟用雲端歌曲/語音轉寫。', 'warning');
        return;
      }

      if (!settings.apiKey && sourceLangSelect.value === 'ja-JP') {
        showToast('提示：免金鑰瀏覽器辨識無法分離歌曲伴奏與歌詞。若要辨識日文歌，請至右上角設定輸入 Gemini Key。', 'warning');
      }

      try {
        isRecordingState = true;

        // UI Updates for recording active state
        recordingPanel.classList.add('active');
        recordBtn.classList.add('recording');
        recordBtnText.textContent = '停止錄音';
        finishRecordBtn.classList.remove('hidden');

        if (useBrowserSTT) {
          // Native browser speech recognition - Do NOT start AudioRecorder to prevent audio hardware lock
          STTEngine.startBrowserRecognition(
            sourceLangSelect.value,
            (interimText) => {
              sourceTextarea.value = interimText;
              charCountSpan.textContent = interimText.length;
              updateTermDetection();
            },
            (errorType) => {
              if (errorType === 'not-allowed') {
                showToast('語音辨識未獲得麥克風權限，請於網址列允許存取', 'error');
              } else if (errorType === 'network') {
                showToast('語音辨識網路連線逾時（瀏覽器語音辨識需連線至外網）', 'error');
              } else if (errorType === 'audio-capture') {
                showToast('麥克風已被其他程式或分頁佔用', 'error');
              } else {
                showToast(`語音辨識異常: ${errorType}`, 'error');
              }
            },
            (status) => {
              if (status === 'LISTENING') {
                showToast('正在聆聽中，請對著手機說話...', 'info');
              }
            }
          );
        } else {
          // Cloud STT (Gemini / Whisper) - Record audio blob for cloud submission
          await recorder.start();
          showToast('已開始錄音，講完請按下「輸入完畢並翻譯」', 'info');
        }
      } catch (err) {
        await stopRecordingUI();
        showToast(err.message, 'error');
      }
    } else {
      // Cancel / Stop recording without translating
      await stopRecordingUI();
      showToast('已停止錄音');
    }
  }

  /**
   * Called when user presses "輸入完畢並翻譯" (Finish Recording & Translate)
   */
  async function finishRecordingAndTranslate() {
    if (!isRecordingState) return;

    showToast('語音錄製完成，正在進行轉譯與流暢翻譯...', 'success');

    // 1. Stop Speech Recognition if active
    const browserTranscript = STTEngine.stopBrowserRecognition();

    // 2. Stop AudioRecorder if active
    let recordingData = null;
    if (recorder.isRecording) {
      try {
        recordingData = await recorder.stop();
      } catch (e) {}
    }
    await stopRecordingUI();

    let finalText = sourceTextarea.value.trim() || browserTranscript;

    // 3. Fallback cloud transcription if local browser transcript is empty or user requested cloud engine
    const settings = StorageManager.getSettings();
    const needsCloudSTT = (!finalText || settings.sttEngine === 'whisper' || settings.sttEngine === 'gemini') && recordingData?.blob;

    if (needsCloudSTT && settings.apiKey) {
      try {
        translationLoading.classList.remove('hidden');

        // Prioritize Gemini if selected or provider is Gemini
        if (settings.sttEngine === 'gemini' || (settings.provider === 'gemini' && settings.sttEngine !== 'whisper')) {
          showToast('正在調用 Gemini AI 進行多模態音訊辨識...', 'info');
          finalText = await STTEngine.transcribeWithGemini(recordingData.blob, settings.apiKey, sourceLangSelect.value);
        } else if (settings.sttEngine === 'whisper' || settings.provider === 'openai') {
          showToast('正在調用 OpenAI Whisper 進行高精準轉寫...', 'info');
          finalText = await STTEngine.transcribeWithWhisper(recordingData.blob, settings.apiKey, sourceLangSelect.value);
        }

        if (finalText) {
          sourceTextarea.value = finalText;
          charCountSpan.textContent = finalText.length;
          updateTermDetection();
        }
      } catch (err) {
        showToast(`語音轉寫失敗: ${err.message}`, 'error');
      } finally {
        translationLoading.classList.add('hidden');
      }
    }

    // 4. Trigger translation immediately
    if (finalText) {
      handleTranslate();
    } else {
      showToast('未偵測到清晰語音文字，請點擊輸入框重試或使用鍵盤語音輸入。', 'error');
    }
  }

  async function stopRecordingUI() {
    isRecordingState = false;
    STTEngine.stopBrowserRecognition();
    if (recorder.isRecording) {
      try {
        await recorder.stop();
      } catch (e) {}
    }
    recordingPanel.classList.remove('active');
    recordBtn.classList.remove('recording');
    recordBtnText.textContent = '開始錄音';
    finishRecordBtn.classList.add('hidden');
  }

  // --- Translation Trigger & Handling ---

  async function handleTranslate() {
    const text = sourceTextarea.value.trim();
    if (!text) {
      showToast('請先輸入文字或錄製語音', 'error');
      return;
    }

    const srcLang = sourceLangSelect.value;
    const tgtLang = targetLangSelect.value;
    const domain = domainSelect.value;

    // Show loading
    translationLoading.classList.remove('hidden');

    try {
      const res = await TranslatorEngine.translate(text, srcLang, tgtLang, domain);
      currentTranslationResult = res;

      // Update UI Result
      targetTextDiv.textContent = res.translatedText;
      targetTextDiv.classList.remove('placeholder-text');
      translationEngineBadge.innerHTML = `<i class="fa-solid fa-brain"></i> ${res.engine}`;

      // Render Term Breakdown if any proper nouns matched
      if (res.matchedTerms && res.matchedTerms.length > 0) {
        termBreakdownPanel.classList.remove('hidden');
        termTagsContainer.innerHTML = res.matchedTerms.map(term => `
          <div class="term-pair" title="領域: ${term.domain}">
            <span class="src-word">${escapeHtml(term.src)}</span>
            <span class="arrow"><i class="fa-solid fa-arrow-right"></i></span>
            <span class="tgt-word">${escapeHtml(term.tgt)}</span>
          </div>
        `).join('');
      } else {
        termBreakdownPanel.classList.add('hidden');
      }

      enableResultButtons();

      // Save to History
      StorageManager.addHistoryItem({
        srcText: text,
        tgtText: res.translatedText,
        srcLang: srcLang,
        tgtLang: tgtLang,
        domain: domain,
        termsUsed: res.matchedTerms.map(t => `${t.src}->${t.tgt}`)
      });

      renderHistory();
    } catch (err) {
      showToast(`翻譯發生錯誤: ${err.message}`, 'error');
    } finally {
      translationLoading.classList.add('hidden');
    }
  }

  // --- Live Term Detection Badge ---

  function updateTermDetection() {
    const text = sourceTextarea.value;
    const domain = domainSelect.value;
    const srcLang = sourceLangSelect.value;
    const tgtLang = targetLangSelect.value;

    const matched = DictionaryEngine.detectTermsInText(text, domain, srcLang, tgtLang);

    if (matched.length > 0) {
      detectedTermsBadge.classList.remove('hidden');
      termsListSpan.innerHTML = matched.map(m => `
        <span class="term-tag">${escapeHtml(m.src)} &rarr; ${escapeHtml(m.tgt)}</span>
      `).join(' ');
    } else {
      detectedTermsBadge.classList.add('hidden');
    }
  }

  // --- Result Actions (TTS, Copy, Fav) ---

  function speakTranslation() {
    if (!currentTranslationResult || !currentTranslationResult.translatedText) return;

    const synth = window.speechSynthesis;
    if (!synth) {
      showToast('您的瀏覽器不支援語音朗讀機能', 'error');
      return;
    }

    synth.cancel(); // Stop ongoing speech
    const utterance = new SpeechSynthesisUtterance(currentTranslationResult.translatedText);
    utterance.lang = targetLangSelect.value;
    utterance.rate = 0.95;

    synth.speak(utterance);
    showToast('正在朗讀翻譯結果...');
  }

  function copyTranslation() {
    if (!currentTranslationResult || !currentTranslationResult.translatedText) return;

    navigator.clipboard.writeText(currentTranslationResult.translatedText).then(() => {
      showToast('已複製譯文至剪貼簿', 'success');
    }).catch(() => {
      showToast('複製失敗', 'error');
    });
  }

  function toggleFavorite() {
    favResultBtn.classList.toggle('active');
    showToast('已加入收藏對照庫', 'success');
  }

  function enableResultButtons() {
    speakResultBtn.removeAttribute('disabled');
    copyResultBtn.removeAttribute('disabled');
    favResultBtn.removeAttribute('disabled');
  }

  function disableResultButtons() {
    speakResultBtn.setAttribute('disabled', 'true');
    copyResultBtn.setAttribute('disabled', 'true');
    favResultBtn.setAttribute('disabled', 'true');
  }

  // --- History & Glossary Renderers ---

  function renderHistory() {
    const history = StorageManager.getHistory();

    if (!history || history.length === 0) {
      historyListContainer.innerHTML = '<div class="empty-state">尚無翻譯紀錄</div>';
      return;
    }

    historyListContainer.innerHTML = history.map(item => `
      <div class="history-item" onclick="loadHistoryItem('${escapeHtml(item.srcText)}')">
        <div class="history-content">
          <div class="history-src">${escapeHtml(item.srcText)}</div>
          <div class="history-tgt">${escapeHtml(item.tgtText)}</div>
        </div>
        <div class="history-meta">
          <span class="history-tag">${getLangLabel(item.srcLang)} &rarr; ${getLangLabel(item.tgtLang)}</span>
          <span>${item.timestamp}</span>
        </div>
      </div>
    `).join('');
  }

  window.loadHistoryItem = function(srcText) {
    sourceTextarea.value = srcText;
    charCountSpan.textContent = srcText.length;
    updateTermDetection();
    handleTranslate();
  };

  function renderGlossaryTable() {
    const terms = StorageManager.getCustomTerms();

    if (!terms || terms.length === 0) {
      glossaryTableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; color: var(--text-dim);">尚無自訂專有名詞，請利用上方表單新增。</td>
        </tr>
      `;
      return;
    }

    glossaryTableBody.innerHTML = terms.map(t => `
      <tr>
        <td><strong>${escapeHtml(t.src)}</strong></td>
        <td>${escapeHtml(t.tgt)}</td>
        <td><span class="term-tag">${t.domain || 'custom'}</span></td>
        <td>
          <button class="btn-text" onclick="deleteTerm(${t.id})" title="刪除">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  window.deleteTerm = function(id) {
    StorageManager.deleteCustomTerm(id);
    renderGlossaryTable();
    updateTermDetection();
    showToast('已刪除專有名詞');
  };

  // --- Settings UI Sync ---

  function loadSettingsIntoUI() {
    const settings = StorageManager.getSettings();
    aiProviderSelect.value = settings.provider || 'builtin';
    apiKeyInput.value = settings.apiKey || '';
    sttEngineSelect.value = settings.sttEngine || 'browser';

    if (settings.provider && settings.provider !== 'builtin') {
      apiKeyContainer.classList.remove('hidden');
    } else {
      apiKeyContainer.classList.add('hidden');
    }
  }

  // --- Helper Functions ---

  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function getLangLabel(code) {
    if (code.startsWith('zh')) return '中';
    if (code.startsWith('en')) return '英';
    if (code.startsWith('ja')) return '日';
    return code;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }
});
