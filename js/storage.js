/**
 * Storage Manager for LinguaFlow
 * Handles LocalStorage persistence for custom glossaries, translation history, and user settings.
 */

const STORAGE_KEYS = {
  CUSTOM_TERMS: 'lingua_flow_custom_terms',
  HISTORY: 'lingua_flow_history',
  FAVORITES: 'lingua_flow_favorites',
  SETTINGS: 'lingua_flow_settings'
};

const StorageManager = {
  // --- Custom Glossaries ---
  getCustomTerms() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_TERMS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to parse custom terms from storage:', e);
      return [];
    }
  },

  addCustomTerm(src, tgt, domain = 'custom') {
    const terms = this.getCustomTerms();
    // Check if exists, update if found, otherwise append
    const existingIdx = terms.findIndex(t => t.src.toLowerCase() === src.toLowerCase());
    const newTerm = { id: Date.now(), src: src.trim(), tgt: tgt.trim(), domain };
    
    if (existingIdx >= 0) {
      terms[existingIdx] = newTerm;
    } else {
      terms.unshift(newTerm);
    }

    localStorage.setItem(STORAGE_KEYS.CUSTOM_TERMS, JSON.stringify(terms));
    return terms;
  },

  deleteCustomTerm(id) {
    let terms = this.getCustomTerms();
    terms = terms.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_TERMS, JSON.stringify(terms));
    return terms;
  },

  // --- Translation History ---
  getHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  addHistoryItem(item) {
    // item: { id, srcText, tgtText, srcLang, tgtLang, domain, timestamp, termsUsed }
    let history = this.getHistory();
    // Avoid duplicate adjacent entries
    if (history.length > 0 && history[0].srcText === item.srcText && history[0].tgtText === item.tgtText) {
      return history;
    }
    history.unshift({
      id: Date.now(),
      srcText: item.srcText,
      tgtText: item.tgtText,
      srcLang: item.srcLang,
      tgtLang: item.tgtLang,
      domain: item.domain || 'general',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      termsUsed: item.termsUsed || []
    });

    // Cap at max 30 items
    if (history.length > 30) history = history.slice(0, 30);

    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    return history;
  },

  clearHistory() {
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    return [];
  },

  // --- Settings ---
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? JSON.parse(data) : {
        provider: 'builtin',
        apiKey: '',
        sttEngine: 'browser'
      };
    } catch (e) {
      return { provider: 'builtin', apiKey: '', sttEngine: 'browser' };
    }
  },

  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }
};
