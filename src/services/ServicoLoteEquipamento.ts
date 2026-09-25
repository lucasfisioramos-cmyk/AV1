// src/services/ServicoLoteEquipamento.ts
import { Lote, Equipamento, Movimentacao } from '../domain/Entities';
import { StatusLote, TipoEquipamento, EstadoFisico, StatusRastreamento } from '../domain/Enums';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo';
import { JournalTransacaoService } from '../persistence/JournalTransacao';
import { ValidadorDataEntrada } from '../validators/Validator';

export class ServicoLoteEquipamento {
  private repo: RepositorioArquivo;
  private journal: JournalTransacaoService;
  private validadorData: ValidadorDataEntrada;
  private readonly NOME_ARQUIVO_LOTES = 'lotes';

  constructor(repo: RepositorioArquivo, journal: JournalTransacaoService) {
    this.repo = repo;
    this.journal = journal;
    this.validadorData = new ValidadorDataEntrada();
  }

  public criarLote(dados: {
    id: string;
    organizacaoId: string;
    notaFiscal: string;
    transportadora: string;
    dataEntrada: Date;
    usuarioResponsavel: string;
  }): Lote {
    if (!this.validadorData.validar(dados.dataEntrada)) {
      throw new Error(`Data do Lote Inválida: ${this.validadorData.obterMensagemErro()}`);
    }

    const lotes = this.repo.carregarEntidade<Lote[]>(this.NOME_ARQUIVO_LOTES) || [];
    
    const novoLote: Lote = {
      id: dados.id,
      organizacaoId: dados.organizacaoId,
      notaFiscal: dados.notaFiscal,
      transportadora: dados.transportadora,
      dataEntrada: dados.dataEntrada.toISOString(),
      statusProcessamento: StatusLote.RECEBIDO,
      equipamentos: [],
    };

    lotes.push(novoLote);
    this.repo.salvarEntidade(this.NOME_ARQUIVO_LOTES, lotes);

    this.journal.registrar({
      operacao: 'CRIAR_LOTE',
      entidade: 'Lote',
      dadosDepois: novoLote,
      usuarioResponsavel: dados.usuarioResponsavel,
    });

    return novoLote;
  }

  public adicionarEquipamento(
    loteId: string,
    equipData: {
      tipo: TipoEquipamento;
      marca: string;
      modelo: string;
      anoFabricacao: number;
      estadoFisico: EstadoFisico;
      pesoQuilogramas: number;
    },
    usuarioResponsavel: string
  ): Equipamento {
    const lotes = this.repo.carregarEntidade<Lote[]>(this.NOME_ARQUIVO_LOTES) || [];
    const lote = lotes.find((l) => l.id === loteId);

    if (!lote) throw new Error('Lote não encontrado.');

    const sequencia = lote.equipamentos.length + 1;
    const codigoBarras = `${lote.id}-${equipData.tipo.substring(0, 3)}-${sequencia.toString().padStart(3, '0')}`;

    const novoEquip: Equipamento = {
      id: Math.random().toString(36).substr(2, 9),
      codigoBarrasInterno: codigoBarras,
      loteId: lote.id,
      posicaoNoLote: sequencia,
      statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
      historicoMovimentacao: [],
      ...equipData,
    };

    lote.equipamentos.push(novoEquip);
    this.repo.salvarEntidade(this.NOME_ARQUIVO_LOTES, lotes);

    this.journal.registrar({
      operacao: 'ADICIONAR_EQUIPAMENTO',
      entidade: 'Equipamento',
      dadosDepois: novoEquip,
      usuarioResponsavel,
    });

    return novoEquip;
  }

  public movimentarStatus(
    equipamentoId: string,
    novoStatus: StatusRastreamento,
    usuarioResponsavel: string,
    justificativa?: string
  ): void {
    const lotes = this.repo.carregarEntidade<Lote[]>(this.NOME_ARQUIVO_LOTES) || [];
    let equipAchado: Equipamento | null = null;

    for (const l of lotes) {
      const eq = l.equipamentos.find((e) => e.id === equipamentoId || e.codigoBarrasInterno === equipamentoId);
      if (eq) {
        equipAchado = eq;
        break;
      }
    }

    if (!equipAchado) throw new Error('Equipamento não encontrado.');

    // Regra RF06: Desmonte exige triagem prévia realizada
    if (
      (novoStatus === StatusRastreamento.EM_DESMONTE || novoStatus === StatusRastreamento.AGUARDANDO_DESMONTE) &&
      equipAchado.statusRastreamento === StatusRastreamento.AGUARDANDO_TRIAGEM
    ) {
      throw new Error('Regra Violada: O equipamento deve passar por triagem antes de ser enviado para desmonte.');
    }

    const estadoAnterior = equipAchado.statusRastreamento;
    equipAchado.statusRastreamento = novoStatus;

    const novaMov: Movimentacao = {
      id: Math.random().toString(36).substr(2, 9),
      equipamentoId: equipAchado.id,
      dataHora: new Date().toISOString(),
      origem: estadoAnterior,
      destino: novoStatus,
      responsavel: usuarioResponsavel,
      observacao: justificativa,
    };

    equipAchado.historicoMovimentacao.push(novaMov);
    this.repo.salvarEntidade(this.NOME_ARQUIVO_LOTES, lotes);

    this.journal.registrar({
      operacao: 'MOVIMENTAR_EQUIPAMENTO',
      entidade: 'Equipamento',
      dadosAntes: { status: estadoAnterior },
      dadosDepois: { status: novoStatus, justificativa },
      usuarioResponsavel,
    });
  }
}