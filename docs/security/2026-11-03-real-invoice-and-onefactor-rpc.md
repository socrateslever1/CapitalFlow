# Auditoria de importação com faturas reais — 03/11/2026

## Evidência e privacidade
Foram analisados localmente três documentos bancários reais disponibilizados anteriormente pelo proprietário: layouts Mercado Pago, Nubank e Itaú. Os PDFs, identificadores, nomes, endereços e dados de transação **não foram incluídos no repositório**.

## Defeito confirmado e corrigido
Em um layout Itaú, `Total a pagar` também é apresentado dentro de um quadro de alternativa de financiamento, podendo incluir juros/encargos. A versão anterior podia priorizar esse número **se a ordem de extração dos blocos do PDF o colocasse antes de** `Total desta fatura`. No arquivo examinado, o resumo aparece antes; o teste de regressão simula a ordenação inversa que causaria a falha. A correção usa `Total desta fatura` ou `O total da sua fatura é` antes da alternativa de financiamento e adiciona aviso de divergência.

Testes de regressão usam valores fictícios, mas mantêm o ordenamento do texto e dos títulos do layout observado. O importador continua exigindo confirmação do usuário para registrar compras e não infere pagamentos quitados a partir do PDF.

## Limites
Esta auditoria comprova o defeito identificado e cobre a sua correção no parser. Não equivale a teste E2E em navegador com os bytes originais dos três PDFs, tampouco a conciliação das faturas com dados bancários vivos. OFX real ainda depende de arquivo de teste autorizado.
