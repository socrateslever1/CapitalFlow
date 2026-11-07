import assert from 'node:assert/strict';
import test from 'node:test';
import { formatWalletMoneyInput, parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';

test('calculadora aceita operações monetárias em português brasileiro', () => {
  const cases: Array<[string, number]> = [
    ['700+200', 900], ['700+4,99%', 734.93], ['700-4,99%', 665.07],
    ['700*2', 1400], ['700×2', 1400], ['700/2', 350], ['700÷2', 350],
    ['1.234,56+200,44', 1435], ['(700+200)*2', 1800],
    ['100+50*2', 200], ['100/3', 33.33], ['0,1+0,2', 0.3],
    ['700,00', 700], ['1.234,56', 1234.56], ['495.611', 495611],
  ];
  for (const [input, output] of cases) assert.equal(parseWalletMoney(input), output, input);
  assert.equal(formatWalletMoneyInput('700+4,99%'), '734,93');
  assert.equal(formatWalletMoneyInput(''), '');
});

test('não arredonda entrada monetária inválida ou executa código', () => {
  for (const input of [
    '700+', '1/0', 'abc', '2**3', '1..2', '1,2,3', '-1',
    '1000000000000000', '(1+2', '1+2)', '1e3', 'NaN',
    'Infinity', '1;alert(1)', '', '495,611', '495.6111', 'R$ 10',
  ]) assert.throws(() => parseWalletMoney(input), undefined, input);
});
