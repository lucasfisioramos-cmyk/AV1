import { Credencial, Sessao } from '../domain/Entities';
import { PapelUsuario } from '../domain/Enums';
import { CriptografiaArquivo } from '../security/CriptografiaArquivo';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo';
import { JournalTransacaoService } from '../persistence/JournalTransacao';

export class ServicoAutenticacao {
  private repo: RepositorioArquivo;
  private journal: JournalTransacaoService;
  private readonly NOME_ARQUIVO = 'credenciais';
  private readonly TEMPO_EXPIRACAO_MINUTOS = 30; // 30 min inatividade (RF02)

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

    // Criar Sessão
    const agora = new Date();
    const expiracao = new Date(agora.getTime() + this.TEMPO_EXPIRACAO_MINUTOS * 60 * 1000);

    const sessao: Sessao = {
      token: Math.random().toString(36).substring(2) + Date.now().toString(36),
      usuario: cred.usuario,
      papel: cred.papel,
      criacao: agora.toISOString(),
      expiracao: expiracao.toISOString(),
    };

    this.journal.registrar({
      operacao: 'LOGIN_SUCESSO',
      entidade: 'Credencial',
      usuarioResponsavel: cred.usuario,
    });

    return sessao;
  }

  public isSessaoValida(sessao: Sessao): boolean {
    const agora = new Date();
    const expiraEm = new Date(sessao.expiracao);
    return agora < expiraEm;
  }
}