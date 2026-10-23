/**
 * Natural Language Translation Engine with Proper Noun & Terminology Support
 * Supports Built-in Smart Engine, Gemini AI API, and OpenAI API.
 */

const TranslatorEngine = {
  /**
   * Main Translation Entry Point
   */
  async translate(text, sourceLang, targetLang, domain = 'general') {
    if (!text || text.trim() === '') {
      return { translatedText: '', matchedTerms: [], engine: 'None' };
    }

    const settings = StorageManager.getSettings();
    const provider = settings.provider || 'builtin';
    const apiKey = settings.apiKey || '';

    // 1. Detect matched terms in source text first
    const matchedTerms = DictionaryEngine.detectTermsInText(text, domain, sourceLang, targetLang);

    let resultText = '';
    let engineLabel = '';

    if (provider === 'gemini' && apiKey) {
      resultText = await this._translateWithGemini(text, sourceLang, targetLang, domain, matchedTerms, apiKey);
      engineLabel = 'Gemini AI 專有名詞強化';
    } else if (provider === 'openai' && apiKey) {
      resultText = await this._translateWithOpenAI(text, sourceLang, targetLang, domain, matchedTerms, apiKey);
      engineLabel = 'ChatGPT 語意流暢引擎';
    } else {
      // Built-in Smart Engine
      resultText = await this._translateWithBuiltin(text, sourceLang, targetLang, domain, matchedTerms);
      engineLabel = 'LinguaFlow 術語智慧引擎';
    }

    return {
      translatedText: resultText,
      matchedTerms: matchedTerms,
      engine: engineLabel
    };
  },

  /**
   * Built-in Engine using MyMemory / Free Translation Pipeline + Term Dictionary Protection
   */
  async _translateWithBuiltin(text, sourceLang, targetLang, domain, matchedTerms) {
    // Step 1: Pre-process text by replacing matched proper nouns with temporary placeholder tokens
    let processedText = text;
    const tokenMap = new Map();

    matchedTerms.forEach((term, index) => {
      const placeholder = `__TERM_${index}__`;
      // Replace with token case-insensitively
      const regex = new RegExp(this._escapeRegExp(term.src), 'gi');
      processedText = processedText.replace(regex, placeholder);
      tokenMap.set(placeholder, term.tgt);
    });

    // Step 2: Call MyMemory Translation API for natural sentence phrasing
    let rawTranslation = '';
    try {
      const langPair = `${this._getShortLang(sourceLang)}|${this._getShortLang(targetLang)}`;
      const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(processedText)}&langpair=${encodeURIComponent(langPair)}`;

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        if (data && data.responseData && data.responseData.translatedText) {
          rawTranslation = data.responseData.translatedText;
        }
      }
    } catch (e) {
      console.warn('MyMemory API fallback trigger:', e);
    }

    // Fallback if API fails or offline
    if (!rawTranslation) {
      rawTranslation = processedText;
    }

    // Step 3: Post-process by substituting placeholder tokens with the exact proper noun target translation
    matchedTerms.forEach((term, index) => {
      const tokenName = `TERM_${index}`;
      // Regex matches __TERM_0__, __ term_0 __, __term_0__ case-insensitively with flexible spaces
      const regex = new RegExp(`__\\s*${tokenName.replace('_', '\\s*_\\s*')}\\s*__`, 'gi');
      rawTranslation = rawTranslation.replace(regex, term.tgt);
    });

    // Fallback: replace any remaining __TERM_x__ patterns if API mangled the index
    rawTranslation = rawTranslation.replace(/__\s*TERM\s*_\s*\d+\s*__/gi, '');

    // Step 4: Fallback direct term replacement if any source term wasn't replaced
    matchedTerms.forEach(term => {
      if (term.src && term.tgt && !rawTranslation.toLowerCase().includes(term.tgt.toLowerCase())) {
        const reg = new RegExp(this._escapeRegExp(term.src), 'gi');
        rawTranslation = rawTranslation.replace(reg, term.tgt);
      }
    });

    return rawTranslation;
  },

  cachedGeminiModel: null,

  /**
   * Dynamically discover available Gemini models for the user's API key
   */
  async _resolveGeminiModel(apiKey) {
    if (this.cachedGeminiModel) return this.cachedGeminiModel;

    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const res = await fetch(listUrl);
      if (res.ok) {
        const data = await res.json();
        const models = data.models || [];
        const supported = models.filter(m => 
          m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
        );

        // Preference 1: Flash models (fastest & cost-effective)
        const flashModel = supported.find(m => m.name.toLowerCase().includes('flash') && !m.name.includes('vision'));
        if (flashModel) {
          const cleanName = flashModel.name.replace(/^models\//, '');
          this.cachedGeminiModel = cleanName;
          return cleanName;
        }

        // Preference 2: Any Gemini model
        const anyGemini = supported.find(m => m.name.toLowerCase().includes('gemini'));
        if (anyGemini) {
          const cleanName = anyGemini.name.replace(/^models\//, '');
          this.cachedGeminiModel = cleanName;
          return cleanName;
        }
      }
    } catch (e) {
      console.warn('Failed to dynamically query Gemini ListModels:', e);
    }

    // Default fallback
    this.cachedGeminiModel = 'gemini-1.5-flash-latest';
    return this.cachedGeminiModel;
  },

  /**
   * Translation via Gemini AI API with dynamic model discovery and fallback
   */
  async _translateWithGemini(text, sourceLang, targetLang, domain, matchedTerms, apiKey) {
    const srcLangName = this._getLangName(sourceLang);
    const tgtLangName = this._getLangName(targetLang);

    let glossaryInstructions = '';
    if (matchedTerms.length > 0) {
      glossaryInstructions = `\nCRITICAL MANDATE: You MUST preserve and accurately render the following domain-specific proper nouns/terms:\n` +
        matchedTerms.map(t => `- "${t.src}" -> "${t.tgt}"`).join('\n');
    }

    const systemPrompt = `You are a world-class professional translator specializing in fluent, natural context translation between ${srcLangName} and ${tgtLangName}.
Domain Context: ${domain}
Target Style: Fluent, natural native phrasing (NOT literal word-by-word translation).${glossaryInstructions}

Translate the following source text accurately and fluently. Output ONLY the translated text without commentary.`;

    const requestPayload = {
      contents: [{
        parts: [{ text: `${systemPrompt}\n\nSource Text:\n${text}` }]
      }],
      generationConfig: {
        temperature: 0.3
      }
    };

    let modelName = await this._resolveGeminiModel(apiKey);
    let url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    let response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });

    // If initial model request fails with 404, iterate through known stable candidate models
    if (!response.ok && (response.status === 404 || response.status === 400)) {
      const candidateList = ['gemini-1.5-flash-latest', 'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-pro'];
      for (const cand of candidateList) {
        if (cand === modelName) continue;
        const candUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cand}:generateContent?key=${apiKey}`;
        const candRes = await fetch(candUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload)
        });

        if (candRes.ok) {
          response = candRes;
          this.cachedGeminiModel = cand;
          break;
        }
      }
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Gemini API 翻譯失敗');
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return candidateText ? candidateText.trim() : text;
  },

  /**
   * Translation via OpenAI ChatGPT API
   */
  async _translateWithOpenAI(text, sourceLang, targetLang, domain, matchedTerms, apiKey) {
    const srcLangName = this._getLangName(sourceLang);
    const tgtLangName = this._getLangName(targetLang);

    let glossaryInstructions = '';
    if (matchedTerms.length > 0) {
      glossaryInstructions = `\nYou MUST use these exact term translations for proper nouns:\n` +
        matchedTerms.map(t => `- ${t.src} => ${t.tgt}`).join('\n');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert translator from ${srcLangName} to ${tgtLangName}. Focus on fluent native phrasing and technical term accuracy.${glossaryInstructions}`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || 'OpenAI API 翻譯失敗');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || text;
  },

  _getShortLang(code) {
    if (code.startsWith('zh')) return 'zh';
    if (code.startsWith('en')) return 'en';
    if (code.startsWith('ja')) return 'ja';
    return 'en';
  },

  _getLangName(code) {
    if (code.startsWith('zh')) return 'Traditional Chinese (繁體中文)';
    if (code.startsWith('en')) return 'English';
    if (code.startsWith('ja')) return 'Japanese (日本語)';
    return code;
  },

  _escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
};
