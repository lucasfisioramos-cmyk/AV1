// src/services/ServicoOrganizacao.ts
import { Organizacao, Contrato } from '../domain/Entities';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo';
import { JournalTransacaoService } from '../persistence/JournalTransacao';
import { ValidadorCNPJ } from '../validators/Validator';

export class ServicoOrganizacao {
  private repo: RepositorioArquivo;
  private journal: JournalTransacaoService;
  private validadorCNPJ: ValidadorCNPJ;
  private readonly NOME_ARQUIVO = 'organizacoes';

  constructor(repo: RepositorioArquivo, journal: JournalTransacaoService) {
    this.repo = repo;
    this.journal = journal;
    this.validadorCNPJ = new ValidadorCNPJ();
  }

  public cadastrarOrganizacao(dados: {
    id: string;
    razaoSocial: string;
    cnpj: string;
    enderecoCompleto: string;
    telefone: string;
    email: string;
    usuarioResponsavel: string;
  }): Organizacao {
    if (!this.validadorCNPJ.validar(dados.cnpj)) {
      throw new Error(`CNPJ Inválido: ${this.validadorCNPJ.obterMensagemErro()}`);
    }

    const orgs = this.repo.carregarEntidade<Organizacao[]>(this.NOME_ARQUIVO) || [];
    
    if (orgs.some((o) => o.cnpj.replace(/\D/g, '') === dados.cnpj.replace(/\D/g, ''))) {
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
    this.repo.salvarEntidade(this.NOME_ARQUIVO, orgs);

    this.journal.registrar({
      operacao: 'CADASTRAR_ORGANIZACAO',
      entidade: 'Organizacao',
      dadosDepois: novaOrg,
      usuarioResponsavel: dados.usuarioResponsavel,
    });

    return novaOrg;
  }

  public buscarOrganizacao(id: string): Organizacao | null {
    const orgs = this.repo.carregarEntidade<Organizacao[]>(this.NOME_ARQUIVO) || [];
    return orgs.find((o) => o.id === id) || null;
  }
}