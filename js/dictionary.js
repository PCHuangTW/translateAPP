/**
 * Dictionary & Domain Terminology Database
 * Rich, pre-built domain glossaries for Chinese, English, and Japanese,
 * integrated with custom glossary lookup.
 */

const PRESET_DOMAINS = {
  tech: [
    { zh: '提示工程', en: 'Prompt Engineering', ja: 'プロンプトエンジニアリング' },
    { zh: '大語言模型', en: 'Large Language Model', ja: '大規模言語モデル' },
    { zh: '機器學習', en: 'Machine Learning', ja: '機械学習' },
    { zh: '生成式 AI', en: 'Generative AI', ja: '生成AI' },
    { zh: '反重力', en: 'Antigravity', ja: '反重力' },
    { zh: '檢索增強生成', en: 'Retrieval-Augmented Generation', ja: '検索拡張生成' },
    { zh: '微調', en: 'Fine-tuning', ja: 'ファインチューニング' },
    { zh: '雲端原生', en: 'Cloud Native', ja: 'クラウドネイティブ' },
    { zh: '微服務', en: 'Microservices', ja: 'マイクロサービス' },
    { zh: '前端開發', en: 'Frontend Development', ja: 'フロントエンド開発' },
    { zh: '容器化', en: 'Containerization', ja: 'コンテナ化' },
    { zh: '開源', en: 'Open Source', ja: 'オープンソース' },
    { zh: '軟體架構', en: 'Software Architecture', ja: 'ソフトウェアアーキテクチャ' },
    { zh: '區塊鏈', en: 'Blockchain', ja: 'ブロックチェーン' },
    { zh: '神經網絡', en: 'Neural Network', ja: 'ニューラルネットワーク' }
  ],
  anime: [
    { zh: '虛擬主播', en: 'VTuber', ja: 'バーチャルYouTuber' },
    { zh: '轉生異世界', en: 'Isekai Reincarnation', ja: '異世界転生' },
    { zh: '抽卡', en: 'Gacha', ja: 'ガチャ' },
    { zh: '輕小說', en: 'Light Novel', ja: 'ライトノベル' },
    { zh: '速通紀錄', en: 'Speedrun', ja: 'スピードラン' },
    { zh: '角色扮演', en: 'Cosplay', ja: 'コスプレ' },
    { zh: '公會', en: 'Guild', ja: 'ギルド' },
    { zh: '負面效果', en: 'Debuff', ja: 'デバフ' },
    { zh: '增益效果', en: 'Buff', ja: 'バフ' },
    { zh: '冷卻時間', en: 'Cooldown', ja: 'クールダウン' },
    { zh: '暴擊', en: 'Critical Hit', ja: 'クリティカルヒット' },
    { zh: '技能樹', en: 'Skill Tree', ja: 'スキルツリー' },
    { zh: '御宅族', en: 'Otaku', ja: 'オタク' },
    { zh: '聖地巡禮', en: 'Anime Pilgrimage', ja: '聖地巡礼' },
    { zh: '同人誌', en: 'Doujinshi', ja: '同人誌' }
  ],
  business: [
    { zh: '投資回報率', en: 'Return on Investment', ja: '投資対効果' },
    { zh: '關鍵績效指標', en: 'Key Performance Indicator', ja: '重要業績評価指標' },
    { zh: '企業公開募股', en: 'Initial Public Offering', ja: '新規公開株' },
    { zh: '風險投資', en: 'Venture Capital', ja: 'ベンチャーキャピタル' },
    { zh: '盡職調查', en: 'Due Diligence', ja: 'デューデリジェンス' },
    { zh: '現金流', en: 'Cash Flow', ja: 'キャッシュフロー' },
    { zh: '利害關係人', en: 'Stakeholder', ja: 'ステークホルダー' },
    { zh: '商業模式', en: 'Business Model', ja: 'ビジネスモデル' },
    { zh: '藍海策略', en: 'Blue Ocean Strategy', ja: 'ブルーオーシャン戦略' },
    { zh: '企業永續', en: 'ESG Sustainability', ja: 'ESGサステナビリティ' },
    { zh: '合併與收購', en: 'Mergers and Acquisitions', ja: 'M&A（企業の合併・買収）' },
    { zh: '轉型樞紐', en: 'Pivot', ja: 'ピボット' },
    { zh: '營運資金', en: 'Working Capital', ja: '運転資金' }
  ],
  travel: [
    { zh: '高雄火車站', en: 'Kaohsiung Main Station', ja: '高雄駅' },
    { zh: '台北火車站', en: 'Taipei Main Station', ja: '台北駅' },
    { zh: '台中火車站', en: 'Taichung Station', ja: '台中駅' },
    { zh: '高鐵', en: 'High Speed Rail (HSR)', ja: '台湾新幹線' },
    { zh: '台鐵', en: 'Taiwan Railways (TRA)', ja: '台湾鉄道' },
    { zh: '捷運', en: 'Metro (MRT)', ja: 'MRT（地下鉄）' },
    { zh: '居酒屋', en: 'Izakaya', ja: '居酒屋' },
    { zh: '無菜單料理', en: 'Omakase', ja: 'おまかせ' },
    { zh: '溫泉旅館', en: 'Ryokan', ja: '温泉旅館' },
    { zh: '懷石料理', en: 'Kaiseki Dining', ja: '懐石料理' },
    { zh: '登機證', en: 'Boarding Pass', ja: '搭乗券' },
    { zh: '中途過境', en: 'Layover', ja: 'レイオーバー' },
    { zh: '行程規劃', en: 'Itinerary', ja: '旅行日程' },
    { zh: '米其林指南', en: 'Michelin Guide', ja: 'ミシュランガイド' },
    { zh: '免稅店', en: 'Duty-Free Shop', ja: '免税店' },
    { zh: '背包客', en: 'Backpacker', ja: 'バックパッカー' },
    { zh: '世界文化遺產', en: 'World Cultural Heritage', ja: '世界文化遺産' },
    { zh: '禮品伴手禮', en: 'Souvenir', ja: 'お土産' }
  ],
  medical: [
    { zh: '雙盲試驗', en: 'Double-blind Study', ja: '二重盲検試験' },
    { zh: '安慰劑效應', en: 'Placebo Effect', ja: 'プラシーボ効果' },
    { zh: '同行審查', en: 'Peer Review', ja: '査読' },
    { zh: '臨床試驗', en: 'Clinical Trial', ja: '治験・臨床試験' },
    { zh: '免疫療法', en: 'Immunotherapy', ja: '免疫療法' },
    { zh: '基因編輯', en: 'Gene Editing (CRISPR)', ja: 'ゲノム編集' },
    { zh: '生物標記', en: 'Biomarker', ja: 'バイオマーカー' },
    { zh: '薈萃分析', en: 'Meta-analysis', ja: 'メタアナリシス' },
    { zh: '研究假設', en: 'Research Hypothesis', ja: '研究仮説' },
    { zh: '疫苗功效', en: 'Vaccine Efficacy', ja: 'ワクチンの有効性' }
  ]
};

const DictionaryEngine = {
  /**
   * Get all active terminology mappings based on chosen domain and custom glossaries.
   */
  getActiveTerms(selectedDomain, sourceLang, targetLang) {
    const terms = [];

    // Helper to extract key for language code
    const getLangKey = (code) => {
      if (code.startsWith('zh')) return 'zh';
      if (code.startsWith('en')) return 'en';
      if (code.startsWith('ja')) return 'ja';
      return 'en';
    };

    const srcKey = getLangKey(sourceLang);
    const tgtKey = getLangKey(targetLang);

    // 1. Add preset domain terms
    if (selectedDomain && PRESET_DOMAINS[selectedDomain]) {
      PRESET_DOMAINS[selectedDomain].forEach(item => {
        if (item[srcKey] && item[tgtKey]) {
          terms.push({
            src: item[srcKey],
            tgt: item[tgtKey],
            domain: selectedDomain,
            type: 'preset'
          });
        }
      });
    } else if (selectedDomain === 'general' || !selectedDomain) {
      // In general mode, include all domain glossaries to protect proper nouns
      Object.keys(PRESET_DOMAINS).forEach(dom => {
        PRESET_DOMAINS[dom].forEach(item => {
          if (item[srcKey] && item[tgtKey]) {
            terms.push({
              src: item[srcKey],
              tgt: item[tgtKey],
              domain: dom,
              type: 'preset'
            });
          }
        });
      });
    }

    // 2. Add user custom terms (take highest priority)
    const customTerms = StorageManager.getCustomTerms();
    customTerms.forEach(item => {
      if (item.src && item.tgt) {
        terms.unshift({
          src: item.src,
          tgt: item.tgt,
          domain: item.domain || 'custom',
          type: 'custom'
        });
      }
    });

    return terms;
  },

  /**
   * Detect which terms appear in the given source text.
   */
  detectTermsInText(text, selectedDomain, sourceLang, targetLang) {
    if (!text || text.trim() === '') return [];
    
    const activeTerms = this.getActiveTerms(selectedDomain, sourceLang, targetLang);
    const matched = [];

    // Sort by longest source string first to avoid partial matches
    activeTerms.sort((a, b) => b.src.length - a.src.length);

    const textLower = text.toLowerCase();

    activeTerms.forEach(term => {
      if (term.src && textLower.includes(term.src.toLowerCase())) {
        // Prevent adding duplicate source terms
        if (!matched.some(m => m.src.toLowerCase() === term.src.toLowerCase())) {
          matched.push(term);
        }
      }
    });

    return matched;
  }
};
