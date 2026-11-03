import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVE_REASONS, creditImpactFromArchive, isSameBorrower, validateArchiveClassification } from '../../domain/credit/archivePolicy';

test('o motivo, e não a modalidade Somente Capital, determina o impacto do arquivo', () => {
  assert.equal(creditImpactFromArchive('BILATERAL_OFFSET'), 'ALLOW');
  assert.equal(creditImpactFromArchive('VOLUNTARY_WAIVER'), 'ALLOW');
  assert.equal(creditImpactFromArchive('NON_PAYMENT'), 'BLOCK');
  assert.equal(creditImpactFromArchive('BAD_DEBT'), 'BLOCK');
  assert.equal(creditImpactFromArchive('DISPUTED'), 'REVIEW');
  assert.equal(creditImpactFromArchive(null), 'REVIEW');
  assert.equal(ARCHIVE_REASONS.length, 7);
});
test('arquivo sensível exige justificativa e permite correção administrativa', () => {
  assert.ok(validateArchiveClassification('NON_PAYMENT', ''));
  assert.equal(validateArchiveClassification('NON_PAYMENT', 'Devedor não pagou os vencimentos'), null);
  assert.equal(validateArchiveClassification('ADMINISTRATIVE', ''), null);
  assert.ok(validateArchiveClassification('other', 'nota'));
});
test('não atribui risco a homônimos ou CPFs ausentes', () => {
  assert.equal(isSameBorrower({clientId:'',debtorDocument:''},{clientId:'',debtorDocument:''}), false);
  assert.equal(isSameBorrower({clientId:'',debtorDocument:'00000000000'},{clientId:'',debtorDocument:'00000000000'}), false);
  assert.equal(isSameBorrower({clientId:'a',debtorDocument:''},{clientId:'a',debtorDocument:''}), true);
  assert.equal(isSameBorrower({clientId:'',debtorDocument:'123.456.789-01'},{clientId:'',debtorDocument:'12345678901'}), true);
});
