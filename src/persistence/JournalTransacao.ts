import * as fs from 'fs';
import * as path from 'path';
import { CriptografiaArquivo } from '../security/CriptografiaArquivo.js';

export interface EntradaJournal {
  id: string;
  timestamp: string;
  operacao: string;
  entidade: string;
  dadosAntes?: any;
  dadosDepois?: any;
  usuarioResponsavel: string;
}

export class JournalTransacaoService {
  private arquivoJournal: string;
  private readonly TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB
  private readonly DIAS_RETENCAO = 180; // 180 dias de retenção
  private chaveMestra: string;

  constructor(
    chaveMestra: string,
    diretorioBase: string = './data'
  ) {
    if (!fs.existsSync(diretorioBase)) {
      fs.mkdirSync(diretorioBase, { recursive: true });
    }
    this.arquivoJournal = path.join(diretorioBase, 'journal.log.enc');
    this.chaveMestra = chaveMestra;
  }

  public registrar(entrada: Omit<EntradaJournal, 'id' | 'timestamp'>): void {
    // 1. Aplica rotação por tamanho (10MB) e expurgo por retenção (180 dias)
    this.verificarManutencaoLogs();

    const registroCompleto: EntradaJournal = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      ...entrada,
    };

    // 2. Cifra a nova linha de log antes de persisti-la
    const linhaTexto = JSON.stringify(registroCompleto);
    const linhaCifrada = CriptografiaArquivo.cifrar(linhaTexto, this.chaveMestra) + '\n';

    fs.appendFileSync(this.arquivoJournal, linhaCifrada, 'utf8');
  }

  public listar(limite: number = 20): EntradaJournal[] {
    if (!Number.isInteger(limite) || limite < 1) {
      throw new Error('O limite de registros deve ser um inteiro maior que zero.');
    }
    if (!fs.existsSync(this.arquivoJournal)) return [];

    const linhas = fs.readFileSync(this.arquivoJournal, 'utf8')
      .split('\n')
      .filter((linha) => linha.trim().length > 0)
      .slice(-limite);

    return linhas.map((linha, indice) => {
      try {
        const texto = CriptografiaArquivo.decifrar(linha, this.chaveMestra);
        return JSON.parse(texto) as EntradaJournal;
      } catch (erro) {
        throw new Error(`Não foi possível decifrar o registro ${indice + 1} do journal.`, {
          cause: erro,
        });
      }
    });
  }

  private verificarManutencaoLogs(): void {
    if (!fs.existsSync(this.arquivoJournal)) return;

    // A. Rotação automática se exceder 10 MB
    const stats = fs.statSync(this.arquivoJournal);
    if (stats.size >= this.TAMANHO_MAXIMO_BYTES) {
      const timestampRot = new Date().toISOString().replace(/[:.]/g, '-');
      const arquivoRotacionado = `${this.arquivoJournal}.${timestampRot}.bak`;
      fs.renameSync(this.arquivoJournal, arquivoRotacionado);
      return;
    }

    // B. Expurgo automático de registros com mais de 180 dias
    this.expurgarRegistrosAntigos();
  }

  private expurgarRegistrosAntigos(): void {
    try {
      const conteudo = fs.readFileSync(this.arquivoJournal, 'utf8');
      const linhas = conteudo.split('\n').filter((l) => l.trim().length > 0);

      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - this.DIAS_RETENCAO);

      const linhasValidas: string[] = [];

      for (const linha of linhas) {
        try {
          // Decifra para verificar o timestamp do registro
          const decifrado = CriptografiaArquivo.decifrar(linha, this.chaveMestra);
          const registro: EntradaJournal = JSON.parse(decifrado);

          if (new Date(registro.timestamp) >= dataLimite) {
            linhasValidas.push(linha);
          }
        } catch {
          // Mantém a linha caso ocorra falha de leitura pontual
          linhasValidas.push(linha);
        }
      }

      // Reestrutura o arquivo mantendo apenas os logs dentro da janela de 180 dias
      if (linhasValidas.length !== linhas.length) {
        fs.writeFileSync(
          this.arquivoJournal,
          linhasValidas.length > 0 ? linhasValidas.join('\n') + '\n' : '',
          'utf8'
        );
      }
    } catch {
      // Falha ao ler ou processar o log não interrompe o fluxo principal
    }
  }
}