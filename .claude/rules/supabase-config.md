# Supabase Project Configuration

## Project Info

| Campo | Valor |
|-------|-------|
| **Project Ref** | `mkjyzhvvtnvkhngszehr` |
| **Project URL** | `https://mkjyzhvvtnvkhngszehr.supabase.co` |
| **Region** | `aws-0-us-west-2` |
| **Org** | `matheusjulio.ti@gmail.com's Org` |
| **Branch** | `main (PRODUCTION)` |

## Credenciais (via .env)

> ⚠️ NUNCA exponha estas chaves no frontend. Use variáveis de ambiente.

| Variável | Uso |
|----------|-----|
| `SUPABASE_URL` | URL base do projeto |
| `SUPABASE_ANON_KEY` | Chave pública para client-side (com RLS ativo) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave privada — apenas server-side/backend |
| `SUPABASE_PUBLISHABLE_KEY` | Nova API key pública (substitui anon em novos projetos) |
| `SUPABASE_SECRET_KEY` | Nova API key secreta (substitui service_role em novos projetos) |
| `DATABASE_URL` | Connection string PostgreSQL (Transaction Pooler) |

## Conexão ao Banco (Transaction Pooler)

```
Host:     aws-0-us-west-2.pooler.supabase.com
Port:     6543
Database: postgres
User:     postgres.mkjyzhvvtnvkhngszehr
Mode:     Transaction Pooler (ideal para serverless/edge functions)
```

Connection string completa (substituir `[YOUR-PASSWORD]` pela senha do banco):
```
postgresql://postgres.mkjyzhvvtnvkhngszehr:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres
```

## Agentes Responsáveis

| Agente | Responsabilidade Supabase |
|--------|--------------------------|
| `@data-engineer` (Dara) | Schema, migrations, queries, RLS policies |
| `@architect` (Aria) | Decisões de arquitetura do banco, edge vs direct |
| `@devops` (Gage) | Configuração de MCP Supabase, env vars no CI/CD |
| `@dev` (Dex) | Integração do Supabase client no código da aplicação |

## Como usar o Supabase Client

### JavaScript/TypeScript
```typescript
import { createClient } from '@supabase/supabase-js'

// Client-side (com RLS)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

// Server-side (bypass RLS — usar com cuidado)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

### Instalar dependência
```bash
npm install @supabase/supabase-js
```

## Regras de Segurança

- `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` → pode ir no frontend **somente** com RLS habilitado em todas as tabelas
- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` → **nunca** no frontend, apenas em server actions, API routes ou funções backend
- `DATABASE_URL` → apenas em contextos server-side (ORM, migrations)
