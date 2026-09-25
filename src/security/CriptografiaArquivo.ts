import * as crypto from 'crypto';

export class CriptografiaArquivo {
  private static readonly ALGORITHM = 'aes-256-cbc';

  /**
   * Cifra o conteúdo utilizando AES-256-CBC (RNF02)
   */
  public static cifrar(dados: string, chave: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(chave).digest();
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    let encrypted = cipher.update(dados, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decifra dados em AES-256-CBC (RNF02)
   */
  public static decifrar(dadosCifrados: string, chave: string): string {
    const [ivHex, encryptedText] = dadosCifrados.split(':');
    if (!ivHex || !encryptedText) {
      throw new Error('Formato de dados cifrados inválido.');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.createHash('sha256').update(chave).digest();
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Gera o hash SHA-256 com Salt para senhas (RF02)
   */
  public static gerarHashSenha(senha: string, salt: string): string {
    return crypto.createHash('sha256').update(senha + salt).digest('hex');
  }

  public static gerarSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  public static gerarChave(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}