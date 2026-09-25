import * as fs from 'fs';
import * as path from 'path';
import { CriptografiaArquivo } from '../security/CriptografiaArquivo';
import { RepositorioArquivo } from '../persistence/RepositorioArquivo';
import { JournalTransacaoService } from '../persistence/JournalTransacao';
import { PapelUsuario } from '../domain/Enums';
import { Credencial, ConfiguracaoMestre } from '../domain/Entities';

export class ServicoProvisionamento {
  private dataDir: string;
  private configFile: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
    this.configFile = path.join(this.dataDir, 'config.json.enc');
  }

  /**
   * Verifica se o sistema já foi provisionado anteriormente
   */
  public precisaProvisionar(): boolean {
    return !fs.existsSync(this.configFile);
  }

  /**
   * Executa a inicialização do ambiente e gera as credenciais do admin inicial
   */
  public executarProvisionamento(senhaAdmin: string): { chaveMestra: string; admin: Credencial } {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // 1. Gerar Chave Mestra para Criptografia AES-256
    const chaveMestra = CriptografiaArquivo.gerarChave();
    const configData: ConfiguracaoMestre = {
      chaveMestra,
      criadoEm: new Date().toISOString(),
    };

    fs.writeFileSync(this.configFile, JSON.stringify(configData, null, 2), 'utf8');

    // 2. Instanciar persistência e journal temporários
    const journal = new JournalTransacaoService(this.dataDir);
    const repo = new RepositorioArquivo(this.dataDir, chaveMestra);

    // 3. Criar Credencial Inicial do Administrador com SHA-256 + Salt
    const salt = CriptografiaArquivo.gerarSalt();
    const adminCredencial: Credencial = {
      usuario: 'admin',
      hashSenha: CriptografiaArquivo.gerarHashSenha(senhaAdmin, salt),
      salt,
      papel: PapelUsuario.ADMINISTRADOR,
    };

    repo.salvarEntidade('credenciais', [adminCredencial]);

    // 4. Gravar no Journal de Transações (RNF04)
    journal.registrar({
      operacao: 'PROVISIONAMENTO_INICIAL',
      entidade: 'Configuracao',
      usuarioResponsavel: 'SYSTEM',
    });

    return { chaveMestra, admin: adminCredencial };
  }

  /**
   * Carrega a chave mestra gravada no primeiro boot
   */
  public carregarChaveMestra(): string {
    if (!fs.existsSync(this.configFile)) {
      throw new Error('O sistema ainda não foi provisionado.');
    }
    const rawConfig = fs.readFileSync(this.configFile, 'utf8');
    const config = JSON.parse(rawConfig) as ConfiguracaoMestre;
    return config.chaveMestra;
  }
}