// src/services/ServicoRelatorio.ts
import { RepositorioArquivo } from '../persistence/RepositorioArquivo.js';
import { JournalTransacaoService } from '../persistence/JournalTransacao.js';
import { Lote, Equipamento } from '../domain/Entities.js';

export class ServicoRelatorio {
  private repo: RepositorioArquivo;
  private journal: JournalTransacaoService;

  constructor(
    repo: RepositorioArquivo,
    journal: JournalTransacaoService
  ) {
    this.repo = repo;
    this.journal = journal;
  }

  public rastrearEquipamento(codigoOuId: string): string {
    const lotes = this.repo.carregarEntidade<Lote[]>('lotes') || [];
    let equipEncontrado: Equipamento | null = null;
    let loteOrigem: Lote | null = null;

    for (const l of lotes) {
      if (!l.equipamentos) continue;
      const eq = l.equipamentos.find(
        (e) => e.id === codigoOuId || e.codigoBarrasInterno === codigoOuId
      );
      if (eq) {
        equipEncontrado = eq;
        loteOrigem = l;
        break;
      }
    }

    if (!equipEncontrado) {
      return `❌ Equipamento '${codigoOuId}' não foi localizado no acervo.`;
    }

    let saida = `\n================ RASTREABILIDADE DE EQUIPAMENTO ================\n`;
    saida += `Código de Barras: ${equipEncontrado.codigoBarrasInterno}\n`;
    saida += `Tipo: ${equipEncontrado.tipo} | Marca/Modelo: ${equipEncontrado.marca} ${equipEncontrado.modelo}\n`;
    saida += `Ano Fabricação: ${equipEncontrado.anoFabricacao} | Peso: ${equipEncontrado.pesoQuilogramas}kg\n`;
    saida += `Lote Origem: ${loteOrigem?.id} | Status Atual: ${equipEncontrado.statusRastreamento}\n`;
    saida += `----------------------------------------------------------------\n`;
    saida += `HISTÓRICO DE MOVIMENTAÇÕES:\n`;

    if (!equipEncontrado.historicoMovimentacao || equipEncontrado.historicoMovimentacao.length === 0) {
      saida += ` (Sem movimentações registradas)\n`;
    } else {
      equipEncontrado.historicoMovimentacao.forEach((m, idx) => {
        saida += ` ${idx + 1}. [${m.dataHora}] ${m.origem} -> ${m.destino} (Resp: ${m.responsavel}) | Obs: ${m.observacao || 'N/A'}\n`;
      });
    }

    saida += `================================================================\n`;
    return saida;
  }

  public consultarJournal(limite: number = 20): string {
    try {
      const registros = this.journal.listar(limite);
      if (registros.length === 0) {
        return 'ℹ Journal de auditoria sem registros no momento.';
      }

      let relatorio = `\n================ JOURNAL DE AUDITORIA (Últimos ${registros.length} Registros) ================\n`;
      registros.forEach((registro) => {
        relatorio += `[${registro.timestamp}] | Op: ${registro.operacao} | Entidade: ${registro.entidade} | Resp: ${registro.usuarioResponsavel}\n`;
      });

      relatorio += `================================================================================\n`;
      return relatorio;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      return `❌ Falha ao ler journal de transações: ${mensagem}`;
    }
  }
}