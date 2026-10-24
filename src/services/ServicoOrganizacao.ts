import { Organizacao, Contrato } from '../domain/Entities.js';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo.js';
import { JournalTransacaoService } from '../persistence/JournalTransacao.js';
import { ValidadorCNPJ } from '../validators/Validator.js';
import { PapelUsuario } from '../domain/Enums.js';

export class ServicoOrganizacao {
  private repo: RepositorioArquivo;
  private journal: JournalTransacaoService;
  private validadorCNPJ: ValidadorCNPJ;
  private readonly NOME_ARQUIVO_ORGS = 'organizacoes';
  private readonly NOME_ARQUIVO_CONTRATOS = 'contratos';

  constructor(repo: RepositorioArquivo, journal: JournalTransacaoService) {
    this.repo = repo;
    this.journal = journal;
    this.validadorCNPJ = new ValidadorCNPJ();
  }

  // --- GESTÃO DE ORGANIZAÇÕES ---

  public cadastrarOrganizacao(dados: {
    id: string;
    razaoSocial: string;
    cnpj: string;
    enderecoCompleto: string;
    telefone: string;
    email: string;
    usuarioResponsavel: string;
  }): Organizacao {
    this.exigirPapel(dados.usuarioResponsavel);
    if (![dados.id, dados.razaoSocial, dados.enderecoCompleto, dados.telefone, dados.email]
      .every((valor) => valor.trim().length > 0)) {
      throw new Error('Todos os campos da organização são obrigatórios.');
    }

    if (!this.validadorCNPJ.validar(dados.cnpj)) {
      throw new Error(`CNPJ Inválido: ${this.validadorCNPJ.obterMensagemErro()}`);
    }

    const orgs = this.repo.carregarEntidade<Organizacao[]>(this.NOME_ARQUIVO_ORGS) || [];

    if (orgs.some((o) => o.id === dados.id)) {
      throw new Error(`Já existe uma organização cadastrada com o ID '${dados.id}'.`);
    }

    const cnpjLimpo = dados.cnpj.replace(/\D/g, '');
    if (orgs.some((o) => o.cnpj.replace(/\D/g, '') === cnpjLimpo)) {
      throw new Error('Já existe uma organização cadastrada com este CNPJ.');
    }

    const novaOrg: Organizacao = {
      id: dados.id,
      razaoSocial: dados.razaoSocial,
      cnpj: dados.cnpj,
      enderecoCompleto: dados.enderecoCompleto,
      telefone: dados.telefone,
      email: dados.email,
      dataCadastro: new Date().toISOString(),
      ativo: true,
    };

    orgs.push(novaOrg);
    this.repo.salvarEntidade(this.NOME_ARQUIVO_ORGS, orgs);

    this.journal.registrar({
      operacao: 'CADASTRAR_ORGANIZACAO',
      entidade: 'Organizacao',
      dadosDepois: novaOrg,
      usuarioResponsavel: dados.usuarioResponsavel,
    });

    return novaOrg;
  }

  public buscarOrganizacao(id: string): Organizacao | null {
    const orgs = this.repo.carregarEntidade<Organizacao[]>(this.NOME_ARQUIVO_ORGS) || [];
    return orgs.find((o) => o.id === id) || null;
  }

  public listarOrganizacoesAtivas(): Organizacao[] {
    const orgs = this.repo.carregarEntidade<Organizacao[]>(this.NOME_ARQUIVO_ORGS) || [];
    return orgs.filter((o) => o.ativo);
  }

  public alterarEndereco(id: string, novoEndereco: string, usuarioResponsavel: string): void {
    this.exigirPapel(usuarioResponsavel);
    if (!novoEndereco.trim()) throw new Error('O endereço da organização é obrigatório.');

    const orgs = this.repo.carregarEntidade<Organizacao[]>(this.NOME_ARQUIVO_ORGS) || [];
    const org = orgs.find((o) => o.id === id);

    if (!org) {
      throw new Error(`Organização com ID '${id}' não encontrada.`);
    }

    const dadosAntes = { ...org };
    org.enderecoCompleto = novoEndereco;

    this.repo.salvarEntidade(this.NOME_ARQUIVO_ORGS, orgs);

    this.journal.registrar({
      operacao: 'ORG_EDITAR_ENDERECO',
      entidade: 'Organizacao',
      dadosAntes,
      dadosDepois: org,
      usuarioResponsavel,
    });
  }

  // --- GESTÃO DE CONTRATOS ---

  public cadastrarContrato(dados: {
    id: string;
    organizacaoId: string;
    dataVencimento: Date;
    valorMensal: number;
    usuarioResponsavel: string;
  }): Contrato {
    this.exigirPapel(dados.usuarioResponsavel);
    if (!Number.isFinite(dados.dataVencimento.getTime())) {
      throw new Error('Data de vencimento do contrato inválida.');
    }
    if (!Number.isFinite(dados.valorMensal) || dados.valorMensal <= 0) {
      throw new Error('O valor mensal do contrato deve ser um número maior que zero.');
    }

    const org = this.buscarOrganizacao(dados.organizacaoId);
    if (!org) {
      throw new Error(`Organização com ID '${dados.organizacaoId}' não encontrada para vinculação do contrato.`);
    }

    const contratos = this.repo.carregarEntidade<Contrato[]>(this.NOME_ARQUIVO_CONTRATOS) || [];

    if (contratos.some((c) => c.id === dados.id)) {
      throw new Error(`Já existe um contrato cadastrado com o ID '${dados.id}'.`);
    }

    const novoContrato: Contrato = {
      id: dados.id,
      organizacaoId: dados.organizacaoId,
      dataAssinatura: new Date().toISOString(),
      dataVencimento: dados.dataVencimento.toISOString(),
      clausulas: ['Termos padrão de logística reversa e rastreabilidade de ativos.'],
      valorMensal: dados.valorMensal,
      renovacaoAutomatica: true,
    };

    contratos.push(novoContrato);
    this.repo.salvarEntidade(this.NOME_ARQUIVO_CONTRATOS, contratos);

    this.journal.registrar({
      operacao: 'CONTRATO_CRIAR',
      entidade: 'Contrato',
      dadosDepois: novoContrato,
      usuarioResponsavel: dados.usuarioResponsavel,
    });

    return novoContrato;
  }

  public renovarContrato(id: string, novoVencimento: Date, usuarioResponsavel: string): void {
    this.exigirPapel(usuarioResponsavel);
    if (!Number.isFinite(novoVencimento.getTime())) {
      throw new Error('Nova data de vencimento do contrato inválida.');
    }
    const contratos = this.repo.carregarEntidade<Contrato[]>(this.NOME_ARQUIVO_CONTRATOS) || [];
    const contrato = contratos.find((c) => c.id === id);

    if (!contrato) {
      throw new Error(`Contrato com ID '${id}' não encontrado.`);
    }

    const dadosAntes = { ...contrato };
    contrato.dataVencimento = novoVencimento.toISOString();

    this.repo.salvarEntidade(this.NOME_ARQUIVO_CONTRATOS, contratos);

    this.journal.registrar({
      operacao: 'CONTRATO_RENOVAR',
      entidade: 'Contrato',
      dadosAntes,
      dadosDepois: contrato,
      usuarioResponsavel,
    });
  }

  public listarContratos(): Contrato[] {
    return this.repo.carregarEntidade<Contrato[]>(this.NOME_ARQUIVO_CONTRATOS) || [];
  }

  private exigirPapel(usuario: string): void {
    const credenciais = this.repo.carregarEntidade<{ usuario: string; papel: PapelUsuario }[]>('credenciais') || [];
    const responsavel = credenciais.find(
      (credencial) => credencial.usuario.toLowerCase() === usuario.toLowerCase()
    );
    if (
      !responsavel ||
      ![PapelUsuario.ADMINISTRADOR, PapelUsuario.OPERADOR_CADASTRO].includes(responsavel.papel)
    ) {
      throw new Error('Acesso negado: operação permitida apenas a administradores e operadores de cadastro.');
    }
  }
}