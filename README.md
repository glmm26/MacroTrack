# MacroTrack

Aplicacao web completa para calculo nutricional pessoal com foco em usuarios de academia. O sistema consulta dados reais da FatSecret Platform API, calcula calorias/macronutrientes, acompanha totais diarios, exibe grafico com Chart.js e salva historico por data no `localStorage`.

## Funcionalidades

- Busca de alimentos com API externa via backend seguro
- Adicao de alimentos por texto livre, como `100g frango`, `1 ovo` e `200g batata doce`
- Lista de alimentos com calorias, proteinas, carboidratos e gorduras
- Totais diarios atualizados automaticamente
- Meta diaria de calorias com barra de progresso
- Grafico de pizza com distribuicao de macronutrientes
- Persistencia local por data usando `localStorage`
- Historico diario clicavel
- Loading e tratamento de erros

## Tecnologias

- Frontend: HTML5, CSS3, JavaScript puro
- Backend: Node.js + Express
- API externa: FatSecret Platform API
- Graficos: Chart.js

## Estrutura

```text
/frontend
  index.html
  style.css
  script.js

/backend
  server.js

.env
.env.example
package.json
README.md
```

## Como rodar

1. Instale as dependencias:

```bash
npm install
```

2. Configure suas credenciais da FatSecret:

```env
FATSECRET_CLIENT_ID=seu_client_id_aqui
FATSECRET_CLIENT_SECRET=seu_client_secret_aqui
FATSECRET_SCOPE=basic
PORT=3000
```

Voce pode copiar o modelo de `.env.example` para `.env`.

Importante: a documentacao oficial da FatSecret informa que o token OAuth 2.0 deve ser solicitado por um servidor/proxy com IP autorizado no painel da aplicacao. Em ambiente local, confira se seu IP publico ou intervalo permitido esta configurado na conta da plataforma.

3. Inicie o projeto:

```bash
npm start
```

4. Acesse:

```text
http://localhost:3000
```

## Endpoint interno

O frontend nunca expoe as credenciais. A consulta passa pela rota:

```text
GET /api/nutrition?food=200g%20frango
```

Essa rota recebe o alimento, solicita um token OAuth 2.0 da FatSecret no backend, faz a busca do alimento, consulta os dados detalhados da porcao e devolve os dados tratados para a interface.

## Fluxo de uso

1. Escolha a data desejada.
2. Digite um alimento como `200g arroz`.
3. Clique em `Adicionar`.
4. Veja a lista, os totais do dia, o progresso da meta e o grafico.
5. Navegue pelo historico de dias ja registrados.

## Testes sugeridos

Teste com exemplos como:

- `100g frango`
- `1 ovo`
- `200g batata doce`

## Observacoes

- Sem credenciais validas da FatSecret, a rota backend retorna erro informando a configuracao ausente.
- Para consultas em portugues como `frango`, `ovo`, `arroz` e `batata doce`, o backend aplica uma traducao simples antes da busca para melhorar o match com a base da FatSecret.
- Os registros sao persistidos no navegador por data via `localStorage`.
- O visual foi pensado para portfolio, com interface fitness moderna e responsiva.

## Prints do sistema

Depois de rodar localmente, adicione capturas de tela nesta secao para enriquecer o portfolio.
