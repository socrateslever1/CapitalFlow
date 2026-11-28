#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Fail-closed evidence gate for pull requests; does not pretend to replace
 * independent review or branch protection.
 */
export const REQUIRED_SECTIONS = Object.freeze([
  'Solicitação original',
  'Escopo autorizado',
  'Fora do escopo',
  'Critérios de aceitação',
  'Evidências de testes',
  'Riscos e reversão',
  'Revisão independente',
]);

const normalize = (text) => text.normalize('NFKC').trim();
const withoutComments = (text) => text.replace(/<!--[\s\S]*?-->/g, '').trim();
const emptyMarkers = /^(?:n\/a|não se aplica|nenhum|nenhuma|sem alterações|todo|tbd|pendente|preencher|descrever|informe|adicionar|a definir|\.{3}|[-*\s]*)[.!\s]*$/i;

export function extractSections(body) {
  if (typeof body !== 'string') return new Map();
  const blocks = new Map();
  const headings = [...body.matchAll(/^##[ \t]+([^\r\n]+)[ \t]*$/gm)];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = normalize(headings[index][1]);
    const start = headings[index].index + headings[index][0].length;
    const end = headings[index + 1]?.index ?? body.length;
    if (blocks.has(heading)) blocks.set(heading, ''); // duplicate -> invalid
    else blocks.set(heading, withoutComments(body.slice(start, end)));
  }
  return blocks;
}

export function validateAgentPr(body) {
  const errors = [];
  const sections = extractSections(body);
  if (typeof body !== 'string' || body.length > 65_536) {
    return ['Descrição do PR ausente, inválida ou superior a 64 KiB.'];
  }
  for (const heading of REQUIRED_SECTIONS) {
    const value = sections.get(heading);
    if (value === undefined) {
      errors.push(`Seção obrigatória ausente: "## ${heading}".`);
    } else if (normalize(value).length < 24 || emptyMarkers.test(normalize(value))) {
      errors.push(`Preencha "## ${heading}" com fatos específicos (mínimo de 24 caracteres).`);
    }
  }
  const criteria = sections.get('Critérios de aceitação') ?? '';
  if (criteria && !/^\s*[-*]\s+\[[ xX]\]\s+\S/m.test(criteria)) {
    errors.push('Critérios de aceitação precisam de pelo menos um item verificável em checklist.');
  }
  const tests = sections.get('Evidências de testes') ?? '';
  if (tests && !/(?:PASS|FAIL|aprovad[oa]s?|reprovad[oa]s?|falh(?:a|ou|aram)|não executad[oa]s?|bloquead[oa]s?)/i.test(tests)) {
    errors.push('Declare resultados de testes (PASS/FAIL/bloqueado/não executado), sem alegar aprovação sem evidência.');
  }
  const review = sections.get('Revisão independente') ?? '';
  if (review && !/(?:revisor|revisão|review|agente)/i.test(review)) {
    errors.push('Informe quem fará/fez a revisão independente e qual foi seu resultado.');
  }
  return errors;
}

export function readPrBodyFromEvent(eventPath) {
  if (!eventPath || typeof eventPath !== 'string') throw new Error('Caminho do evento do GitHub não informado.');
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  if (!event?.pull_request || typeof event.pull_request !== 'object') {
    throw new Error('Evento não contém pull_request.');
  }
  return event.pull_request.body;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const eventPath = process.argv[2];
    const errors = validateAgentPr(readPrBodyFromEvent(eventPath));
    if (errors.length) {
      for (const error of errors) console.error(`ERRO: ${error}`);
      process.exitCode = 1;
    } else {
      console.log('PASS: contrato de execução documentado no PR. A revisão humana e a aprovação dos testes continuam obrigatórias.');
    }
  } catch (error) {
    console.error('ERRO: não foi possível validar o contrato do PR:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
