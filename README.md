# EspaçoOn

Primeira versão do sistema de locação do clube.

## Escopo atual

- Landing page responsiva e mobile-first
- Carrossel principal de fotos
- Apresentação da estrutura do clube
- Galeria de fotos
- Preços demonstrativos de 12h e 24h
- Calendário visual com disponibilidade mockada
- Fluxo funcional de reserva: data → 12h/24h → dados → resumo → Pix simulado → confirmação
- Persistência local das reservas no navegador via localStorage
- CTA para agendamento de visita
- Sem MongoDB nesta fase
- Sem Mercado Pago real nesta fase

## Rodando localmente

```bash
npm install
npm run dev
```

Depois abra o endereço mostrado pelo Vite no navegador.

## Próximas etapas

1. Criar agendamento de visita.
2. Criar painel administrativo.
3. Gerar contrato e assinatura eletrônica simulada.
4. Melhorar regras de horários e bloqueios da agenda.
5. Substituir imagens provisórias pelas fotos reais do clube.
6. Somente ao final integrar MongoDB e Mercado Pago real.

## Fotos

As imagens atuais são provisórias. Substituir pelas fotos reais do clube quando estiverem disponíveis.
