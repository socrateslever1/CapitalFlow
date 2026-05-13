
import { LegalDocumentSnapshot } from '../types/legal';

export const legalTemplateService = {
  /**
   * Gera o HTML completo para o documento de Confissão de Dívida.
   */
  renderConfissaoDivida(snapshot: LegalDocumentSnapshot): string {
    const {
      codigo_contrato,
      data_geracao,
      credor,
      devedor,
      divida,
      pagamento,
      testemunhas,
      hash_documento,
      assinatura_digital
    } = snapshot;

    const formatCurrency = (value: number) => 
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    const formatDate = (dateStr: string) => 
      new Date(dateStr).toLocaleDateString('pt-BR');

    return `
      <div class="legal-document" style="font-family: 'Times New Roman', Times, serif; color: #000; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px; background: #fff; border: 1px solid #eee;">
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="font-size: 22px; text-transform: uppercase; margin-bottom: 10px; font-weight: bold;">INSTRUMENTO PARTICULAR DE CONFISSÃO E COMPROMISSO DE PAGAMENTO DE DÍVIDA</h1>
          <p style="font-size: 12px; color: #666;">Código do Contrato: ${codigo_contrato}</p>
        </div>

        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 16px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold;">1. DAS PARTES</h2>
          <p><strong>CREDOR:</strong> ${credor.nome}, ${credor.nacionalidade || 'brasileiro(a)'}, ${credor.estado_civil || 'estado civil não informado'}, ${credor.profissao || 'profissão não informada'}, inscrito no CPF/CNPJ sob o nº ${credor.documento}, residente e domiciliado em ${credor.endereco}.</p>
          <p style="margin-top: 10px;"><strong>DEVEDOR:</strong> ${devedor.nome}, ${devedor.nacionalidade || 'brasileiro(a)'}, ${devedor.estado_civil || 'estado civil não informado'}, ${devedor.profissao || 'profissão não informada'}, inscrito no CPF/CNPJ sob o nº ${devedor.documento}, residente e domiciliado em ${devedor.endereco}.</p>
        </section>

        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 16px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold;">2. DO OBJETO E ORIGEM DA DÍVIDA</h2>
          <p>O <strong>DEVEDOR</strong>, por este instrumento, reconhece e confessa ser devedor ao <strong>CREDOR</strong> da quantia líquida, certa e exigível de <strong>${formatCurrency(divida.valor_total)} (${divida.valor_extenso || ''})</strong>.</p>
          <p style="margin-top: 10px;">A referida dívida tem origem em: ${divida.origem}.</p>
        </section>

        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 16px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold;">3. DA FORMA DE PAGAMENTO</h2>
          <p>O <strong>DEVEDOR</strong> compromete-se a efetuar o pagamento do débito acima confessado da seguinte forma:</p>
          <div style="margin-top: 10px; padding-left: 20px;">
            ${pagamento.parcelas.map((p: any, i: number) => `
              <p>Parcela ${i + 1}: ${formatCurrency(p.valor)} com vencimento em ${formatDate(p.vencimento)}</p>
            `).join('')}
          </div>
          <p style="margin-top: 10px;">O pagamento deverá ser realizado via ${pagamento.metodo || 'PIX/Transferência Bancária'}.</p>
        </section>

        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 16px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold;">4. DOS ENCARGOS E MORA</h2>
          <p>O atraso no pagamento de qualquer das parcelas pactuadas incidirá em multa moratória de ${divida.multa_percentual || 10}%, juros de mora de ${divida.juros_mes_percentual || 1}% ao mês e correção monetária.</p>
        </section>

        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 16px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold;">5. DO VENCIMENTO ANTECIPADO</h2>
          <p>O inadimplemento de qualquer parcela facultará ao <strong>CREDOR</strong> considerar vencida antecipadamente a totalidade da dívida, independentemente de notificação judicial ou extrajudicial, podendo o <strong>CREDOR</strong> exigir o pagamento imediato do saldo devedor remanescente, acrescido dos encargos previstos na cláusula anterior.</p>
        </section>

        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 16px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold;">6. DA EXECUÇÃO JUDICIAL</h2>
          <p>O presente instrumento constitui <strong>TÍTULO EXECUTIVO EXTRAJUDICIAL</strong>, nos termos do Artigo 784, inciso III, do Código de Processo Civil Brasileiro, apto a embasar processo de execução imediata em caso de descumprimento.</p>
        </section>

        <section style="margin-bottom: 25px;">
          <h2 style="font-size: 16px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold;">7. DO FORO</h2>
          <p>As partes elegem o foro da Comarca de ${divida.foro || 'Manaus/AM'} para dirimir quaisquer dúvidas ou controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
        </section>

        <div style="margin-top: 50px;">
          <p style="text-align: right;">${divida.foro || 'Manaus/AM'}, ${formatDate(data_geracao)}</p>
        </div>

        <div style="margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
          <div style="text-align: center; border-top: 1px solid #000; padding-top: 10px;">
            <p><strong>${credor.nome}</strong></p>
            <p style="font-size: 12px;">CREDOR</p>
          </div>
          <div style="text-align: center; border-top: 1px solid #000; padding-top: 10px;">
            <p><strong>${devedor.nome}</strong></p>
            <p style="font-size: 12px;">DEVEDOR</p>
          </div>
        </div>

        <div style="margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
          <div style="text-align: center; border-top: 1px solid #000; padding-top: 10px;">
            <p>Testemunha 1: ____________________</p>
            <p style="font-size: 12px;">Nome: ${testemunhas?.[0]?.nome || ''}</p>
            <p style="font-size: 12px;">CPF: ${testemunhas?.[0]?.documento || ''}</p>
          </div>
          <div style="text-align: center; border-top: 1px solid #000; padding-top: 10px;">
            <p>Testemunha 2: ____________________</p>
            <p style="font-size: 12px;">Nome: ${testemunhas?.[1]?.nome || ''}</p>
            <p style="font-size: 12px;">CPF: ${testemunhas?.[1]?.documento || ''}</p>
          </div>
        </div>

        ${assinatura_digital ? `
          <div style="margin-top: 80px; padding: 20px; border: 2px solid #000; background: #f9f9f9;">
            <h3 style="font-size: 14px; text-transform: uppercase; margin-bottom: 10px; font-weight: bold; text-align: center;">REGISTRO DE ASSINATURA DIGITAL</h3>
            <p style="font-size: 11px;">Este documento foi assinado digitalmente através do sistema <strong>CapitalFlow</strong>.</p>
            <div style="display: grid; grid-template-columns: 1fr 100px; gap: 20px; margin-top: 10px;">
              <div style="font-size: 10px; line-height: 1.4;">
                <p><strong>Signatário:</strong> ${assinatura_digital.nome}</p>
                <p><strong>CPF:</strong> ${assinatura_digital.cpf}</p>
                <p><strong>Data/Hora:</strong> ${formatDate(assinatura_digital.data_hora)} ${new Date(assinatura_digital.data_hora).toLocaleTimeString()}</p>
                <p><strong>IP:</strong> ${assinatura_digital.ip}</p>
                <p><strong>User Agent:</strong> ${assinatura_digital.user_agent}</p>
                <p style="word-break: break-all;"><strong>Hash do Documento:</strong> ${hash_documento}</p>
                <p style="word-break: break-all;"><strong>Hash da Assinatura:</strong> ${assinatura_digital.hash_assinatura}</p>
              </div>
              <div id="qrcode-container" style="width: 100px; height: 100px; background: #eee; display: flex; items-center; justify-center;">
                <!-- QR Code será injetado aqui via JS ou renderizado como imagem -->
                <span style="font-size: 8px; text-align: center;">QR Code de Verificação</span>
              </div>
            </div>
          </div>
        ` : ''}

        <div style="margin-top: 20px; text-align: center; font-size: 9px; color: #999;">
          Gerado eletronicamente pelo Sistema CapitalFlow em ${formatDate(data_geracao)} às ${new Date(data_geracao).toLocaleTimeString()}
        </div>
      </div>
    `;
  }
};
