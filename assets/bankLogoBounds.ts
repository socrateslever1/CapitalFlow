/**
 * Área realmente desenhada de cada logo (frações do viewBox), medida renderizando os SVGs.
 * tile: o logo já é um bloco com fundo próprio (recorta e preenche o quadro);
 * senão é só o símbolo/marca (vai sobre fundo claro, com respiro).
 * Gerado em 27/11/2026; ao trocar um SVG, medir de novo.
 */
export const bankLogoBounds: Record<string, { box: [number, number, number, number]; tile: boolean }> = {
  nubank: { box: [0.1758, 0.3203, 0.8242, 0.6797], tile: false },
  bb: { box: [0, 0, 1, 1], tile: true },
  caixa: { box: [0, 0, 1, 1], tile: true },
  bradesco: { box: [0.1758, 0.1758, 0.8242, 0.8242], tile: true },
  itau: { box: [0.1758, 0.1758, 0.8242, 0.8242], tile: true },
  santander: { box: [0, 0, 1, 1], tile: true },
  inter: { box: [0, 0, 1, 1], tile: true },
  c6: { box: [0.2109, 0.3477, 0.7891, 0.6523], tile: false },
  picpay: { box: [0.1758, 0.1758, 0.8242, 0.8242], tile: true },
  recargapay: { box: [0.1328, 0.0586, 0.8711, 0.9414], tile: false },
  mercadopago: { box: [0.1758, 0.25, 0.8242, 0.75], tile: false },
  pagbank: { box: [0.1758, 0.1758, 0.8242, 0.8242], tile: true },
  neon: { box: [0, 0, 1, 1], tile: true },
  pan: { box: [0, 0, 1, 1], tile: true },
  btg: { box: [0, 0, 1, 1], tile: true },
  sicredi: { box: [0, 0, 1, 1], tile: true },
  sicoob: { box: [0.1758, 0.2578, 0.8242, 0.832], tile: false },
  stone: { box: [0, 0, 1, 1], tile: true },
  infinitepay: { box: [0, 0, 1, 1], tile: true },
  original: { box: [0, 0, 0.9883, 0.9883], tile: false },
  amazonia: { box: [0.0234, 0.0234, 0.9883, 0.9766], tile: false },
  jota: { box: [0, 0, 1, 1], tile: true },
};
