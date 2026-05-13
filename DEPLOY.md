# Deploy no Railway

## Passos rápidos:

1. Acesse [railway.app](https://railway.app)
2. Faça login com GitHub
3. Clique em "New Project"
4. Selecione "Deploy from GitHub repo"
5. Selecione o repositório `brunoaguillerab-bit/ab-marketing-dashboard`
6. Configure as variáveis de ambiente:
   - `OPENAI_API_KEY`: Sua chave da OpenAI
   - `OPENAI_MODEL`: gpt-4o-mini (padrão)
   - `PORT`: 3000 (padrão)
   - `WINDSOR_API_KEY`: Sua chave do Windsor.ai

7. Clique em "Deploy"

## Obter a URL pública:

Após deploy, vá para "Settings" → "Public URL" e copie a URL.

Exemplo: `https://seu-projeto-railway.railway.app`

## Atualizar no operations-dashboard:

Alterar a URL em `src/app/*/page.tsx`:
```
<EmbedFrame
  baseUrl="https://seu-projeto-railway.railway.app"
  hash="..."
/>
```

## Variables necessárias:

- `OPENAI_API_KEY`: sk-proj-... (obrigatório para IA)
- `WINDSOR_API_KEY`: Sua chave (obrigatório para dados)
