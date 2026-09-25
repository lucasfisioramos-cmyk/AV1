export interface ComandoParseado {
  acaoPrincipal: string;
  subAcao: string;
  posicionais: string[];
  flags: Record<string, string>;
}

export class CommandParser {
  public static parse(linhaEntrada: string): ComandoParseado {
    const tokens = linhaEntrada.trim().split(/\s+/);
    const acaoPrincipal = tokens[0] || '';
    const subAcao = tokens[1] && !tokens[1].startsWith('--') ? tokens[1] : '';

    const inicioArgs = subAcao ? 2 : 1;
    const posicionais: string[] = [];
    const flags: Record<string, string> = {};

    for (let i = inicioArgs; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.startsWith('--')) {
        const chave = token.substring(2);
        const proximoToken = tokens[i + 1];

        if (proximoToken && !proximoToken.startsWith('--')) {
          flags[chave] = proximoToken;
          i++; // avança o valor da flag
        } else {
          flags[chave] = 'true';
        }
      } else {
        posicionais.push(token);
      }
    }

    return { acaoPrincipal, subAcao, posicionais, flags };
  }
}