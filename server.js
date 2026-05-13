require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Servir o frontend estático (index.html na mesma pasta)
app.use(express.static(path.join(__dirname)));

// ─── OpenAI client (chave nunca vai ao frontend) ───────────────────────────────
if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-proj-sua')) {
  console.log('OpenAI API Key carregada com sucesso');
} else {
  console.warn('[AVISO] OPENAI_API_KEY não configurada ou inválida. Verifique o arquivo .env.');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ─── Rate-limit simples por IP (evita múltiplas chamadas simultâneas) ──────────
const inFlight = new Map(); // ip → timestamp da última chamada
const COOLDOWN_MS = 10_000; // 10 segundos entre chamadas por IP

// ─── POST /api/ai-analysis ────────────────────────────────────────────────────
app.post('/api/ai-analysis', async (req, res) => {
  const ip = req.ip || 'unknown';

  // Bloqueia chamadas em andamento do mesmo IP
  const last = inFlight.get(ip);
  if (last && Date.now() - last < COOLDOWN_MS) {
    return res.status(429).json({ error: 'Aguarde alguns segundos antes de gerar uma nova análise.' });
  }
  inFlight.set(ip, Date.now());

  try {
    const {
      periodo,
      investimento,
      cliques,
      impressoes,
      ctr,
      cpc,
      leads,
      cpl,
      mensagens,
      custo_mensagem,
      compras,
      custo_compra,
      campanhas = [],
      filtro_cliente,
    } = req.body;

    // Validação mínima
    if (investimento == null) {
      inFlight.delete(ip);
      return res.status(400).json({ error: 'Payload inválido: campo "investimento" é obrigatório.' });
    }

    // Formata os dados das campanhas para o prompt
    const campStr = campanhas.length > 0
      ? campanhas.slice(0, 15).map((c, i) =>
          `${i + 1}. ${c.name} | Invest: R$${(c.spend || 0).toFixed(2)} | Leads: ${c.leads || 0} | CPL: ${c.leads > 0 ? 'R$' + (c.spend / c.leads).toFixed(2) : '—'} | Msgs WA: ${c.msgs || 0} | Compras: ${c.purchases || 0} | Custo/Compra: ${c.purchases > 0 ? 'R$' + (c.spend / c.purchases).toFixed(2) : '—'} | Cliques: ${c.clicks || 0} | CTR: ${((c.ctr || 0)).toFixed(2)}%`
        ).join('\n')
      : 'Sem dados de campanhas detalhados.';

    const prompt = `
Você é um especialista em marketing digital da agência AB Tracking. Analise os dados abaixo e gere um relatório executivo em português brasileiro.

## DADOS DO PERÍODO: ${periodo || 'Período selecionado'}
${filtro_cliente && filtro_cliente !== '__all__' ? `Cliente: ${filtro_cliente}` : 'Todos os clientes'}

### MÉTRICAS GERAIS
- Investimento Total: R$ ${Number(investimento).toFixed(2)}
- Cliques: ${Number(cliques || 0).toLocaleString('pt-BR')}
- Impressões: ${Number(impressoes || 0).toLocaleString('pt-BR')}
- CTR: ${Number(ctr || 0).toFixed(2)}%
- CPC Médio: R$ ${Number(cpc || 0).toFixed(2)}

### RESULTADOS META ADS
- Leads: ${Number(leads || 0)}
- CPL (Custo por Lead): ${leads > 0 ? 'R$ ' + Number(cpl).toFixed(2) : '—'}
- Mensagens WhatsApp: ${Number(mensagens || 0)}
- Custo por Mensagem: ${mensagens > 0 ? 'R$ ' + Number(custo_mensagem).toFixed(2) : '—'}
- Compras: ${Number(compras || 0)}
- Custo por Compra: ${compras > 0 ? 'R$ ' + Number(custo_compra).toFixed(2) : '—'}

### TOP CAMPANHAS
${campStr}

---

Gere um relatório com EXATAMENTE estas 5 seções, usando os títulos em negrito abaixo:

**📊 Resumo Executivo**
(2-3 frases com a visão geral da performance do período)

**✅ Pontos Positivos**
(lista com 3-5 bullets de destaques reais baseados nos dados)

**⚠️ Pontos de Atenção**
(lista com 2-4 bullets de alertas ou métricas fora do ideal)

**🎯 Oportunidades de Otimização**
(lista com 3-5 ações concretas e priorizadas)

**📱 Mensagem WhatsApp (AB Tracking)**
(texto pronto para enviar ao cliente via WhatsApp, tom profissional mas direto, máximo 200 palavras, com emojis estratégicos, assinado por "Equipe AB Tracking")

Seja objetivo, use os números reais dos dados fornecidos e não invente métricas.
`.trim();

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1200,
      temperature: 0.7,
    });

    const text = completion.choices[0]?.message?.content || '';

    res.json({
      success: true,
      model: MODEL,
      analysis: text,
      tokens: completion.usage,
    });

  } catch (err) {
    console.error('[/api/ai-analysis] Erro:', err.message);

    // Erros específicos da OpenAI
    if (err?.status === 401) {
      return res.status(401).json({ error: 'API Key da OpenAI inválida ou expirada. Verifique o arquivo .env.' });
    }
    if (err?.status === 429) {
      return res.status(429).json({ error: 'Limite de requisições da OpenAI atingido. Tente novamente em alguns segundos.' });
    }
    if (err?.status === 402) {
      return res.status(402).json({ error: 'Créditos da OpenAI esgotados. Verifique sua conta em platform.openai.com.' });
    }

    res.status(500).json({ error: 'Erro interno ao gerar análise. Tente novamente.' });
  } finally {
    // Libera o rate-limit após o processamento
    setTimeout(() => inFlight.delete(ip), COOLDOWN_MS);
  }
});

// ─── AI Search Terms Analysis ───────────────────────────────────────────────
app.post('/api/ai-search-terms', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (inFlight.has(ip)) {
    return res.status(429).json({ error: 'Uma análise já está sendo processada. Aguarde alguns segundos.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Configuração ausente: OPENAI_API_KEY não definida no servidor.' });
  }

  try {
    inFlight.set(ip, Date.now());
    const { terms } = req.body;
    if (!terms || !Array.isArray(terms)) {
      return res.status(400).json({ error: 'Dados dos termos ausentes ou inválidos.' });
    }

    const dataString = terms.map(t => 
      `Termo: ${t.st} | Cliques: ${t.clicks} | Conversões: ${t.conv} | Custo: R$ ${t.spend.toFixed(2)} | CPA: ${t.conv > 0 ? (t.spend/t.conv).toFixed(2) : 'N/A'}`
    ).join('\n');

    const prompt = `
Você é um Especialista Sênior em Google Ads da AB Tracking, com foco em performance, geração de leads qualificados e otimização de campanhas.
Sua função é analisar os termos de pesquisa do Google Ads e classificar cada termo de forma estratégica, ajudando na tomada de decisão.

📌 CONTEXTO DO CLIENTE (AB TRACKING)
Segmento do cliente: Performance e Geração de Leads
Produto/serviço principal: Marketing de Performance / CRM
Objetivo da campanha: Lead, venda, WhatsApp.
Prioridade: QUALIDADE do lead, não volume.

📊 DADOS DE ENTRADA
${dataString}

🎯 SUA TAREFA
Para cada termo de pesquisa, classifique em:
✅ POSITIVAR (manter e escalar) - Alta intenção de compra, alinhado com o serviço.
❌ NEGATIVAR - Baixa intenção, público errado, irrelevante (DIY, grátis, barato), fora da região.
⚠️ NEUTRO / TESTAR - Sem dados suficientes ou potencial a validar.

🧠 REGRAS IMPORTANTES
NÃO baseie a decisão apenas em “não teve conversão”.
Considere intenção de busca acima de tudo.
Evite negativar termos com potencial só por falta de conversão.

📌 FORMATO DE RESPOSTA
Responda APENAS em uma tabela Markdown com as colunas: Termo | Classificação | Motivo | Ação recomendada.

Ao final, traga:
🔥 Insights estratégicos:
- Padrões de termos ruins
- Oportunidades de novos grupos
- Sugestões de palavras-chave novas
- Sugestões de negativas em massa
`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.5,
    });

    res.json({
      success: true,
      analysis: completion.choices[0]?.message?.content || '',
    });

  } catch (err) {
    console.error('[/api/ai-search-terms] Erro:', err.message);
    res.status(500).json({ error: 'Erro ao gerar análise de termos.' });
  } finally {
    setTimeout(() => inFlight.delete(ip), COOLDOWN_MS);
  }
});

// ─── AI Search Terms Export (Excel/CSV 2 Tabs) ──────────────────────────────
app.post('/api/ai-export-st', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (inFlight.has(ip)) {
    return res.status(429).json({ error: 'Uma operação já está em andamento. Aguarde.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Configuração ausente: OPENAI_API_KEY não definida.' });
  }

  try {
    inFlight.set(ip, Date.now());
    const { analysis_text } = req.body;
    
    if (!analysis_text) {
      return res.status(400).json({ error: 'Texto da análise original ausente.' });
    }

    const prompt = `
Você é um Especialista em Google Ads da AB Tracking.

Sua função é transformar a análise de termos de pesquisa em uma planilha estruturada com duas abas, separando termos positivos e negativos para uso estratégico.

📊 DADOS DE ENTRADA

Você receberá uma tabela com:

Termo
Classificação (Positivar, Negativar, Neutro/Testar)
Motivo
Ação recomendada

Abaixo está a análise original:
---
${analysis_text}
---

🎯 SUA MISSÃO

Gerar uma saída em formato Excel (simulado via CSV separado por abas) contendo:

📄 ABA 1 – POSITIVOS
Nome da aba:
POSITIVOS
Colunas:
Termo,Classificação,Motivo,Ação recomendada
Regras:
Incluir apenas termos classificados como POSITIVAR
Manter estrutura limpa
Termos em minúsculo

📄 ABA 2 – NEGATIVOS
Nome da aba:
NEGATIVOS
Colunas:
Palavra-chave negativa
Regras:
Incluir apenas termos classificados como NEGATIVAR
Apenas o termo (sem outras colunas)
Ideal para upload no Google Ads

⚠️ REGRAS GERAIS
NÃO usar markdown
NÃO explicar nada
NÃO adicionar texto extra
Apenas os blocos das duas abas
Separar claramente as abas com título

📤 FORMATO FINAL
POSITIVOS:
(conteúdo CSV)

NEGATIVOS:
(conteúdo CSV)

💣 DIFERENCIAL
Ignorar termos neutros
Priorizar clareza operacional
Saída pronta para copiar e colar no Excel
`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.2,
    });

    res.json({
      success: true,
      csv_data: completion.choices[0]?.message?.content || '',
    });

  } catch (err) {
    console.error('[/api/ai-export-st] Erro:', err.message);
    res.status(500).json({ error: 'Erro ao gerar planilha.' });
  } finally {
    setTimeout(() => inFlight.delete(ip), COOLDOWN_MS);
  }
});

// ─── Windsor Proxy & Cache ───────────────────────────────────────────────────
const windsorCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos de cache

app.get('/api/windsor', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    console.log(`[GET] /api/windsor | From: ${date_from} | To: ${date_to}`);
    if (!date_from || !date_to) return res.status(400).json({ error: 'date_from and date_to required' });
    
    const cacheKey = `${date_from}_${date_to}`;
    const cached = windsorCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return res.json(cached.data);
    }
    
    const WINDSOR_KEY = process.env.WINDSOR_API_KEY || 'd9f7d79cb45782770ad6eae3607377e0509a';
    const WINDSOR_BASE = `https://connectors.windsor.ai/all?api_key=${WINDSOR_KEY}&fields=account_name,campaign,ad_name,date,clicks,datasource,source,spend,roas,conversions,purchases,leads,all_conversions,conversions_value,complete_registration,registrations,add_to_cart,cost_per_conversion,cost,keyword,search_term,impressions,reach,results,cost_per_result,actions_total,action_values_total,actions_lead,actions_offsite_conversion_fb_pixel_lead,actions_onsite_conversion_messaging_conversation_started_7d,actions_offsite_conversion_fb_pixel_purchase,cost_per_action_type_lead,cost_per_action_type_offsite_conversion_fb_pixel_lead,cost_per_action_type_onsite_conversion_messaging_conversation_started_7d,cost_per_action_type_offsite_conversion_fb_pixel_purchase`;
    
    const response = await fetch(`${WINDSOR_BASE}&date_from=${date_from}&date_to=${date_to}`);
    if (!response.ok) throw new Error(`Windsor API status: ${response.status}`);
    
    const data = await response.json();
    windsorCache.set(cacheKey, { timestamp: Date.now(), data });
    
    res.json(data);
  } catch (err) {
    console.error('[/api/windsor] Erro:', err.message);
    res.status(500).json({ error: 'Erro ao buscar dados da Windsor.ai' });
  }
});

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: MODEL,
    apiKeyConfigured: !!(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-proj-sua')),
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 AB Tracking Dashboard Backend rodando em http://localhost:${PORT}`);
  console.log(`   Frontend: http://localhost:${PORT}/index.html`);
  console.log(`   Health:   http://localhost:${PORT}/api/health`);
  console.log(`   Modelo:   ${MODEL}\n`);
});
