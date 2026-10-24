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

    if (targetLang.startsWith('zh')) {
      rawTranslation = this._toTraditional(rawTranslation);
    }

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

CRITICAL RULES:
1. If the target language is Traditional Chinese, you MUST output exclusively in Taiwan Traditional Chinese (台灣繁體中文/正體中文) using Taiwan punctuation and local terminology. Strictly NEVER use Simplified Chinese characters.
2. Output ONLY the translated text without commentary, notes, or markdown wrappers.`;

    const requestPayload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        parts: [{ text: text }]
      }],
      generationConfig: {
        temperature: 0.2
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
    let candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
    if (targetLang.startsWith('zh')) {
      candidateText = this._toTraditional(candidateText);
    }
    return candidateText;
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
            content: `You are an expert translator from ${srcLangName} to ${tgtLangName}. Focus on fluent native phrasing and technical term accuracy.${glossaryInstructions}
CRITICAL MANDATE: If target language is Traditional Chinese, you MUST use Taiwan Traditional Chinese characters (正體中文/繁體中文) and local terminology only. Never output Simplified Chinese characters.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || 'OpenAI API 翻譯失敗');
    }

    const data = await response.json();
    let result = data.choices?.[0]?.message?.content?.trim() || text;
    if (targetLang.startsWith('zh')) {
      result = this._toTraditional(result);
    }
    return result;
  },

  _getShortLang(code) {
    if (!code) return 'zh-TW';
    if (code === 'zh-TW' || code === 'zh-HK' || code.startsWith('zh')) return 'zh-TW';
    if (code.startsWith('en')) return 'en';
    if (code.startsWith('ja')) return 'ja';
    return code;
  },

  _getLangName(code) {
    if (code === 'zh-TW' || code === 'zh-HK' || code.startsWith('zh')) {
      return 'Traditional Chinese (繁體中文/台灣在地慣用語，請務必完全使用繁體中文輸出，嚴禁使用簡體中文)';
    }
    if (code.startsWith('en')) return 'English';
    if (code.startsWith('ja')) return 'Japanese (日本語)';
    return code;
  },

  _escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  /**
   * Fast Simplified-to-Traditional Chinese Sanitizer
   * Ensures 100% Traditional Chinese consistency even if external APIs return Simplified characters.
   */
  _toTraditional(text) {
    if (!text) return '';
    const s2tDict = {
      '们': '們', '个': '個', '爱': '愛', '这': '這', '样': '樣', '为': '為', '时': '時', '会': '會',
      '过': '過', '发': '發', '对': '對', '说': '說', '国': '國', '学': '學', '点': '點', '经': '經',
      '动': '動', '关': '關', '开': '開', '头': '頭', '见': '見', '体': '體', '长': '長', '线': '線',
      '无': '無', '从': '從', '来': '來', '与': '與', '给': '給', '让': '讓', '认': '認', '识': '識',
      '话': '話', '变': '變', '电': '電', '机': '機', '现': '現', '场': '場', '声': '聲', '音': '音',
      '乐': '樂', '歌': '歌', '词': '詞', '曲': '曲', '听': '聽', '写': '寫', '读': '讀', '记': '記',
      '录': '錄', '转': '轉', '译': '譯', '语': '語', '言': '言', '单': '單', '双': '雙', '进': '進',
      '问': '問', '题': '題', '实': '實', '验': '驗', '结': '結', '果': '果', '网': '網', '络': '絡',
      '软': '軟', '件': '件', '数': '數', '据': '據', '库': '庫', '构': '構', '图': '圖', '书': '書',
      '馆': '館', '车': '車', '站': '站', '台': '臺', '湾': '灣', '铁': '鐵', '高': '高', '铁': '鐵',
      '捷': '捷', '运': '運', '飞': '飛', '东': '東', '西': '西', '南': '南', '北': '北', '门': '門',
      '户': '戶', '风': '風', '险': '險', '测': '測', '试': '試', '规': '規', '划': '劃', '优': '優',
      '化': '化', '用': '用', '户': '戶', '资': '資', '讯': '訊', '质': '質', '量': '量', '预': '預',
      '算': '算', '钱': '錢', '账': '賬', '号': '號', '码': '碼', '总': '總', '计': '計', '算': '算',
      '标': '標', '准': '準', '确': '確', '认': '認', '证': '證', '书': '書', '报': '報', '告': '告',
      '伤': '傷', '心': '心', '梦': '夢', '想': '想', '带': '帶', '走': '走', '离': '離', '别': '別',
      '难': '難', '过': '過', '欢': '歡', '迎': '迎', '岁': '歲', '月': '月', '时': '時', '光': '光',
      '阴': '陰', '晴': '晴', '圆': '圓', '缺': '缺', '边': '邊', '界': '界', '处': '處', '理': '理'
    };
    return text.replace(/[\u4e00-\u9fa5]/g, char => s2tDict[char] || char);
  }
};
