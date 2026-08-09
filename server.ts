import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { createRequire } from 'module';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

// Safe require for pdf-parse in both ESM (dev) and CJS (prod)
const requireFunc = typeof require !== 'undefined'
  ? require
  : createRequire(import.meta.url);
const pdfParse = requireFunc('pdf-parse');

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json({ limit: '50mb' }));

// Helper function to call Gemini with fallback models
async function generateGeminiContent(ai: GoogleGenAI, contents: any, config: any) {
  const modelsToTry = [
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash',
    'gemini-2.5-pro'
  ];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });
      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn(`Gemini model ${model} attempt failed:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error('Yapay zeka yanıt üretemedi.');
}

function getSanitizedApiKey(apiKeyRaw?: string): string {
  if (!apiKeyRaw) return '';
  let key = apiKeyRaw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

function getRequestApiKey(req: express.Request): string {
  const customHeader = req.headers['x-gemini-api-key'] as string;
  const customBodyKey = req.body?.userApiKey;
  const customKey = customHeader || customBodyKey;

  if (customKey && typeof customKey === 'string' && customKey.trim().length > 0) {
    return getSanitizedApiKey(customKey);
  }
  return getSanitizedApiKey(process.env.GEMINI_API_KEY);
}

function handleGeminiError(error: any, res: express.Response) {
  console.error('Gemini API Error:', error);
  let message = error.message || 'Yapay zeka sunucu hatası.';
  if (message.includes('API key not valid') || message.includes('API_KEY_INVALID')) {
    message = 'Gemini API anahtarı geçersiz veya yetkisiz (API_KEY_INVALID). Lütfen uygulamanın üst panelindeki "Gemini API Key" butonuna tıklayarak kendi geçerli API anahtarınızı (AIzaSy...) girin.';
  }
  res.status(500).json({ error: message });
}

function createGeminiClient(apiKey: string) {
  const cleanKey = getSanitizedApiKey(apiKey);
  return new GoogleGenAI({
    apiKey: cleanKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

// Gemini Proxy API for Audio
app.post('/api/gemini/analyze-audio', async (req, res) => {
  try {
    const { audioData, mimeType, formFields } = req.body;
    
    const apiKey = getRequestApiKey(req);
    if (!apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY bulunamadı. Lütfen üst menüdeki "Gemini API Key" butonundan geçerli bir API anahtarı ekleyin.' });
    }

    const ai = createGeminiClient(apiKey);
    
    const prompt = `
    Sen uzman bir tıbbi genetikçi ve onkologsun.
    Sana bir hastanın ses kaydı metni veya doğrudan ses kaydı veriliyor (Mide Kanseri - Gastrik Kanser çalışması için).
    İki görevin var:
    1. Sesteki tüm konuşmayı (hikayeyi) metne dök ve "rawText" alanına koy.
    2. Aşağıdaki form alanlarını analiz edip uygun değerleri "formData" içine JSON olarak çıkar.
    Sadece belirlediğim alanları ve varsa eşleşen verileri çıkar. Bulamadığın alanları null veya boş bırak.
    
    Form Alanları:
    ${JSON.stringify(formFields)}
    
    Lütfen sadece JSON formatında yanıt ver, markdown kullanma.
    Format:
    {
      "rawText": "Hastanın anlattığı hikaye metni...",
      "formData": {
        "field_id_1": "değer",
        "field_id_2": "değer"
      }
    }
    `;

    // Process audio (base64)
    const base64Audio = audioData.split(',')[1] || audioData;
    
    const resultText = await generateGeminiContent(
      ai,
      [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: base64Audio,
              }
            }
          ]
        }
      ],
      { responseMimeType: 'application/json' }
    );

    res.json(JSON.parse(resultText));
  } catch (error: any) {
    handleGeminiError(error, res);
  }
});

// Gemini Proxy API for Images (Screenshots / Reports)
app.post('/api/gemini/analyze-image', async (req, res) => {
  try {
    const { imageData, mimeType, formFields } = req.body;
    
    const apiKey = getRequestApiKey(req);
    if (!apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY bulunamadı. Lütfen üst menüdeki "Gemini API Key" butonundan geçerli bir API anahtarı ekleyin.' });
    }

    const ai = createGeminiClient(apiKey);
    
    const prompt = `
    Sen uzman bir tıbbi genetikçi ve onkologsun.
    Sana bir hastanın tıbbi raporunun (patoloji, genetik, laboratuvar sonucu) ekran görüntüsü veya fotoğrafı veriliyor.
    Görevlerin:
    1. Görüntüdeki tüm tıbbi metni eksiksiz olarak oku (OCR) ve "rawText" alanına çıkar. (Bu metin, doktorun dosyaya doğrudan yapıştırabileceği şekilde temiz ve tam olmalı).
    2. OCR işlemi sırasında oluşabilecek veya görüntünün kendisinde var olan yanlış yazımları (Türkçe ve İngilizce) tıbbi literatüre ve tıbbi terminolojiye tam uygun olacak şekilde düzelt. Tipik OCR hatalarını (örneğin I yerine 1, O yerine 0 vb.) bağlama göre tespit edip gider.
    3. Okuduğun ve düzelttiğin bilgileri analiz ederek aşağıdaki form alanlarına uygun değerleri eşleştir ve "formData" içine koy.
    
    Form Alanları:
    ${JSON.stringify(formFields)}
    
    Lütfen SADECE JSON formatında yanıt ver, markdown kullanma.
    Format:
    {
      "rawText": "Tıbbi terminolojiye uygun olarak düzeltilmiş OCR metni...",
      "formData": {
        "field_id_1": "değer",
        "field_id_2": "değer"
      }
    }
    `;

    const base64Image = imageData.split(',')[1] || imageData;
    
    const resultText = await generateGeminiContent(
      ai,
      [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: base64Image,
              }
            }
          ]
        }
      ],
      { responseMimeType: 'application/json' }
    );

    res.json(JSON.parse(resultText));
  } catch (error: any) {
    handleGeminiError(error, res);
  }
});

// Gemini Proxy API for Text (Pasted Text / Notes)
app.post('/api/gemini/analyze-text', async (req, res) => {
  try {
    const { textData, formFields } = req.body;
    
    const apiKey = getRequestApiKey(req);
    if (!apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY bulunamadı. Lütfen üst menüdeki "Gemini API Key" butonundan geçerli bir API anahtarı ekleyin.' });
    }

    const ai = createGeminiClient(apiKey);
    
    const prompt = `
    Sen uzman bir tıbbi genetikçi ve onkologsun.
    Sana bir hastanın tıbbi raporundan (patoloji, genetik, laboratuvar sonucu) kopyalanmış (muhtemelen OCR veya manuel kopyalama ile elde edilmiş) bir metin veya not veriliyor.
    Görevlerin:
    1. Verilen metni incele; içindeki olası OCR hatalarını, yanlış yazımları (Türkçe ve İngilizce) tıbbi literatüre ve tıbbi terminolojiye tam uygun olacak şekilde düzelt. Düzeltilmiş metni "rawText" alanına aktar.
    2. Metni analiz ederek aşağıdaki form alanlarına uygun değerleri eşleştir ve "formData" içine koy.
    
    Form Alanları:
    ${JSON.stringify(formFields)}
    
    Kopyalanan Metin:
    ${textData}
    
    Lütfen SADECE JSON formatında yanıt ver, markdown kullanma.
    Format:
    {
      "rawText": "Tıbbi terminolojiye uygun olarak düzeltilmiş metin...",
      "formData": {
        "field_id_1": "değer",
        "field_id_2": "değer"
      }
    }
    `;
    
    const resultText = await generateGeminiContent(
      ai,
      [
        {
          role: 'user',
          parts: [
            { text: prompt }
          ]
        }
      ],
      { responseMimeType: 'application/json' }
    );

    res.json(JSON.parse(resultText));
  } catch (error: any) {
    handleGeminiError(error, res);
  }
});

// Gemini Proxy API for URL Link Extraction (Web page or online report/image)
app.post('/api/gemini/analyze-url', async (req, res) => {
  try {
    const { url, formFields } = req.body;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Geçerli bir URL adresi gereklidir' });
    }

    const apiKey = getRequestApiKey(req);
    if (!apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY bulunamadı. Lütfen üst menüdeki "Gemini API Key" butonundan geçerli bir API anahtarı ekleyin.' });
    }

    // Fetch the URL with custom user-agent
    const fetchResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!fetchResponse.ok) {
      return res.status(400).json({ error: `URL'den veri çekilemedi (HTTP ${fetchResponse.status})` });
    }

    const contentType = fetchResponse.headers.get('content-type') || '';
    const ai = createGeminiClient(apiKey);

    if (contentType.includes('image/')) {
      // URL points to an image
      const arrayBuffer = await fetchResponse.arrayBuffer();
      const base64Image = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = contentType.split(';')[0] || 'image/jpeg';

      const prompt = `
      Sen uzman bir tıbbi genetikçi ve onkologsun.
      Sana bir hastanın tıbbi raporunun (patoloji, genetik, laboratuvar sonucu) URL linkinden çekilen görüntüsü veriliyor.
      Görevlerin:
      1. Görüntüdeki tüm tıbbi metni eksiksiz olarak oku (OCR) ve "rawText" alanına çıkar.
      2. OCR işlemi sırasında oluşabilecek veya görüntünün kendisinde var olan yanlış yazımları (Türkçe ve İngilizce) tıbbi literatüre ve tıbbi terminolojiye tam uygun olacak şekilde düzelt.
      3. Okuduğun ve düzelttiğin bilgileri analiz ederek aşağıdaki form alanlarına uygun değerleri eşleştir ve "formData" içine koy.

      Form Alanları:
      ${JSON.stringify(formFields)}

      Lütfen SADECE JSON formatında yanıt ver, markdown kullanma.
      Format:
      {
        "rawText": "Tıbbi terminolojiye uygun olarak düzeltilmiş OCR metni...",
        "formData": {
          "field_id_1": "değer",
          "field_id_2": "değer"
        }
      }
      `;

      const resultText = await generateGeminiContent(
        ai,
        [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64Image,
                  mimeType: mimeType
                }
              },
              { text: prompt }
            ]
          }
        ],
        { responseMimeType: 'application/json' }
      );

      return res.json(JSON.parse(resultText));
    } else {
      // HTML, JSON, or Plain text page
      const rawHtml = await fetchResponse.text();
      const cleanText = rawHtml
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const prompt = `
      Sen uzman bir tıbbi genetikçi ve onkologsun.
      Sana bir hastanın tıbbi rapor veya laboratuvar sonucunun URL sayfasından çekilmiş web metni veriliyor.
      Görevlerin:
      1. Verilen metni incele; hastaya ait tıbbi bilgileri süz, içindeki olası yazım ve dizgi hatalarını (Türkçe ve İngilizce) tıbbi literatüre ve tıbbi terminolojiye tam uygun olacak şekilde düzelt ve "rawText" alanına aktar.
      2. Metni analiz ederek aşağıdaki form alanlarına uygun değerleri eşleştir ve "formData" içine koy.

      Form Alanları:
      ${JSON.stringify(formFields)}

      Çekilen Web Metni:
      ${cleanText.substring(0, 15000)}

      Lütfen SADECE JSON formatında yanıt ver, markdown kullanma.
      Format:
      {
        "rawText": "Tıbbi terminolojiye uygun olarak düzeltilmiş metin...",
        "formData": {
          "field_id_1": "değer",
          "field_id_2": "değer"
        }
      }
      `;

      const resultText = await generateGeminiContent(
        ai,
        [
          {
            role: 'user',
            parts: [
              { text: prompt }
            ]
          }
        ],
        { responseMimeType: 'application/json' }
      );

      return res.json(JSON.parse(resultText));
    }
  } catch (error: any) {
    handleGeminiError(error, res);
  }
});

// Gemini Proxy API for Natural Language Patient Query & Cohort Analysis Assistant
app.post('/api/gemini/query-assistant', async (req, res) => {
  try {
    const { userQuery, formFields } = req.body;

    if (!userQuery || typeof userQuery !== 'string') {
      return res.status(400).json({ error: 'Sorgu metni gereklidir.' });
    }

    const apiKey = getRequestApiKey(req);
    if (!apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY bulunamadı. Lütfen üst menüdeki "Gemini API Key" butonundan geçerli bir API anahtarı ekleyin.' });
    }

    const ai = createGeminiClient(apiKey);

    const prompt = `
    Sen uzman bir Tıbbi Genetik Onkoloji Veri Analistisin.
    GastroGen Mide Kanseri Araştırma Veritabanı için doktor/araştırmacı tarafından doğal dilde yazılmış sorguyu analiz edeceksin.

    Doktorun Sorgusu: "${userQuery}"

    Mevcut Form Saha Tanımları ve Kimlikleri (fieldId):
    ${JSON.stringify(formFields)}

    Görevlerin:
    1. Doktorun isteğini çözümleyerek, verilere uygulanacak filtre kurallarını ("filters") JSON dizisi olarak oluştur.
    2. Filtre kurallarında "fieldId", "operator", "value" ve "logicalOp" alanlarını kullan.
       - "fieldId": Yukarıdaki listedeki geçerli bir id olmalı (örn: "patient_age", "cdh1_germline", "lauren_classification", "her2_status", "cldn182", "msi_status", "h_pylori", "blood_type", "m_stage", "family_gc", "consanguinity" vb.).
       - "operator": Şu değerlerden biri olmalı: "equals", "not_equals", "contains", "not_contains", "greater_than", "less_than", "is_filled", "is_empty", "in_list".
       - "value": Aranacak değer (metin, sayı veya seçenek metni; örn "Patonejik (Pozitif)", "Diffüz", "50", "Pozitif", "M1").
       - "logicalOp": "AND" veya "OR".
    3. Doktorun sorgusuna tıbbi ve klinik açıdan kısa, net bir uzman açıklaması ("explanation") ve tıbbi genetik değerlendirme notu ("clinicalInsight") ekle.

    Format (SADECE JSON):
    {
      "explanation": "Sorgunuza göre 50 yaş altı ve CDH1 patojenik mutasyon pozitif hastalar filtrelendi.",
      "clinicalInsight": "Mide kanserinde 50 yaş altı tanı ve CDH1 patojenik mutasyonu varlığı Herediter Diffüz Mide Kanseri (HDGC) sendromu için temel klinik kriterdir.",
      "filters": [
        {
          "fieldId": "patient_age",
          "operator": "less_than",
          "value": 50,
          "logicalOp": "AND"
        },
        {
          "fieldId": "cdh1_germline",
          "operator": "equals",
          "value": "Patonejik (Pozitif)",
          "logicalOp": "AND"
        }
      ]
    }
    `;

    const resultText = await generateGeminiContent(
      ai,
      [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      { responseMimeType: 'application/json' }
    );

    res.json(JSON.parse(resultText));
  } catch (error: any) {
    handleGeminiError(error, res);
  }
});

// Helper for extracting text from PDF, Word (.docx), Excel (.xlsx/.xls), CSV, and TXT files
async function extractTextFromDocumentBuffer(buffer: Buffer, fileName: string, mimeType?: string): Promise<string> {
  const lowerName = (fileName || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  // 1. PDF
  if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) {
    try {
      const pdfData = await pdfParse(buffer);
      if (pdfData && pdfData.text && pdfData.text.trim().length > 0) {
        return pdfData.text.trim();
      }
      throw new Error('PDF metni okunamadı veya dosya taranmış resim (OCR gerektiren) PDF olabilir.');
    } catch (err: any) {
      throw new Error(`PDF dosyası okuma hatası: ${err.message || 'Dosya okunamadı'}`);
    }
  }

  // 2. Word (.docx, .doc)
  if (
    lowerName.endsWith('.docx') || 
    lowerName.endsWith('.doc') || 
    lowerMime.includes('word') || 
    lowerMime.includes('officedocument.wordprocessingml') || 
    lowerMime.includes('msword')
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      if (result && result.value && result.value.trim().length > 0) {
        return result.value.trim();
      }
      throw new Error('Word belgesinde okunabilir metin bulunamadı.');
    } catch (err: any) {
      throw new Error(`Word belgesi okuma hatası: ${err.message || 'Dosya okunamadı'}`);
    }
  }

  // 3. Excel (.xlsx, .xls, .csv)
  if (
    lowerName.endsWith('.xlsx') || 
    lowerName.endsWith('.xls') || 
    lowerName.endsWith('.csv') || 
    lowerMime.includes('excel') || 
    lowerMime.includes('spreadsheet') || 
    lowerMime.includes('csv')
  ) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let fullText = '';
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) {
          fullText += `--- Sayfa: ${sheetName} ---\n${csv}\n\n`;
        }
      }
      if (fullText.trim().length > 0) {
        return fullText.trim();
      }
      throw new Error('Excel dosyasında veri satırı bulunamadı.');
    } catch (err: any) {
      throw new Error(`Excel okuma hatası: ${err.message || 'Dosya okunamadı'}`);
    }
  }

  // 4. Plain Text / TXT
  if (lowerName.endsWith('.txt') || lowerMime.includes('text/plain')) {
    return buffer.toString('utf-8');
  }

  // Fallback try utf-8
  const textAttempt = buffer.toString('utf-8');
  if (textAttempt && !textAttempt.includes('\uFFFD') && textAttempt.trim().length > 0) {
    return textAttempt.trim();
  }

  throw new Error('Desteklenmeyen dosya formatı. Lütfen PDF, Word (.docx), Excel (.xlsx/.xls) veya metin dosyası yükleyin.');
}

// Gemini Proxy API for Document Extraction (PDF, Word, Excel, CSV, TXT)
app.post('/api/gemini/analyze-document', async (req, res) => {
  try {
    const { fileData, fileName, mimeType, formFields } = req.body;
    
    if (!fileData || typeof fileData !== 'string') {
      return res.status(400).json({ error: 'Dosya verisi (base64) gereklidir.' });
    }

    const apiKey = getRequestApiKey(req);
    if (!apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY bulunamadı. Lütfen üst menüdeki "Gemini API Key" butonundan geçerli bir API anahtarı ekleyin.' });
    }

    // Extract base64 buffer
    const base64Content = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buffer = Buffer.from(base64Content, 'base64');

    // Extract text from document
    const documentText = await extractTextFromDocumentBuffer(buffer, fileName || 'dosya', mimeType);

    const ai = createGeminiClient(apiKey);

    const prompt = `
    Sen uzman bir tıbbi genetikçi ve onkologsun.
    Sana tıbbi belgelerden (PDF, Word, Excel veya Metin dosyası: ${fileName || 'Belge'}) çıkarılan metin/veri içeriği veriliyor.
    Bu belge TEK BİR hastaya ait olabileceği gibi ÇOK SAYIDA hastanın kayıtlarını içeren bir Excel/CSV/Tablo da olabilir.

    Görevlerin:
    1. Belge içeriğini incele. Eğer birden fazla hastanın verisi varsa, hastaları birbirinden ayır.
    2. Her hasta için: tıbbi bilgileri, tahlil/laboratuvar/patoloji/genetik sonuçlarını ve klinik notları süz.
    3. İçindeki olası imla, yazım veya dizgi hatalarını (Türkçe ve İngilizce) tıbbi literatüre uygun şekilde düzeltip "rawText" alanına aktar.
    4. Metni analiz ederek aşağıdaki form alanlarına uygun değerleri eşleştir ve "formData" içine koy.
    5. Tüm hastaları "patients" dizisi (array) içerisinde döndür. Sadece bir hasta varsa, dizide tek bir eleman olsun.

    Form Alanları:
    ${JSON.stringify(formFields)}

    Çıkarılan Belge İçeriği:
    ${documentText.substring(0, 20000)}

    Lütfen SADECE JSON formatında yanıt ver, markdown kullanma.
    Format:
    {
      "patients": [
        {
          "rawText": "Tıbbi terminolojiye uygun olarak düzeltilmiş hasta belge metni...",
          "formData": {
            "field_id_1": "değer",
            "field_id_2": "değer"
          }
        }
      ]
    }
    `;

    const resultText = await generateGeminiContent(
      ai,
      [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      { responseMimeType: 'application/json' }
    );

    res.json(JSON.parse(resultText));
  } catch (error: any) {
    handleGeminiError(error, res);
  }
});

async function startServer() {
  // For development, we'll use Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files
    const clientPath = path.join(process.cwd(), 'dist/client');
    app.use(express.static(clientPath));
    
    // SPA fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
