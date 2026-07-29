/**
 * Catalogo base de um condominio novo.
 *
 * Antes da multi-tenancy estes dados viviam como seed global em
 * database/schema.sql. Agora sao um molde: cada condominio provisionado
 * recebe a sua propria copia, que ele edita livremente sem afetar os outros.
 */

const CICLO = [
  { dia_ciclo: 1, setor: 'Quadras A-B', trecho: 'Quadras A e B' },
  { dia_ciclo: 2, setor: 'Quadras C-D', trecho: 'Quadras C e D' },
  { dia_ciclo: 3, setor: 'Quadras E-F', trecho: 'Quadras E e F' },
  { dia_ciclo: 4, setor: 'Quadras G-H', trecho: 'Quadras G e H' },
  { dia_ciclo: 5, setor: 'Quadras I-J', trecho: 'Quadras I e J' },
  { dia_ciclo: 6, setor: 'Quadra K',    trecho: 'Quadra K' },
  { dia_ciclo: 7, setor: 'Quadra L',    trecho: 'Quadra L' },
  { dia_ciclo: 8, setor: 'Quadra M',    trecho: 'Quadra M' },
].map((dia) => ({
  ...dia,
  atividades: [
    { ordem: 1, titulo: 'Limpeza',  descricao: 'Limpeza de ruas, guias e meio-fio',              equipe: 'Equipe Limpeza',    prioridade: '' },
    { ordem: 2, titulo: 'Rocagem',  descricao: 'Rocagem no meio-fio e faixa interna dos lotes',  equipe: 'Equipe Jardinagem', prioridade: '' },
    { ordem: 3, titulo: 'Inspecao', descricao: 'Checagem de drenagem, ralos e grelhas',          equipe: 'Manutencao',        prioridade: '' },
  ],
}));

const RUAS_POR_QUADRA = {
  A: 1, B: 1, C: 4, D: 4, E: 1, F: 1, G: 4, H: 1, I: 1, J: 4, K: 1, L: 1, M: 1,
};

const QUADRAS = Object.entries(RUAS_POR_QUADRA).map(([codigo, totalRuas]) => ({
  codigo,
  nome: `Quadra ${codigo}`,
  descricao: null,
  ruas: Array.from({ length: totalRuas }, (_, i) => ({ nome: `Rua ${i + 1}`, ordem: i + 1 })),
}));

const EQUIPES = [
  { nome: 'Equipe Limpeza',    tipo: 'Operacional' },
  { nome: 'Equipe Jardinagem', tipo: 'Operacional' },
  { nome: 'Manutencao',        tipo: 'Operacional' },
  { nome: 'Equipe Piscinas',   tipo: 'Operacional' },
  { nome: 'TI/Seguranca',      tipo: 'Apoio' },
  { nome: 'Prestador',         tipo: 'Terceiro' },
];

const LOCAIS = [
  { nome: 'Ruas internas',      categoria: 'Ruas' },
  { nome: 'Areas comuns',       categoria: 'Geral' },
  { nome: 'Academia',           categoria: 'Lazer' },
  { nome: 'Areas de lazer',     categoria: 'Lazer' },
  { nome: 'Areas verdes',       categoria: 'Jardinagem' },
  { nome: 'Lagos',              categoria: 'Lazer' },
  { nome: 'Piscinas',           categoria: 'Lazer' },
  { nome: 'Estacoes de esgoto', categoria: 'Esgoto' },
  { nome: 'Hidraulica',         categoria: 'Infraestrutura' },
  { nome: 'Drenagem',           categoria: 'Infraestrutura' },
  { nome: 'Quadros eletricos',  categoria: 'Eletrica' },
  { nome: 'Portoes',            categoria: 'Acessos' },
  { nome: 'CFTV',               categoria: 'Seguranca' },
  { nome: 'Playground',         categoria: 'Lazer' },
];

// prioridade usa 'Media' sem acento: e o formato de tarefa_modelos.
// A conversao para o ENUM de `tarefas` acontece em prioridadeTarefa().
const MODELOS = [
  { ciclo:'diario',  setor:'Esgoto',        area:'Estações',    atividade:'Ronda/inspeção visual das estações de esgoto', equipe:'Manutenção',           prioridade:'Alta'  },
  { ciclo:'diario',  setor:'Geral',         area:'',            atividade:'Coleta e organização de resíduos',             equipe:'Equipe Limpeza',       prioridade:'Alta'  },
  { ciclo:'diario',  setor:'Geral',         area:'Áreas comuns',atividade:'Limpeza diária das áreas comuns',              equipe:'Equipe Limpeza',       prioridade:'Alta'  },
  { ciclo:'diario',  setor:'Geral',         area:'',            atividade:'Limpeza da academia (2x ao dia)',              equipe:'Equipe Limpeza',       prioridade:'Media' },
  { ciclo:'diario',  setor:'Geral',         area:'',            atividade:'Limpeza áreas de lazer',                       equipe:'Equipe Limpeza',       prioridade:'Media' },
  { ciclo:'diario',  setor:'Hidráulica',    area:'',            atividade:'Verificação de vazamentos aparentes',          equipe:'Manutenção',           prioridade:'Media' },
  { ciclo:'diario',  setor:'Jardinagem',    area:'Áreas verdes',atividade:'Limpeza de folhas e resíduos vegetais',        equipe:'Equipe Jardinagem',    prioridade:'Media' },
  { ciclo:'diario',  setor:'Jardinagem',    area:'Áreas verdes',atividade:'Manutenção do sistema de irrigação',           equipe:'Equipe Jardinagem',    prioridade:'Alta'  },
  { ciclo:'diario',  setor:'Lagos',         area:'Lagos (3)',   atividade:'Inspeção visual + remoção de resíduos',        equipe:'Manutenção/Jardinagem',prioridade:'Media' },
  { ciclo:'diario',  setor:'Piscinas',      area:'Piscinas',    atividade:'Aplicação de produtos Cl/Ph (diário)',         equipe:'Equipe Piscinas',      prioridade:'Alta'  },
  { ciclo:'diario',  setor:'Piscinas',      area:'Piscinas',    atividade:'Limpeza de decks (diário)',                    equipe:'Equipe Limpeza',       prioridade:'Media' },
  { ciclo:'diario',  setor:'Piscinas',      area:'Piscinas',    atividade:'Limpeza de mobiliário (diário)',               equipe:'Equipe Limpeza',       prioridade:'Media' },
  ...Object.keys(RUAS_POR_QUADRA).map((codigo) => ({
    ciclo: 'diario', setor: `Quadra ${codigo}`, area: 'Ruas internas',
    atividade: `Limpeza de ruas, guias e meio-fio - Quadra ${codigo}`,
    equipe: 'Equipe Limpeza', prioridade: '',
  })),
  { ciclo:'semanal', setor:'Elétrica',       area:'Áreas comuns', atividade:'Troca de lâmpadas e luminárias',        equipe:'Manutenção',   prioridade:'Media' },
  { ciclo:'semanal', setor:'Hidráulica',     area:'Club',         atividade:'Verificação do sistema de filtros',     equipe:'Manutenção',   prioridade:'Media' },
  { ciclo:'semanal', setor:'Hidráulica',     area:'Drenagem',     atividade:'Limpeza de caixas de gordura coletivas',equipe:'Manutenção',   prioridade:'Media' },
  { ciclo:'semanal', setor:'Portões',        area:'',             atividade:'Lubrificação de trilhos e dobradiças',  equipe:'Manutenção',   prioridade:'Media' },
  { ciclo:'semanal', setor:'Segurança',      area:'CFTV',         atividade:'Limpeza de lentes + teste de gravação', equipe:'TI/Segurança', prioridade:'Media' },
  { ciclo:'semanal', setor:'Áreas de Lazer', area:'Playground',   atividade:'Inspeção de brinquedos + fixações',     equipe:'Manutenção',   prioridade:'Alta'  },
  { ciclo:'mensal',  setor:'Elétrica',        area:'Quadros',         atividade:'Revisão de quadros elétricos (prestador)', equipe:'Prestador',      prioridade:'Alta' },
  { ciclo:'mensal',  setor:'Hidráulica',      area:'',                atividade:'Verificação de bombas (rodízio)',          equipe:'Manutenção',     prioridade:'Alta' },
  { ciclo:'mensal',  setor:'Piscinas',        area:'',                atividade:'Monitoramento químico completo',           equipe:'Equipe Piscinas',prioridade:'Alta' },
  { ciclo:'mensal',  setor:'Portões/Acessos', area:'Automatizadores', atividade:'Ajuste de motores e automatizadores',      equipe:'Manutenção',     prioridade:'Alta' },
  { ciclo:'mensal',  setor:'Seg. Incêndio',   area:'Iluminação',      atividade:'Teste de iluminação de emergência',        equipe:'Manutenção',     prioridade:'Alta' },
  { ciclo:'mensal',  setor:'Seg. Incêndio',   area:'Rotas',           atividade:'Verificação de sinalização de incêndio',   equipe:'Manutenção',     prioridade:'Alta' },
  { ciclo:'anual',   setor:'Esgoto',      area:'', atividade:'Limpeza das estações elevatórias', equipe:'Prestador',            prioridade:'Alta'  },
  { ciclo:'anual',   setor:'Estrutural',  area:'', atividade:'Inspeção estrutural preventiva',   equipe:'Engenharia/Prestador', prioridade:'Alta'  },
  { ciclo:'anual',   setor:'Geral',       area:'', atividade:'Dedetização e desratização',       equipe:'Prestador',            prioridade:'Media' },
  { ciclo:'anual',   setor:'Hidráulica',  area:'', atividade:"Limpeza de caixas d'água",         equipe:'Prestador',            prioridade:'Alta'  },
  { ciclo:'anual',   setor:'Incêndio',    area:'', atividade:'Recarga de extintores',            equipe:'Prestador',            prioridade:'Alta'  },
  { ciclo:'anual',   setor:'Piscinas',    area:'', atividade:'Troca do elemento filtrante',      equipe:'Prestador',            prioridade:'Alta'  },
];

module.exports = { CICLO, QUADRAS, EQUIPES, LOCAIS, MODELOS };
