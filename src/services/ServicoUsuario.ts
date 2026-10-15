import { Credencial } from '../domain/Entities.js';
import { PapelUsuario } from '../domain/Enums.js';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo.js';
import { JournalTransacaoService } from '../persistence/JournalTransacao.js';
import { CriptografiaArquivo } from '../security/CriptografiaArquivo.js';

export class ServicoUsuario {
  private repo: RepositorioArquivo;
  private journal: JournalTransacaoService;
  private readonly NOME_ARQUIVO = 'credenciais';

  constructor(repo: RepositorioArquivo, journal: JournalTransacaoService) {
    this.repo = repo;
    this.journal = journal;
  }

  public criarUsuario(dados: {
    usuario: string;
    senhaPlana: string;
    papel: PapelUsuario;
    usuarioResponsavel: string;
  }): Credencial {
    const credenciais = this.repo.carregarEntidade<Credencial[]>(this.NOME_ARQUIVO) || [];

    if (credenciais.some((c) => c.usuario.toLowerCase() === dados.usuario.toLowerCase())) {
      throw new Error(`O usuário "${dados.usuario}" já está cadastrado no sistema.`);
    }

    const salt = CriptografiaArquivo.gerarSalt();
    const hashSenha = CriptografiaArquivo.gerarHashSenha(dados.senhaPlana, salt);

    const novaCredencial: Credencial = {
      usuario: dados.usuario,
      hashSenha,
      salt,
      papel: dados.papel,
    };

    credenciais.push(novaCredencial);
    this.repo.salvarEntidade(this.NOME_ARQUIVO, credenciais);

    this.journal.registrar({
      operacao: 'CRIAR_USUARIO',
      entidade: 'Credencial',
      dadosDepois: { usuario: dados.usuario, papel: dados.papel },
      usuarioResponsavel: dados.usuarioResponsavel,
    });

    return novaCredencial;
  }

  public listarUsuarios(): Omit<Credencial, 'hashSenha' | 'salt'>[] {
    const credenciais = this.repo.carregarEntidade<Credencial[]>(this.NOME_ARQUIVO) || [];
    return credenciais.map(({ usuario, papel, ultimoAcesso }) => ({
      usuario,
      papel,
      ultimoAcesso,
    }));
  }
}