---
name: CapitalFlow
description: Registro do sistema visual existente de gestão financeira e de crédito.
colors:
  capital: "#0B3B6F"
  flow: "#22A06B"
  flow-soft: "#86EFAC"
  action: "oklch(54.6% 0.245 262.881)"
  action-hover: "oklch(48.8% 0.243 264.376)"
  action-bright: "oklch(62.3% 0.214 259.815)"
  action-focus: "oklch(70.7% 0.165 254.624)"
  success: "oklch(69.6% 0.17 162.48)"
  success-text: "oklch(76.5% 0.177 163.223)"
  warning: "oklch(76.9% 0.188 70.08)"
  danger: "oklch(64.5% 0.246 16.439)"
  danger-text: "oklch(71.2% 0.194 13.428)"
  cyan: "oklch(78.9% 0.154 211.53)"
  canvas: "oklch(12.9% 0.042 264.695)"
  surface: "oklch(20.8% 0.042 265.755)"
  surface-raised: "oklch(27.9% 0.041 260.031)"
  border-strong: "oklch(37.2% 0.044 257.287)"
  text-muted: "oklch(55.4% 0.046 257.417)"
  text-secondary: "oklch(70.4% 0.04 256.788)"
  text-soft: "oklch(86.9% 0.022 252.894)"
  text: "oklch(98.4% 0.003 247.858)"
  white: "#fff"
typography:
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  page-title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 900
    lineHeight: 1.25
    letterSpacing: "0.04em"
  page-subtitle:
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: "1rem"
    letterSpacing: "0.12em"
  card-title:
    fontSize: "0.875rem"
    fontWeight: 900
    letterSpacing: "0em"
  stat-value:
    fontSize: "1.75rem"
    fontWeight: 900
    letterSpacing: "0em"
  button-label:
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: "1rem"
  status-label:
    fontSize: "10px"
    fontWeight: 900
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
spacing:
  half: "2px"
  unit: "4px"
  compact-gap: "6px"
  small: "8px"
  compact-card-mobile: "10px"
  compact-card: "12px"
  regular: "16px"
  stat-card: "20px"
  roomy: "24px"
  wide: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.white}"
    typography: "{typography.button-label}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.white}"
    typography: "{typography.button-label}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.border-strong}"
  modal-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.white}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  modal-primary-hover:
    backgroundColor: "{colors.action-bright}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  login-field:
    rounded: "{rounded.lg}"
    padding: "8px"
  status-chip:
    backgroundColor: "oklch(12.9% 0.042 264.695 / 50%)"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  mobile-nav-item:
    rounded: "{rounded.lg}"
    padding: "8px"
---

# Design System: CapitalFlow

## Overview

Registro descritivo da implementação existente, extraído do código em 28/10/2026. A referência é o painel financeiro atual: superfícies escuras, cartões compactos, valores em destaque e ações delimitadas por cor e forma. Os nomes neste documento identificam papéis existentes; não estabelecem uma nova direção estética.

A interface combina Inter, títulos frequentemente em caixa alta e pesos fortes, bordas discretas e acentos cromáticos por ação, módulo ou estado. A marca utiliza Capital azul e Flow verde; as ações principais continuam predominantemente azuis. A clareza dos valores e o uso no celular são prioridades confirmadas em `PRODUCT.md`.

A extração foi feita em `index.css`, `index.html`, `brand.css`, `components/ui/`, `components/StatCard.tsx`, `components/cards/ClientGroupCard.tsx`, `features/auth/AuthScreen.tsx`, `layout/` e nas páginas de clientes e extrato. Os valores Tailwind vêm de `node_modules/tailwindcss/theme.css`, da versão instalada. O servidor local iniciou, mas o acesso ao navegador falhou; não houve inspeção renderizada ou amostragem de estilos computados. Este documento não certifica responsividade, contraste ou acessibilidade.

**Key Characteristics:**

- Fundo escuro com superfícies em camadas de ardósia.
- Marca azul e verde; ações principais azuis.
- Valores fortes, rótulos compactos e títulos em caixa alta.
- Cartões com borda e cantos suavemente arredondados.
- Navegação e modais com comportamento próprio para celular.

## Colors

O frontmatter mantém as cores hexadecimais da marca e os valores OKLCH normativos do Tailwind, sem convertê-los em uma segunda paleta. As opacidades são variações contextuais do mesmo papel.

### Primary

- **Azul de ação** (`action`, Tailwind `blue-600`): botões principais e seleção. O botão compartilhado escurece para `action-hover`; login e ações primárias de modal clareiam para `action-bright` no hover.
- **Azul Capital** (`capital`, variável `--cf-capital`): base da marca, aplicada ao invólucro do logotipo por `brand.css`.
- **Azul de foco** (`action-focus`, `blue-400`): destaque de foco nas ações compartilhadas de modal e acentos selecionados.

### Secondary

- **Verde Flow** (`flow`, variável `--cf-flow`) e **Verde Flow suave** (`flow-soft`, `--cf-flow-soft`): assinatura e efeitos da marca. Não substituem automaticamente os verdes de estado.
- **Ciano** (`cyan`): identificação de módulos e detalhes do cabeçalho dos modais. Outros módulos usam acentos localizados, como fúcsia na Carteira e amarelo no Jurídico; isso não transforma tais acentos em cores globais de ação.

### Tertiary

- **Esmeralda de sucesso** (`success`, `success-text`): situações positivas, quitação e feedback de sucesso.
- **Âmbar de atenção** (`warning`): pendências e alertas.
- **Rosa de risco** (`danger`, `danger-text`): atraso crítico, erro e ações destrutivas, conforme o contexto. Não presumir que todo uso indica exatamente o mesmo estado de negócio.

### Neutral

- **Ardósia de fundo** (`canvas`, `slate-950`): página e áreas rebaixadas. `index.html` também declara o fundo literal `#020617`; é um fallback existente, não uma substituição dos tokens OKLCH.
- **Ardósia de superfície** (`surface`, `slate-900`): cartões e painéis.
- **Ardósia elevada** (`surface-raised`, `slate-800`): controles secundários e bordas comuns.
- **Borda forte** (`border-strong`, `slate-700`): campos e separação de controles.
- **Texto** (`text`, `white`): conteúdo principal; **texto suave**, **secundário** e **atenuado** acompanham a hierarquia de metadados e legendas.

**The Contextual Color Rule.** Manter a distinção entre marca, ação, módulo e estado financeiro; reutilizar a cor do contexto existente com seu texto ou ícone de apoio.

## Typography

**Família principal:** Inter, com fallbacks de sistema. `index.html` solicita Inter nos pesos 300 a 700; o código também pede 900 em diversos títulos e valores. A disponibilidade de um arquivo real de peso 900 não foi verificada, portanto não presumir que todos os pesos sejam carregados.

O corpo herda a base do Tailwind, mas as telas operacionais usam frequentemente textos menores. Não há escala modular própria comprovada nem uma fonte de display separada. Os tokens registram papéis encontrados, não uma normalização de todos os tamanhos locais.

- **Título de página:** utilitário `page-header-title`, peso 900 e espaçamento de letras próprio; caixa alta em `PageHeader`.
- **Subtítulo de página:** `page-header-subtitle`, peso 700, caixa alta e espaçamento mais aberto; margem superior de um quarto de rem.
- **Título de cartão:** `card-title`, peso 900 e caixa alta. Componentes podem acrescentar tracking local, como `StatCard`.
- **Valor de indicador:** `stat-value`, peso 900; a variante compacta de `StatCard` usa `text-base`. O saldo do cartão de cliente usa `text-lg` e passa a `text-xl` em `sm`.
- **Nome de cliente:** utilitário de 1rem, linha 1.2 e truncamento; nome de contrato usa 0.875rem.
- **Rótulos:** o botão compartilhado usa peso 700; ações de modal e muitos status usam 900. Há rótulos locais de 7 a 10px em cartões e navegação. Essa densidade é uma observação, não uma recomendação de tamanho mínimo acessível.

O corpo habilita os recursos tipográficos `cv02`, `cv03`, `cv04` e `cv11`. Não há evidência de uma regra global de algarismos tabulares.

## Layout

O shell ocupa a altura da janela e mantém rolagem vertical na área principal. O conteúdo tem largura máxima de 1920px, centralizado; margens internas horizontais de 8px, 24px em `sm` e 32px em `lg`. O espaçamento vertical passa de 16px para 32px em `sm`. A área principal reserva espaço inferior para a navegação móvel.

Os breakpoints padrão instalados são `sm` 40rem, `md` 48rem, `lg` 64rem, `xl` 80rem e `2xl` 96rem. Existem media queries locais em pixels; não tratá-las como equivalentes universais aos breakpoints.

- **Clientes:** grade de uma coluna, duas em `sm`, três em `lg` e quatro em `xl`, com intervalo de 16px. Os cartões de cadastro dessa página têm altura local de 145px.
- **Cabeçalhos:** ícone circular de 48px, título e ações em grade. `PageHeader` aceita `actionsInline` e `stackActionsUntilLg`; Clientes empilha ações até `lg`, enquanto o Extrato conserva ações inline.
- **Cartões responsivos:** padding de 12px, reduzido para 10px na media query de largura máxima de 768px. `Card` básico não estabelece padding; o consumidor o fornece.
- **Celular:** `BottomNav` aparece abaixo de `md`, fixa no rodapé, com rolagem horizontal interna e itens de largura mínima de 64px. Essa rolagem deliberada da navegação não é uma regra para o conteúdo da página.
- **Extrato móvel:** `index.css` aplica uma composição local até 640px, com faixas de acento, fundo em gradiente, margens próprias e raio de 0.85rem. Não generalizar essa exceção para todos os cartões.
- **Safe areas:** o HTML e utilitários específicos acomodam `env(safe-area-inset-*)`.

Os espaçamentos recorrentes estão no frontmatter; o projeto também possui valores locais. Não existe evidência de que todos os componentes sigam uma grade rígida única.

## Elevation & Depth

A profundidade combina camadas tonais, bordas, sombras, transparência e blur. O cartão básico é plano, com borda; cartões de indicadores acrescentam brilhos suaves, e o estado expandido do cartão de cliente recebe anel e sombra próprios. Modais e alertas usam uma separação mais pronunciada do fundo.

Vocabulário observado, preservado em `.impeccable/design.json`:

- **Sombra grande:** token Tailwind `shadow-lg`, usado em controles e ícones.
- **Sombra de sobreposição:** `shadow-2xl`, presente no modal compartilhado e no painel de login.
- **Hover de cartão responsivo:** brilho lateral azul e sombra inferior; a regra global só se aplica a mouse com ponteiro preciso e desloca o cartão 4px horizontalmente.
- **Cliente expandido:** anel azul e sombra ampla, sem alterar a largura do cartão.
- **Fundos de sobreposição:** modal com ardósia a 85% e blur; navegação móvel com ardósia a 90% e blur mais intenso.

A escala global de camadas em `index.css` é: base 0, cabeçalho 100, navegação 200, FAB 500, drawer 1000, modal 2000, suporte 2500, toast 3000 e loading 9999. Existem números locais adicionais; a escala não descreve todos os overlays.

Movimento existente: transições de cor do Tailwind, entradas e expansões com Framer Motion, revelações de cartões e pulsos de alerta. A splash tem animação de convergência da marca e alternativa para movimento reduzido em `brand.css`. Essa cobertura não foi verificada globalmente; não inferir conformidade de todas as animações.

## Shapes

O raio predominante de cartões e botões é `lg`; controles menores usam `md` e `sm`. Ícones de modal usam `xl`, e o painel de modal recebe `2xl` a partir de `sm`. No celular, esse painel não recebe o arredondamento aplicado em telas maiores. Círculos e cápsulas aparecem em avatares, ícones de cabeçalho e controles de fechar.

Bordas comuns têm 1px e pouco contraste em ardósia; estados acrescentam cor. Alguns cartões financeiros usam borda lateral de 4px. O recorte por overflow é frequente nos cartões, mas nomes, valores e ações têm regras próprias de truncamento ou quebra: preservar o comportamento do componente-alvo.

## Components

### Buttons

`components/ui/Button.tsx` define duas apresentações: primária azul e secundária em ardósia para qualquer `variant` diferente de `primary`. Ambas têm caixa alta, peso 700, raio `lg` e transição de cores. O componente aceita classes adicionais; não é autoridade única para todos os botões da aplicação.

As constantes de ação em `components/ui/Modal.tsx` formam outro padrão: altura mínima de 44px, largura total, peso 900 na primária, foco visível com outline azul e opacidade reduzida quando desabilitadas. O hover da primária clareia; o do botão básico escurece. Documentar os dois sem unificá-los.

### Cards / Containers

`components/ui/Card.tsx` fornece superfície, borda e raio, sem padding. `StatCard` acrescenta barra lateral de cor, ícone, valor forte, brilho e padding de 20px ou 12px na variante compacta. O cartão de grupo de cliente combina nome, status, dívida e detalhes expansíveis; não substituir esse padrão por um cartão genérico que omita seus estados.

### Inputs / Fields

Não há um Input global em `components/ui/`. O login usa wrapper em ardósia com 50% de opacidade, borda, ícone e mudança de borda em `focus-within`; o input interno é transparente. Outros formulários usam campos com fundo `slate-900`, borda `slate-700` e foco azul.

`index.html` força campos a 16px até 640px, mas também contém overrides específicos do Simulador, com maior especificidade e outros tamanhos. Não afirmar que todos os campos móveis compartilham tamanho ou altura. Erro, loading e disabled são definidos nos fluxos locais, não por um único componente de campo.

### Chips / Status

Rótulos compactos, frequentemente em caixa alta, combinam texto, borda e fundo translúcido. O status do cliente pode usar borda na cor atual e fundo escuro; indicadores de contrato possuem variantes próprias em azul, âmbar e rosa. `InstallmentCardStatus` é texto colorido, sem cápsula obrigatória.

### Navigation

`HeaderBar` atende a navegação superior e alertas; `BottomNav` cuida do rodapé móvel. O item móvel ativo usa superfície escura translúcida, texto branco e ícone com cor do módulo; inativos usam texto atenuado. Os ícones são Lucide, geralmente de 16 a 24px, com tamanhos menores em ações compactas. O rodapé usa rótulos de 9px em caixa alta e não deve ser descrito como uma barra desktop.

### Modal

`components/ui/Modal.tsx` é o padrão compartilhado, com título, subtítulo opcional, ícone opcional, corpo rolável e rodapé separado. O tamanho padrão é `lg`; `compact` muda o padrão para `md`. As larguras máximas são 320px (`sm`), 28rem (`md`), 42rem (`lg`) e 64rem (`xl`).

Abaixo de `sm`, o painel ocupa a altura disponível e toda a largura permitida pelo tamanho; a partir de `sm`, fica centralizado, com altura automática e limite de 90dvh. O cabeçalho usa gradiente azul/ardósia/esmeralda, linha de acento superior e título em gradiente. O corpo acomoda rolagem e teclado por `visualViewport`. O componente contém foco, restaura o foco de origem, trata Escape/voltar e bloqueia ações durante `busy`.

O modal é renderizado em portal para `document.body`; não recriar essas garantias em uma implementação visual isolada. O `size="md"` controla a largura máxima, não garante um modal de altura compacta no celular.

### Brand / Loading

O símbolo oficial está em `public/brand/capitalflow-mark-dark.svg`. `LoadingScreen` importa `brand.css`, que aplica a marca ao chrome e ao login por seletores específicos. A splash usa wordmark, linha de convergência, símbolo e halo. Esses efeitos pertencem à assinatura de carregamento, não são uma receita para cada superfície operacional.

## Do's and Don'ts

### Do

- **Do** reutilizar os componentes e as variantes do contexto existente, respeitando diferenças entre botão básico, login e modal.
- **Do** manter a hierarquia de valores, nomes e estados, com composição adequada a desktop e celular.
- **Do** usar os valores normativos do frontmatter junto às fontes de implementação citadas; confirmar overrides locais antes de aplicar um token.
- **Do** preservar as cores de estado com seus textos e ícones, além das permissões e bloqueios de operações financeiras.
- **Do** manter corpo rolável, rodapé separado, safe areas e comportamento de foco ao reutilizar o modal compartilhado.

### Don't

- **Don't** transformar esta documentação em autorização para redesenhar, normalizar ou alterar a interface existente.
- **Don't** confundir o verde da marca com uma regra para todas as ações principais.
- **Don't** generalizar tamanhos minúsculos, animações ou overrides de uma tela como requisitos globais.
- **Don't** substituir o símbolo oficial por um ícone genérico ou expandir a animação da splash para tarefas financeiras.
- **Don't** apresentar esta extração do código como validação visual, auditoria de acessibilidade ou prova de comportamento em produção.
