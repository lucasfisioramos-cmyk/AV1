import * as fs from 'fs';
import * as path from 'path';
import { CriptografiaArquivo } from '../security/CriptografiaArquivo';

export class RepositorioArquivo {
  private diretorioBase: string;
  private chaveMestra: string;

  constructor(diretorioBase: string = './data', chaveMestra: string) {
    this.diretorioBase = diretorioBase;
    this.chaveMestra = chaveMestra;

    if (!fs.existsSync(this.diretorioBase)) {
      fs.mkdirSync(this.diretorioBase, { recursive: true });
    }
  }

  /**
   * Salva entidade de forma atômica utilizando arquivo temporário (RNF03)
   */
  public salvarEntidade(nomeArquivo: string, dados: any): void {
    const caminhoFinal = path.join(this.diretorioBase, `${nomeArquivo}.json.enc`);
    const caminhoTemp = path.join(this.diretorioBase, `${nomeArquivo}.${Date.now()}.tmp`);

    const conteudoJson = JSON.stringify(dados, null, 2);
    const conteudoCifrado = CriptografiaArquivo.cifrar(conteudoJson, this.chaveMestra);

    // 1. Escreve no arquivo temporário
    fs.writeFileSync(caminhoTemp, conteudoCifrado, 'utf8');

    // 2. Transfere atomicamente
    fs.renameSync(caminhoTemp, caminhoFinal);
  }

  /**
   * Lê e decifra arquivo de dados
   */
  public carregarEntidade<T>(nomeArquivo: string): T | null {
    const caminhoFinal = path.join(this.diretorioBase, `${nomeArquivo}.json.enc`);

    if (!fs.existsSync(caminhoFinal)) {
      return null;
    }

    try {
      const conteudoCifrado = fs.readFileSync(caminhoFinal, 'utf8');
      const conteudoTexto = CriptografiaArquivo.decifrar(conteudoCifrado, this.chaveMestra);
      return JSON.parse(conteudoTexto) as T;
    } catch (e) {
      console.error(`Erro ao decifrar/carregar o arquivo ${nomeArquivo}:`, e);
      return null;
    }
  }
}