import { Credencial } from '../domain/Entities.js';
import { PapelUsuario } from '../domain/Enums.js';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo.js';
import { JournalTransacaoService } from '../persistence/JournalTransacao.js';
import { CriptografiaArquivo } from '../security/CriptografiaArquivo.js';

export interface EditarUsuarioParams {
  usuario: string;
  novaSenhaPlana?: string;
  novoPapel?: PapelUsuario;
  usuarioResponsavel: string;
}

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
    if (!Object.values(PapelUsuario).includes(dados.papel)) {
      throw new Error('Papel de usuário inválido.');
    }
    if (!dados.usuario.trim() || !dados.senhaPlana) {
      throw new Error('Usuário e senha são obrigatórios.');
    }
    const responsavel = this.repo.listarEntidades<Credencial>(this.NOME_ARQUIVO)
      .find((credencial) => credencial.usuario.toLowerCase() === dados.usuarioResponsavel.toLowerCase());
    if (!responsavel || responsavel.papel !== PapelUsuario.ADMINISTRADOR) {
      throw new Error('Somente um administrador cadastrado pode criar usuários.');
    }

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
      ultimoAcesso: new Date().toISOString(),
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

  // Sobrecarga e suporte tanto para chamadas com objeto quanto para chamadas posicionais da CLI
  public editarUsuario(
    dadosOuUsuario: EditarUsuarioParams | string,
    novoPapelOuResponsavel?: PapelUsuario | string,
    usuarioResponsavelSePosicional?: string
  ): Credencial {
    let params: EditarUsuarioParams;

    if (typeof dadosOuUsuario === 'string') {
      params = {
        usuario: dadosOuUsuario,
        novoPapel: novoPapelOuResponsavel as PapelUsuario,
        usuarioResponsavel: usuarioResponsavelSePosicional || 'SISTEMA',
      };
    } else {
      params = dadosOuUsuario;
    }
    if (params.novoPapel && !Object.values(PapelUsuario).includes(params.novoPapel)) {
      throw new Error('Papel de usuário inválido.');
    }

    const credenciais = this.repo.carregarEntidade<Credencial[]>(this.NOME_ARQUIVO) || [];

    // 1. Localiza a conta a ser editada e a conta de quem executa a ação
    const credencialExistente = credenciais.find(
      (c) => c.usuario.toLowerCase() === params.usuario.toLowerCase()
    );

    if (!credencialExistente) {
      throw new Error(`O usuário "${params.usuario}" não foi encontrado.`);
    }

    const responsavel = credenciais.find(
      (c) => c.usuario.toLowerCase() === params.usuarioResponsavel.toLowerCase()
    );

    if (!responsavel) {
      throw new Error(`O usuário responsável "${params.usuarioResponsavel}" não foi encontrado.`);
    }

    // Identifica o nível de permissão do responsável
    const ehAdmin = responsavel.papel === PapelUsuario.ADMINISTRADOR;
    const ehOProprioUsuario = params.usuario.toLowerCase() === params.usuarioResponsavel.toLowerCase();

    // 2. Validação geral de acesso: Deve ser Admin OU o próprio usuário
    if (!ehAdmin && !ehOProprioUsuario) {
      throw new Error(`Acesso negado: você só pode editar suas próprias informações.`);
    }

    // 3. Captura o estado ORIGINAL para o log de auditoria do Journal
    const dadosAntes = {
      usuario: credencialExistente.usuario,
      papel: credencialExistente.papel,
    };

    // 4. Regra para Alteração de Papel: EXCLUSIVO para ADMIN
    if (params.novoPapel && params.novoPapel !== credencialExistente.papel) {
      if (!ehAdmin) {
        throw new Error(`Acesso negado: apenas administradores podem alterar o papel de um usuário.`);
      }

      // Trava de segurança: Impede rebaixar o único administrador do sistema
      if (credencialExistente.papel === PapelUsuario.ADMINISTRADOR) {
        const totalAdmins = credenciais.filter((c) => c.papel === PapelUsuario.ADMINISTRADOR).length;
        if (totalAdmins <= 1) {
          throw new Error(`Não é possível alterar o papel do usuário "${params.usuario}" pois ele é o único administrador do sistema.`);
        }
      }

      credencialExistente.papel = params.novoPapel;
    }

    // 5. Atualização de Senha (Admin ou Próprio Usuário)
    if (params.novaSenhaPlana) {
      const salt = CriptografiaArquivo.gerarSalt();
      const hashSenha = CriptografiaArquivo.gerarHashSenha(params.novaSenhaPlana, salt);
      credencialExistente.hashSenha = hashSenha;
      credencialExistente.salt = salt;
    }

    // 6. Persiste as alterações no repositório
    this.repo.salvarEntidade(this.NOME_ARQUIVO, credenciais);

    // 7. Registo de Auditoria no Journal
    this.journal.registrar({
      operacao: 'EDITAR_USUARIO',
      entidade: 'Credencial',
      dadosAntes,
      dadosDepois: { usuario: credencialExistente.usuario, papel: credencialExistente.papel },
      usuarioResponsavel: params.usuarioResponsavel,
    });

    return credencialExistente;
  }

  public listarUsuarios(): Omit<Credencial, 'hashSenha' | 'salt'>[] {
    const credenciais = this.repo.carregarEntidade<Credencial[]>(this.NOME_ARQUIVO) || [];
    return credenciais.map(({ usuario, papel, ultimoAcesso }) => ({
      usuario,
      papel,
      ultimoAcesso,
    }));
  }

  public removerUsuario(usuario: string, usuarioResponsavel: string): void {
    const credenciais = this.repo.carregarEntidade<Credencial[]>(this.NOME_ARQUIVO) || [];
    const responsavel = credenciais.find(
      (credencial) => credencial.usuario.toLowerCase() === usuarioResponsavel.toLowerCase()
    );
    if (!responsavel || responsavel.papel !== PapelUsuario.ADMINISTRADOR) {
      throw new Error('Somente um administrador pode remover usuários.');
    }

    const index = credenciais.findIndex((c) => c.usuario.toLowerCase() === usuario.toLowerCase());

    if (index === -1) {
      throw new Error(`O usuário "${usuario}" não foi encontrado.`);
    }

    const credencialRemover = credenciais[index];

    if (credencialRemover.papel === PapelUsuario.ADMINISTRADOR) {
      const totalAdmins = credenciais.filter((c) => c.papel === PapelUsuario.ADMINISTRADOR).length;

      if (totalAdmins <= 1) {
        throw new Error(`Não é possível remover o usuário "${usuario}" pois ele é o único administrador do sistema.`);
      }
    }

    const dadosAntes = {
      usuario: credencialRemover.usuario,
      papel: credencialRemover.papel,
    };

    credenciais.splice(index, 1);
    this.repo.salvarEntidade(this.NOME_ARQUIVO, credenciais);

    this.journal.registrar({
      operacao: 'REMOVER_USUARIO',
      entidade: 'Credencial',
      dadosAntes,
      usuarioResponsavel,
    });
  }
}