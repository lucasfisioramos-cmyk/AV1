import * as fs from 'fs';
import * as path from 'path';

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
  private readonly TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB (RF09)

  constructor(diretorioBase: string = './data') {
    if (!fs.existsSync(diretorioBase)) {
      fs.mkdirSync(diretorioBase, { recursive: true });
    }
    this.arquivoJournal = path.join(diretorioBase, 'journal.log');
  }

  public registrar(entrada: Omit<EntradaJournal, 'id' | 'timestamp'>): void {
    this.verificarRotação();

    const registroCompleto: EntradaJournal = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      ...entrada,
    };

    const linha = JSON.stringify(registroCompleto) + '\n';
    fs.appendFileSync(this.arquivoJournal, linha, 'utf8');
  }

  private verificarRotação(): void {
    if (fs.existsSync(this.arquivoJournal)) {
      const stats = fs.statSync(this.arquivoJournal);
      if (stats.size >= this.TAMANHO_MAXIMO_BYTES) {
        const timestampRot = new Date().toISOString().replace(/[:.]/g, '-');
        const arquivoRotacionado = `${this.arquivoJournal}.${timestampRot}.bak`;
        fs.renameSync(this.arquivoJournal, arquivoRotacionado);
      }
    }
  }
}