import { Credencial, Sessao } from '../domain/Entities.js';
// import { PapelUsuario } from '../domain/Enums.js';
import { CriptografiaArquivo } from '../security/CriptografiaArquivo.js';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo.js';
import { JournalTransacaoService } from '../persistence/JournalTransacao.js';

export class ServicoAutenticacao {
  private repo: RepositorioArquivo;
  private journal: JournalTransacaoService;
  private readonly NOME_ARQUIVO = 'credenciais';
  private readonly TEMPO_EXPIRACAO_MINUTOS = 30; // 30 min inatividade

  constructor(repo: RepositorioArquivo, journal: JournalTransacaoService) {
    this.repo = repo;
    this.journal = journal;
  }

  public login(usuarioInput: string, senhaInput: string): Sessao | null {
    const credenciais = this.repo.carregarEntidade<Credencial[]>(this.NOME_ARQUIVO) || [];
    const cred = credenciais.find((c) => c.usuario === usuarioInput);

    if (!cred) return null;

    const hashCalculado = CriptografiaArquivo.gerarHashSenha(senhaInput, cred.salt);
    if (hashCalculado !== cred.hashSenha) return null;

    const agora = new Date();
    const expiracao = new Date(agora.getTime() + this.TEMPO_EXPIRACAO_MINUTOS * 60 * 1000);

    const sessao: Sessao = {
      token: Math.random().toString(36).substring(2) + Date.now().toString(36),
      usuario: cred.usuario,
      papel: cred.papel,
      criacao: agora.toISOString(),
      expiracao: expiracao.toISOString(),
      ativa: true,
    };

    this.journal.registrar({
      operacao: 'LOGIN_SUCESSO',
      entidade: 'Credencial',
      usuarioResponsavel: cred.usuario,
    });

    return sessao;
  }

public logout(sessao: Sessao): void {
  if (!sessao) {
    throw new Error('Sessão inválida ou não fornecida.');
  }


  if (sessao.ativa === false) {
    throw new Error('A sessão informada já está inativa.');
  }

  sessao.ativa = false;

  this.journal.registrar({
    operacao: 'LOGOUT',
    entidade: 'Sessao',
    dadosAntes: { usuario: sessao.usuario, ativa: true },
    dadosDepois: { usuario: sessao.usuario, ativa: false },
    usuarioResponsavel: sessao.usuario,
  });
}

  public isSessaoValida(sessao: Sessao): boolean {
    const agora = new Date();
    const expiraEm = new Date(sessao.expiracao);
    return agora < expiraEm;
  }
}