export const PERIOD_OPTIONS = [
  ['todos', 'Todos'],
  ['hoje', 'Hoje'],
  ['semana', 'Semana'],
  ['mes', 'Mes'],
  ['custom', 'Periodo'],
];

export function toDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function today() {
  return toDateInput(new Date());
}

export function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

export function monthEnd() {
  const date = new Date();
  return toDateInput(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function rangeFor(period) {
  if (period === 'hoje') {
    const current = today();
    return [current, current];
  }
  if (period === 'semana') return [today(), addDays(7)];
  if (period === 'mes') return [today(), monthEnd()];
  return [today(), addDays(7)];
}

export function paramsForPeriod(period, inicio, fim) {
  if (period === 'todos') return {};
  return { data_inicio: inicio, data_fim: fim };
}

export function formatDate(value) {
  if (!value) return '-';
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR');
}
