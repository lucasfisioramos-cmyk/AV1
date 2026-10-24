import { Lote, Equipamento, Movimentacao, Credencial } from '../domain/Entities.js';
import { PapelUsuario, StatusLote, TipoEquipamento, EstadoFisico, StatusRastreamento } from '../domain/Enums.js';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo.js';
import { JournalTransacaoService } from '../persistence/JournalTransacao.js';
import { ValidadorDataEntrada } from '../validators/Validator.js';

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

  // --- GESTÃO DE LOTES ---

  public criarLote(dados: {
    id: string;
    organizacaoId: string;
    notaFiscal: string;
    transportadora: string;
    dataEntrada: Date;
    usuarioResponsavel: string;
  }): Lote {
    this.exigirPapel(dados.usuarioResponsavel);
    if (!this.validadorData.validar(dados.dataEntrada)) {
      throw new Error(`Data do Lote Inválida: ${this.validadorData.obterMensagemErro()}`);
    }

    const lotes = this.repo.carregarEntidade<Lote[]>(this.NOME_ARQUIVO_LOTES) || [];
    const organizacoes = this.repo.carregarEntidade<{ id: string; ativo: boolean }[]>('organizacoes') || [];
    if (!organizacoes.some((organizacao) => organizacao.id === dados.organizacaoId && organizacao.ativo)) {
      throw new Error(`Organização ativa '${dados.organizacaoId}' não encontrada.`);
    }

    if (lotes.some((l) => l.id === dados.id)) {
      throw new Error(`Já existe um lote cadastrado com o ID '${dados.id}'.`);
    }

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

  public consultarLotesPorPeriodo(inicio: Date, fim: Date): Lote[] {
    if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime()) || inicio > fim) {
      throw new Error('Intervalo de datas inválido.');
    }
    const lotes = this.repo.carregarEntidade<Lote[]>(this.NOME_ARQUIVO_LOTES) || [];
    return lotes.filter((lote) => {
      const dataEntrada = new Date(lote.dataEntrada);
      return dataEntrada >= inicio && dataEntrada <= fim;
    });
  }

  // --- GESTÃO DE EQUIPAMENTOS ---

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
    this.exigirPapel(usuarioResponsavel);
    if (!Object.values(TipoEquipamento).includes(equipData.tipo)) {
      throw new Error('Tipo de equipamento inválido.');
    }
    if (!Object.values(EstadoFisico).includes(equipData.estadoFisico)) {
      throw new Error('Estado físico do equipamento inválido.');
    }
    if (!Number.isInteger(equipData.anoFabricacao) || equipData.anoFabricacao < 1900 ||
        equipData.anoFabricacao > new Date().getFullYear()) {
      throw new Error('Ano de fabricação inválido.');
    }
    if (!Number.isFinite(equipData.pesoQuilogramas) || equipData.pesoQuilogramas <= 0) {
      throw new Error('O peso do equipamento deve ser um número maior que zero.');
    }

    const lotes = this.repo.carregarEntidade<Lote[]>(this.NOME_ARQUIVO_LOTES) || [];
    const lote = lotes.find((l) => l.id === loteId);

    if (!lote) throw new Error(`Lote '${loteId}' não encontrado.`);

    const sequencia = lote.equipamentos.length + 1;
    const codigoBarras = `${lote.id}-${equipData.tipo.substring(0, 3)}-${sequencia.toString().padStart(3, '0')}`;

    const novoEquip: Equipamento = {
      id: Math.random().toString(36).substring(2, 9),
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

  public listarEquipamentosPorLote(loteId: string): Equipamento[] {
    const lotes = this.repo.carregarEntidade<Lote[]>(this.NOME_ARQUIVO_LOTES) || [];
    const lote = lotes.find((l) => l.id === loteId);

    if (!lote) {
      throw new Error(`Lote '${loteId}' não encontrado.`);
    }

    return lote.equipamentos || [];
  }

  public movimentarEquipamento(
    idOuCodigoBarras: string,
    novoStatus: StatusRastreamento,
    justificativa: string,
    usuarioResponsavel: string
  ): void {
    this.exigirPapel(usuarioResponsavel);
    if (!Object.values(StatusRastreamento).includes(novoStatus)) {
      throw new Error('Status de rastreamento inválido.');
    }

    this.movimentarStatus(idOuCodigoBarras, novoStatus, usuarioResponsavel, justificativa);
  }

  public movimentarStatus(
    idOuCodigoBarras: string,
    novoStatus: StatusRastreamento,
    usuarioResponsavel: string,
    justificativa?: string
  ): void {
    this.exigirPapel(usuarioResponsavel);
    if (!Object.values(StatusRastreamento).includes(novoStatus)) {
      throw new Error('Status de rastreamento inválido.');
    }

    const lotes = this.repo.carregarEntidade<Lote[]>(this.NOME_ARQUIVO_LOTES) || [];
    let equipAchado: Equipamento | null = null;

    for (const l of lotes) {
      const eq = l.equipamentos.find(
        (e) => e.id === idOuCodigoBarras || e.codigoBarrasInterno === idOuCodigoBarras
      );
      if (eq) {
        equipAchado = eq;
        break;
      }
    }

    if (!equipAchado) {
      throw new Error(`Equipamento '${idOuCodigoBarras}' não encontrado.`);
    }

    // Regra de Negócio: Desmonte exige triagem prévia completa (status em EM_TRIAGEM)
    if (
      (novoStatus === StatusRastreamento.EM_DESMONTE || novoStatus === StatusRastreamento.AGUARDANDO_DESMONTE) &&
      equipAchado.statusRastreamento !== StatusRastreamento.EM_TRIAGEM
    ) {
      throw new Error(
        'Regra Violada: O equipamento deve passar por triagem completa (EM_TRIAGEM) antes de ser enviado para desmonte.'
      );
    }

    const estadoAnterior = equipAchado.statusRastreamento;
    equipAchado.statusRastreamento = novoStatus;

    const novaMov: Movimentacao = {
      id: Math.random().toString(36).substring(2, 9),
      equipamentoId: equipAchado.id,
      dataHora: new Date().toISOString(),
      origem: estadoAnterior,
      destino: novoStatus,
      responsavel: usuarioResponsavel,
      observacao: justificativa || '',
    };

    if (!equipAchado.historicoMovimentacao) {
      equipAchado.historicoMovimentacao = [];
    }

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

  // Regra: Justificativa obrigatória para rebaixamento de estado físico em 2+ categorias
  public alterarEstadoFisicoEquipamento(
    idOuCodigoBarras: string,
    novoEstado: EstadoFisico,
    justificativa: string,
    usuarioResponsavel: string
  ): void {
    this.exigirPapel(usuarioResponsavel);
    if (!Object.values(EstadoFisico).includes(novoEstado)) {
      throw new Error('Estado físico do equipamento inválido.');
    }

    const hierarquiaEstado: Record<EstadoFisico, number> = {
      [EstadoFisico.NOVO]: 6,
      [EstadoFisico.BOM_ESTADO]: 5,
      [EstadoFisico.USADO_LEVE]: 4,
      [EstadoFisico.USADO_MODERADO]: 3,
      [EstadoFisico.DANIFICADO_LEVE]: 2,
      [EstadoFisico.DANIFICADO_GRAVE]: 1,
      [EstadoFisico.INSERVIVEL]: 0,
    };

    const lotes = this.repo.carregarEntidade<Lote[]>(this.NOME_ARQUIVO_LOTES) || [];
    let equipAchado: Equipamento | null = null;

    for (const l of lotes) {
      const eq = l.equipamentos.find(
        (e) => e.id === idOuCodigoBarras || e.codigoBarrasInterno === idOuCodigoBarras
      );
      if (eq) {
        equipAchado = eq;
        break;
      }
    }

    if (!equipAchado) {
      throw new Error(`Equipamento '${idOuCodigoBarras}' não encontrado.`);
    }

    const nivelAnterior = hierarquiaEstado[equipAchado.estadoFisico];
    const nivelNovo = hierarquiaEstado[novoEstado];

    if (nivelAnterior - nivelNovo >= 2 && (!justificativa || justificativa.trim().length === 0)) {
      throw new Error(
        'Regra Violada: É obrigatória a justificativa textual para rebaixamento do estado físico em duas ou mais categorias.'
      );
    }

    const estadoFisicoAnterior = equipAchado.estadoFisico;
    equipAchado.estadoFisico = novoEstado;

    this.repo.salvarEntidade(this.NOME_ARQUIVO_LOTES, lotes);

    this.journal.registrar({
      operacao: 'ALTERAR_ESTADO_FISICO_EQUIPAMENTO',
      entidade: 'Equipamento',
      dadosAntes: { estadoFisico: estadoFisicoAnterior },
      dadosDepois: { estadoFisico: novoEstado, justificativa },
      usuarioResponsavel,
    });
  }

  private exigirPapel(usuario: string): void {
    const credenciais = this.repo.carregarEntidade<Credencial[]>('credenciais') || [];
    const responsavel = credenciais.find(
      (credencial) => credencial.usuario.toLowerCase() === usuario.toLowerCase()
    );
    if (
      !responsavel ||
      ![PapelUsuario.ADMINISTRADOR, PapelUsuario.GESTOR_ALMOXARIFADO].includes(responsavel.papel)
    ) {
      throw new Error('Acesso negado: operação permitida apenas a administradores e gestores de almoxarifado.');
    }
  }
}