import * as fs from 'fs';
import * as path from 'path';
import { CriptografiaArquivo } from '../security/CriptografiaArquivo.js';

export class RepositorioArquivo {
  private diretorioBase: string;
  private chaveMestra: string;

  constructor(
    diretorioBase: string,
    chaveMestra: string
  ) {
    this.diretorioBase = diretorioBase;
    this.chaveMestra = chaveMestra;

    if (!fs.existsSync(this.diretorioBase)) {
      fs.mkdirSync(this.diretorioBase, { recursive: true });
    }
  }

  public salvarEntidade(nomeArquivo: string, dados: any): void {
    const caminhoFinal = path.join(this.diretorioBase, `${nomeArquivo}.json.enc`);
    const caminhoTemp = path.join(this.diretorioBase, `${nomeArquivo}_${Date.now()}.tmp`);

    const jsonTexto = JSON.stringify(dados, null, 2);
    const conteudoCifrado = CriptografiaArquivo.cifrar(jsonTexto, this.chaveMestra);

    // Escrita Atômica: grava no temporário e renomeia
    fs.writeFileSync(caminhoTemp, conteudoCifrado, 'utf8');
    fs.renameSync(caminhoTemp, caminhoFinal);
  }

  public carregarEntidade<T>(nomeArquivo: string): T | null {
    const caminhoFinal = path.join(this.diretorioBase, `${nomeArquivo}.json.enc`);

    if (!fs.existsSync(caminhoFinal)) {
      return null;
    }

    try {
      const conteudoCifrado = fs.readFileSync(caminhoFinal, 'utf8');
      const jsonTexto = CriptografiaArquivo.decifrar(conteudoCifrado, this.chaveMestra);
      return JSON.parse(jsonTexto) as T;
    } catch (erro) {
      console.error(`[ERRO LEITURA REPOSITÓRIO]: Falha ao carregar ${nomeArquivo}.json.enc`);
      return null;
    }
  }

  public listarEntidades<T>(nomeArquivo: string): T[] {
    const dados = this.carregarEntidade<T[]>(nomeArquivo);
    return Array.isArray(dados) ? dados : [];
  }
}