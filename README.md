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
- Agendamento de visita funcional com dados salvos localmente
- Painel administrativo inicial com visão geral, agenda, reservas, visitas e preços
- Sem MongoDB nesta fase
- Sem Mercado Pago real nesta fase

## Rodando localmente

```bash
npm install
npm run dev
```

Depois abra o endereço mostrado pelo Vite no navegador.

## Próximas etapas

1. Gerar contrato e assinatura eletrônica simulada.
2. Criar bloqueio/liberação manual de datas no painel.
3. Fazer preços do painel refletirem no site público usando camada local temporária.
4. Melhorar regras de horários e disponibilidade.
5. Substituir imagens provisórias pelas fotos reais do clube.
6. Adicionar autenticação administrativa.
7. Somente ao final integrar MongoDB e Mercado Pago real.

## Fotos

As imagens atuais são provisórias. Substituir pelas fotos reais do clube quando estiverem disponíveis.
