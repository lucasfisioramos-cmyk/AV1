import { Credencial, Sessao } from '../domain/Entities.js';
import { CriptografiaArquivo } from '../security/CriptografiaArquivo.js';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo.js';
import { JournalTransacaoService } from '../persistence/JournalTransacao.js';

export class ServicoAutenticacao {
  private repo: RepositorioArquivo;
  private journal: JournalTransacaoService;
  private sessoesAtivas: Map<string, Sessao> = new Map();

  private readonly NOME_ARQUIVO = 'credenciais';
  // 30 minutos em milissegundos (30 * 60 * 1000 = 1.800.000 ms)
  private readonly TEMPO_EXPIRACAO_MS = 30 * 60 * 1000;

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

    const sessao: Sessao = {
      token: Math.random().toString(36).substring(2) + Date.now().toString(36),
      usuario: cred.usuario,
      papel: cred.papel,
      criacao: agora.toISOString(),
      ultimoAcesso: agora.toISOString(),
      ativa: true,
    };

    // Salva a sessão no Map interno para controle contínuo
    this.sessoesAtivas.set(sessao.token, sessao);

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

    if (!sessao.ativa || !this.sessoesAtivas.has(sessao.token)) {
      throw new Error('A sessão informada não está ativa.');
    }

    sessao.ativa = false;
    this.sessoesAtivas.delete(sessao.token);

    this.journal.registrar({
      operacao: 'LOGOUT',
      entidade: 'Sessao',
      dadosAntes: { usuario: sessao.usuario, ativa: true },
      dadosDepois: { usuario: sessao.usuario, ativa: false },
      usuarioResponsavel: sessao.usuario,
    });
  }

  /**
   * Valida e RENOVA a sessão caso o usuário continue ativo.
   * Se o tempo de inatividade for maior que 30 minutos, a sessão é encerrada.
   */
  public isSessaoValida(sessao: Sessao): boolean {
    if (!sessao || !sessao.ativa) return false;
    const sessaoRegistrada = this.sessoesAtivas.get(sessao.token);
    if (!sessaoRegistrada) return false;
    const agora = new Date();
    const ultimoAcesso = new Date(sessaoRegistrada.ultimoAcesso);

    if (Number.isNaN(ultimoAcesso.getTime())) return false;

    if (agora.getTime() - ultimoAcesso.getTime() > this.TEMPO_EXPIRACAO_MS) {
      sessao.ativa = false;
      sessaoRegistrada.ativa = false;
      this.sessoesAtivas.delete(sessao.token);
      return false;
    }

    return true;
  }

  public registrarAtividade(sessao: Sessao): void {
    if (!this.isSessaoValida(sessao)) {
      throw new Error('Sessão inválida ou expirada.');
    }

    const novoUltimoAcesso = new Date().toISOString();
    sessao.ultimoAcesso = novoUltimoAcesso;
    const sessaoRegistrada = this.sessoesAtivas.get(sessao.token);
    if (sessaoRegistrada) sessaoRegistrada.ultimoAcesso = novoUltimoAcesso;
  }
}