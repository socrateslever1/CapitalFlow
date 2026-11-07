import assert from 'node:assert/strict';
import { test } from 'node:test';
import { friendlyAndroidUpdateError } from '../../utils/androidUpdateMessages';

test('interrupted update shows understandable Brazilian Portuguese message', () => {
  assert.equal(
    friendlyAndroidUpdateError(new Error('CONNECTION')),
    'Não foi possível baixar a atualização. Verifique sua conexão com a internet e tente novamente.',
  );
});

test('untrusted raw Android errors are never rendered to the user', () => {
  const cases: unknown[] = [
    new Error('unexpected end of stream on com.android.okhttp.Address@71e4512d'),
    new Error('java.io.EOFException at https://github.com/example/test'),
    { message: 'HTTP 503: /storage/emulated/0/download' },
    'com.android.install.STATUS_FAILURE_INVALID', undefined, null, 42,
  ];
  for (const error of cases) {
    const message = friendlyAndroidUpdateError(error);
    assert.match(message, /^Não foi possível concluir a atualização/);
    assert.doesNotMatch(message, /(?:okhttp|HTTP|java|stream|status|github|Error|Exception)/i);
  }
});

test('recognized installation codes map to friendly actionable sentences', () => {
  const codes = ['VALIDATION','INSTALLATION','PERMISSION','INSTALLATION_CANCELLED',
    'INSTALLATION_BLOCKED','INSTALLATION_CONFLICT','INSTALLATION_INCOMPATIBLE',
    'INSTALLATION_INVALID','INSTALLATION_STORAGE','INSTALLATION_UNKNOWN'];
  for (const code of codes) {
    const message = friendlyAndroidUpdateError({ message: code });
    assert.ok(message.length > 24);
    assert.doesNotMatch(message, /(?:STATUS_|Exception|java\.|com\.|\.apk|HTTP)/);
  }
  assert.equal(
    friendlyAndroidUpdateError(new Error('INSTALLATION_STORAGE')),
    'Não há espaço suficiente no celular para atualizar o aplicativo.',
  );
});
