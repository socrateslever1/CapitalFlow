import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PACKAGE = 'com.socrateslever.capitalflow';

/** A failed GitHub request must never turn into permission to replace a release. */
export function lookupRelease(repository, tag, execute = spawnSync) {
  const result = execute('gh', ['api', `repos/${repository}/releases/tags/${encodeURIComponent(tag)}`, '--include'], { encoding: 'utf8' });
  const output = result.stdout || '';
  const status = Number(/^HTTP\/\S+\s+(\d{3})/m.exec(output)?.[1]);
  if (status === 404 && result.status !== 0 && !result.error) return null;
  if (result.error || result.status !== 0 || status !== 200) {
    throw new Error('Não foi possível consultar a release anterior; publicação bloqueada.');
  }
  let metadata;
  try { metadata = JSON.parse(output.split(/\r?\n\r?\n/).slice(1).join('\n\n')); }
  catch { throw new Error('Resposta inválida ao consultar a release anterior.'); }
  if (!metadata || !Number.isSafeInteger(metadata.id) || !Array.isArray(metadata.assets)) {
    throw new Error('Resposta incompleta ao consultar a release anterior.');
  }
  return metadata;
}

export function compareReleaseIdentity(next, previous) {
  for (const identity of [next, previous]) {
    if (identity.packageName !== PACKAGE) throw new Error('Pacote Android divergente.');
    if (!/^[a-f\d]{64}$/i.test(identity.certificate || '')) throw new Error('Certificado Android inválido.');
    if (!Number.isSafeInteger(identity.versionCode) || identity.versionCode < 1) throw new Error('versionCode Android inválido.');
    if (!/^[a-f\d]{64}$/i.test(identity.sha256 || '')) throw new Error('Resumo SHA-256 inválido.');
  }
  if (next.certificate.toLowerCase() !== previous.certificate.toLowerCase()) throw new Error('Certificado diferente da release anterior.');
  if (next.versionCode < previous.versionCode) throw new Error('versionCode não pode diminuir.');
  if (next.versionCode === previous.versionCode) {
    if (next.sha256.toLowerCase() !== previous.sha256.toLowerCase()) {
      throw new Error('Mesmo versionCode com bytes diferentes; publicação bloqueada.');
    }
    return 'identical';
  }
  return 'upgrade';
}

/** Require the workflow conclusion, rather than one successful job or an older commit. */
export function qualityRunState(runs, sha) {
  if (!Array.isArray(runs)) throw new Error('Resposta inválida do Quality Gates.');
  const latest = runs.filter(run => run.headSha === sha).sort((a, b) => b.databaseId - a.databaseId)[0];
  if (!latest || latest.status !== 'completed') return 'pending';
  if (latest.conclusion !== 'success') throw new Error('Quality Gates do commit exato não foi aprovado.');
  return 'success';
}

async function main([command, ...args]) {
  if (command === 'lookup') {
    const [repository, tag, output] = args;
    const metadata = lookupRelease(repository, tag);
    if (metadata) writeFileSync(output, JSON.stringify(metadata));
    console.log(metadata ? 'present' : 'absent');
  } else if (command === 'has-apk') {
    const metadata = JSON.parse(readFileSync(args[0], 'utf8'));
    console.log(metadata.assets.some(asset => asset.name === 'CapitalFlow-Android.apk') ? 'present' : 'absent');
  } else if (command === 'compare') {
    const [packageName, certificate, code, sha256, priorPackage, priorCertificate, priorCode, priorSha] = args;
    console.log(compareReleaseIdentity(
      { packageName, certificate, versionCode: Number(code), sha256 },
      { packageName: priorPackage, certificate: priorCertificate, versionCode: Number(priorCode), sha256: priorSha },
    ));
  } else if (command === 'quality') {
    const [repository, sha] = args;
    if (!/^[a-f\d]{40}$/i.test(sha || '')) throw new Error('Commit inválido para Quality Gates.');
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = spawnSync('gh', ['run', 'list', '--repo', repository, '--workflow', 'quality-gates.yml', '--commit', sha,
        '--branch', 'main', '--event', 'push', '--limit', '20', '--json', 'databaseId,headSha,status,conclusion'], { encoding: 'utf8' });
      if (result.error || result.status !== 0) throw new Error('Não foi possível consultar Quality Gates; publicação bloqueada.');
      if (qualityRunState(JSON.parse(result.stdout), sha) === 'success') return;
      if (attempt < 29) await new Promise(resolve => setTimeout(resolve, 10_000));
    }
    throw new Error('Quality Gates do commit exato ainda não foi concluído; publicação bloqueada.');
  } else {
    throw new Error('Comando de segurança de release inválido.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
